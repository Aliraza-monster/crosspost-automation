const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number.parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  appName: process.env.APP_NAME || 'SMM Cross Automation',
  easypaisaNumber: process.env.EASYPAISA_NUMBER || '+923053120875',
  sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '../../storage/app.db'),
  tempDir: process.env.TEMP_DIR || path.join(__dirname, '../../storage/tmp'),
  ytdlpBinary: process.env.YTDLP_BINARY || '/usr/local/bin/yt-dlp',
  instagramCookiesPath: process.env.INSTAGRAM_COOKIES_PATH || '',
  facebookGraphVersion: process.env.FACEBOOK_GRAPH_VERSION || 'v23.0',
  schedulerCron: process.env.SCHEDULER_CRON || '* * * * *',
  timezone: process.env.TIMEZONE || 'America/Los_Angeles',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123456',
};

module.exports = env;
