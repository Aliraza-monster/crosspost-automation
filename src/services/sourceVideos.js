const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');
const env = require('../config/env');

function toIsoDate(entry) {
  if (entry.timestamp) {
    return new Date(entry.timestamp * 1000).toISOString();
  }

  if (entry.upload_date && /^\d{8}$/.test(String(entry.upload_date))) {
    const value = String(entry.upload_date);
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
    return iso;
  }

  return null;
}

function normalizeEntry(entry, fallbackIndex) {
  const createdAt = toIsoDate(entry);
  const url = entry.webpage_url || entry.url;

  return {
    sourceId: entry.id || `${fallbackIndex}`,
    url,
    title: entry.title || 'Untitled video',
    description: entry.description || '',
    createdAt,
  };
}

async function listSourceVideos(sourceUrl) {
  const rawMetadata = await youtubedl(sourceUrl, {
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    quiet: true,
    flatPlaylist: false,
    ignoreErrors: true,
    noCheckCertificates: true,
  });

  let metadata = rawMetadata;
  if (typeof rawMetadata === 'string') {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      throw new Error('Could not parse source metadata from downloader output.');
    }
  }

  const entries = Array.isArray(metadata.entries) ? metadata.entries : [metadata];
  const normalized = entries
    .filter((item) => item && (item.webpage_url || item.url || item.id))
    .map((item, index) => normalizeEntry(item, index));

  normalized.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    if (a.createdAt) {
      return -1;
    }

    if (b.createdAt) {
      return 1;
    }

    return String(a.sourceId).localeCompare(String(b.sourceId));
  });

  return normalized;
}

function safeFileBase(input) {
  return String(input)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .slice(0, 70);
}

async function downloadVideo(url, fileBaseName) {
  if (!fs.existsSync(env.tempDir)) {
    fs.mkdirSync(env.tempDir, { recursive: true });
  }

  const safeBase = safeFileBase(fileBaseName);
  const template = path.join(env.tempDir, `${safeBase}.%(ext)s`);

  await youtubedl(url, {
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
    noPlaylist: true,
    format: 'bv*+ba/b',
    mergeOutputFormat: 'mp4',
    output: template,
  });

  const files = fs.readdirSync(env.tempDir);
  const downloaded = files
    .filter((name) => name.startsWith(`${safeBase}.`) && !name.endsWith('.part'))
    .map((name) => path.join(env.tempDir, name));

  if (downloaded.length === 0) {
    throw new Error('Video download completed but output file was not found.');
  }

  downloaded.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return downloaded[0];
}

function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  listSourceVideos,
  downloadVideo,
  cleanupFile,
};
