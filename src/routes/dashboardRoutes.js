const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { setFlash } = require('../utils/flash');
const { fetchManagedPages } = require('../services/facebook');
const { getActiveSubscription } = require('../services/subscriptions');
const { runJobNow } = require('../services/automation');
const { isoNow } = require('../utils/dates');

const router = express.Router();

function getJobCount(userId) {
  return db
    .prepare("SELECT COUNT(*) AS count FROM automation_jobs WHERE user_id = ? AND status != 'archived'")
    .get(userId).count;
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_jobs,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_jobs,
        SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused_jobs
      FROM automation_jobs
      WHERE user_id = ? AND status != 'archived'
    `,
    )
    .get(req.user.id);

  const upcomingJobs = db
    .prepare(
      `
      SELECT id, name, source_platform, source_url, facebook_page_name, next_media_index, next_run_at, status
      FROM automation_jobs
      WHERE user_id = ? AND status != 'archived'
      ORDER BY COALESCE(next_run_at, created_at) ASC
      LIMIT 6
    `,
    )
    .all(req.user.id);

  const recentLogs = db
    .prepare(
      `
      SELECT l.level, l.message, l.created_at, j.name AS job_name
      FROM automation_logs l
      JOIN automation_jobs j ON j.id = l.job_id
      WHERE j.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT 8
    `,
    )
    .all(req.user.id);

  const subscription = getActiveSubscription(req.user.id);

  res.render('dashboard/index', {
    title: 'Dashboard',
    stats,
    upcomingJobs,
    recentLogs,
    subscription,
  });
});

router.get('/jobs', (req, res) => {
  const jobs = db
    .prepare(
      `
      SELECT id, name, source_platform, source_url, facebook_page_name, next_media_index,
             last_posted_at, next_run_at, status, created_at
      FROM automation_jobs
      WHERE user_id = ? AND status != 'archived'
      ORDER BY created_at DESC
    `,
    )
    .all(req.user.id);

  const subscription = getActiveSubscription(req.user.id);

  res.render('dashboard/jobs', {
    title: 'Automation Jobs',
    jobs,
    subscription,
  });
});

router.get('/jobs/new', (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  res.render('dashboard/new-job', {
    title: 'Create Automation Job',
    subscription,
  });
});

router.post('/facebook-pages/fetch', async (req, res) => {
  const userToken = String(req.body.userToken || '').trim();
  if (!userToken) {
    return res.status(400).json({ error: 'Facebook user access token is required.' });
  }

  try {
    const pages = await fetchManagedPages(userToken);
    return res.json({
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
      })),
    });
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    return res.status(400).json({ error: message });
  }
});

router.post('/jobs', (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  if (!subscription) {
    setFlash(req, 'error', 'You need an active subscription before creating automation jobs.');
    return res.redirect('/dashboard/subscription');
  }

  const currentJobs = getJobCount(req.user.id);
  if (currentJobs >= subscription.max_jobs) {
    setFlash(
      req,
      'error',
      `Your plan allows ${subscription.max_jobs} active jobs. Upgrade or ask admin for a higher plan.`,
    );
    return res.redirect('/dashboard/jobs');
  }

  const name = String(req.body.name || '').trim();
  const sourcePlatform = String(req.body.sourcePlatform || '').trim().toLowerCase();
  const sourceUrl = String(req.body.sourceUrl || '').trim();
  const facebookUserToken = String(req.body.facebookUserToken || '').trim();
  const facebookPageId = String(req.body.facebookPageId || '').trim();
  const facebookPageName = String(req.body.facebookPageName || '').trim();
  const facebookPageToken = String(req.body.facebookPageToken || '').trim();

  if (!name || !sourceUrl || !facebookUserToken || !facebookPageId || !facebookPageToken) {
    setFlash(req, 'error', 'Fill all required fields before saving the automation job.');
    return res.redirect('/dashboard/jobs/new');
  }

  if (!['instagram', 'tiktok'].includes(sourcePlatform)) {
    setFlash(req, 'error', 'Source platform must be Instagram or TikTok.');
    return res.redirect('/dashboard/jobs/new');
  }

  const result = db.prepare(`
    INSERT INTO automation_jobs (
      user_id, name, source_platform, source_url,
      facebook_user_token, facebook_page_id, facebook_page_name, facebook_page_token,
      next_media_index, next_run_at, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?)
  `).run(
    req.user.id,
    name,
    sourcePlatform,
    sourceUrl,
    facebookUserToken,
    facebookPageId,
    facebookPageName || facebookPageId,
    facebookPageToken,
    isoNow(),
    isoNow(),
  );

  setImmediate(() => {
    runJobNow(Number(result.lastInsertRowid)).catch(() => {});
  });

  setFlash(req, 'success', 'Automation job created. First run starts immediately with oldest source video.');
  return res.redirect('/dashboard/jobs');
});

router.post('/jobs/:id/toggle', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  const job = db
    .prepare('SELECT * FROM automation_jobs WHERE id = ? AND user_id = ? AND status != \'archived\'')
    .get(jobId, req.user.id);

  if (!job) {
    setFlash(req, 'error', 'Job not found.');
    return res.redirect('/dashboard/jobs');
  }

  const nextStatus = job.status === 'active' ? 'paused' : 'active';
  const nextRunAt = nextStatus === 'active' ? isoNow() : job.next_run_at;

  db.prepare('UPDATE automation_jobs SET status = ?, next_run_at = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    nextRunAt,
    isoNow(),
    jobId,
  );

  setFlash(req, 'success', `Job ${nextStatus === 'active' ? 'resumed' : 'paused'}.`);
  return res.redirect('/dashboard/jobs');
});

router.post('/jobs/:id/delete', (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);

  db.prepare('UPDATE automation_jobs SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    'archived',
    isoNow(),
    jobId,
    req.user.id,
  );

  setFlash(req, 'success', 'Job archived.');
  return res.redirect('/dashboard/jobs');
});

router.post('/jobs/:id/run-now', async (req, res) => {
  const jobId = Number.parseInt(req.params.id, 10);
  const job = db
    .prepare('SELECT * FROM automation_jobs WHERE id = ? AND user_id = ? AND status != \'archived\'')
    .get(jobId, req.user.id);

  if (!job) {
    setFlash(req, 'error', 'Job not found.');
    return res.redirect('/dashboard/jobs');
  }

  try {
    await runJobNow(jobId);
    setFlash(req, 'success', 'Manual run completed. Check logs on your dashboard.');
  } catch (error) {
    setFlash(req, 'error', error.message);
  }

  return res.redirect('/dashboard/jobs');
});

router.get('/subscription', (req, res) => {
  const subscription = getActiveSubscription(req.user.id);
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_usd ASC').all();

  res.render('dashboard/subscription', {
    title: 'Subscription',
    subscription,
    plans,
  });
});

module.exports = router;
