const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const env = require('../config/env');

const graphBaseUrl = `https://graph.facebook.com/${env.facebookGraphVersion}`;

async function fetchManagedPages(userAccessToken) {
  const url = `${graphBaseUrl}/me/accounts`;
  const response = await axios.get(url, {
    params: {
      fields: 'id,name,access_token,category',
      limit: 200,
      access_token: userAccessToken,
    },
  });

  return response.data.data || [];
}

async function uploadVideoToPage({
  pageId,
  pageAccessToken,
  videoPath,
  title,
  description,
}) {
  const form = new FormData();
  form.append('access_token', pageAccessToken);
  form.append('title', title || '');
  form.append('description', description || title || '');
  form.append('published', 'true');
  form.append('source', fs.createReadStream(videoPath));

  const response = await axios.post(`${graphBaseUrl}/${pageId}/videos`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return response.data;
}

module.exports = {
  fetchManagedPages,
  uploadVideoToPage,
};
