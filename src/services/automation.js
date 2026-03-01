const cron = require('node-cron');
const db = require('../config/db');
const env = require('../config/env');
const { addHours, isoNow } = require('../utils/dates');
const { listSourceVideos, downloadVideo, cleanupFile } = require('./sourceVideos');
const { uploadVideoToPage } = require('./facebook');
const { getTokenBalance, adjustUserTokens } = require('./tokens');

const inFlightJobs = new Set();
let schedulerStarted = false;

function logJob(jobId, level, message, metadata = null) {
  db.prepare(
    'INSERT INTO automation_logs (job_id, level, message, meta_json) VALUES (?, ?, ?, ?)',
  ).run(jobId, level, message, metadata ? JSON.stringify(metadata) : null);
}

function updateJobSchedule(jobId, nextRunAt) {
  db.prepare('UPDATE automation_jobs SET next_run_at = ?, updated_at = ? WHERE id = ?').run(
    nextRunAt,
    isoNow(),
    jobId,
  );
}

function fetchJobById(jobId) {
  return db.prepare('SELECT * FROM automation_jobs WHERE id = ?').get(jobId);
}

async function processSingleJob(job) {
  if (inFlightJobs.has(job.id)) {
    return;
  }

  inFlightJobs.add(job.id);
  let downloadedPath = null;

  try {
    const tokenBalance = getTokenBalance(job.user_id);
    if (tokenBalance <= 0) {
      db.prepare('UPDATE automation_jobs SET status = ?, updated_at = ? WHERE id = ?').run(
        'paused',
        isoNow(),
        job.id,
      );
      logJob(job.id, 'error', 'Job paused because account token balance is 0.');
      return;
    }

    const videos = await listSourceVideos(job.source_url);
    if (videos.length === 0) {
      logJob(job.id, 'warn', 'No videos were found on the source account.');
      updateJobSchedule(job.id, addHours(null, 24));
      return;
    }

    const nextIndex = Number.parseInt(job.next_media_index || 0, 10);
    if (nextIndex >= videos.length) {
      logJob(job.id, 'info', 'No new source videos to publish yet.');
      updateJobSchedule(job.id, addHours(null, 24));
      return;
    }

    const selected = videos[nextIndex];
    downloadedPath = await downloadVideo(selected.url, `job_${job.id}_${nextIndex}_${Date.now()}`);

    const upload = await uploadVideoToPage({
      pageId: job.facebook_page_id,
      pageAccessToken: job.facebook_page_token,
      videoPath: downloadedPath,
      title: selected.title,
      description: selected.description,
    });

    const newTokenBalance = adjustUserTokens({
      userId: job.user_id,
      deltaTokens: -1,
      reason: `Token used for job "${job.name}"`,
      meta: {
        jobId: job.id,
        sourceVideo: selected.url,
      },
    });

    db.prepare(`
      UPDATE automation_jobs
      SET next_media_index = ?,
          last_posted_url = ?,
          last_posted_at = ?,
          next_run_at = ?,
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `).run(
      nextIndex + 1,
      selected.url,
      isoNow(),
      addHours(null, 24),
      isoNow(),
      job.id,
    );

    logJob(job.id, 'info', 'Video uploaded to Facebook successfully.', {
      sourceVideo: selected.url,
      facebookVideoId: upload.id || null,
      title: selected.title,
      tokensRemaining: newTokenBalance,
    });
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    logJob(job.id, 'error', 'Automation run failed.', { error: message });
    if (/insufficient token balance/i.test(message)) {
      db.prepare('UPDATE automation_jobs SET status = ?, updated_at = ? WHERE id = ?').run(
        'paused',
        isoNow(),
        job.id,
      );
      logJob(job.id, 'error', 'Job paused because tokens were exhausted during run.');
      return;
    }

    updateJobSchedule(job.id, addHours(null, 1));
  } finally {
    cleanupFile(downloadedPath);
    inFlightJobs.delete(job.id);
  }
}

async function processDueJobs() {
  const jobs = db
    .prepare(
      `
      SELECT *
      FROM automation_jobs
      WHERE status = 'active'
        AND (next_run_at IS NULL OR next_run_at <= ?)
      ORDER BY COALESCE(next_run_at, created_at) ASC
      LIMIT 20
    `,
    )
    .all(isoNow());

  for (const job of jobs) {
    await processSingleJob(job);
  }
}

async function runJobNow(jobId) {
  const job = fetchJobById(jobId);
  if (!job) {
    throw new Error('Job not found.');
  }

  await processSingleJob(job);
}

function startScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  cron.schedule(
    env.schedulerCron,
    () => {
      processDueJobs().catch((error) => {
        console.error('Scheduler error:', error.message);
      });
    },
    {
      timezone: env.timezone,
    },
  );

  setTimeout(() => {
    processDueJobs().catch((error) => {
      console.error('Initial scheduler run failed:', error.message);
    });
  }, 4000);

  console.log(`Scheduler started (${env.schedulerCron}, timezone ${env.timezone})`);
}

module.exports = {
  startScheduler,
  processDueJobs,
  runJobNow,
  logJob,
};
