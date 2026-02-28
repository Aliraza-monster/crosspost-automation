const express = require('express');
const db = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { setFlash } = require('../utils/flash');
const { isoNow } = require('../utils/dates');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', (_req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 0').get().count,
    plans: db.prepare('SELECT COUNT(*) AS count FROM plans').get().count,
    activeSubscriptions: db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM subscriptions
        WHERE status = 'active' AND (ends_at IS NULL OR ends_at >= ?)
      `)
      .get(isoNow()).count,
    activeJobs: db
      .prepare("SELECT COUNT(*) AS count FROM automation_jobs WHERE status = 'active'")
      .get().count,
  };

  const recentUsers = db
    .prepare('SELECT id, name, email, created_at FROM users WHERE is_admin = 0 ORDER BY created_at DESC LIMIT 8')
    .all();

  const recentJobs = db
    .prepare(`
      SELECT j.id, j.name, j.status, j.source_platform, j.facebook_page_name, j.created_at, u.name AS owner_name
      FROM automation_jobs j
      JOIN users u ON u.id = j.user_id
      WHERE j.status != 'archived'
      ORDER BY j.created_at DESC
      LIMIT 8
    `)
    .all();

  res.render('admin/index', {
    title: 'Admin Dashboard',
    stats,
    recentUsers,
    recentJobs,
  });
});

router.get('/plans', (_req, res) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY price_usd ASC, id ASC').all();

  res.render('admin/plans', {
    title: 'Plan Management',
    plans,
  });
});

router.post('/plans', (req, res) => {
  const name = String(req.body.name || '').trim();
  const price = Number.parseFloat(req.body.priceUsd || '0');
  const billingCycle = String(req.body.billingCycle || 'monthly').trim();
  const description = String(req.body.description || '').trim();
  const maxJobs = Number.parseInt(req.body.maxJobs || '1', 10);
  const active = req.body.active === 'on' ? 1 : 0;

  if (!name || Number.isNaN(price) || Number.isNaN(maxJobs) || maxJobs < 1) {
    setFlash(req, 'error', 'Enter valid plan details.');
    return res.redirect('/admin/plans');
  }

  db.prepare(`
    INSERT INTO plans (name, price_usd, billing_cycle, description, max_jobs, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, price, billingCycle, description, maxJobs, active, isoNow());

  setFlash(req, 'success', 'Plan created.');
  return res.redirect('/admin/plans');
});

router.post('/plans/:id', (req, res) => {
  const planId = Number.parseInt(req.params.id, 10);
  const name = String(req.body.name || '').trim();
  const price = Number.parseFloat(req.body.priceUsd || '0');
  const billingCycle = String(req.body.billingCycle || 'monthly').trim();
  const description = String(req.body.description || '').trim();
  const maxJobs = Number.parseInt(req.body.maxJobs || '1', 10);
  const active = req.body.active === 'on' ? 1 : 0;

  if (!planId || !name || Number.isNaN(price) || Number.isNaN(maxJobs) || maxJobs < 1) {
    setFlash(req, 'error', 'Invalid plan update payload.');
    return res.redirect('/admin/plans');
  }

  db.prepare(`
    UPDATE plans
    SET name = ?, price_usd = ?, billing_cycle = ?, description = ?, max_jobs = ?, active = ?, updated_at = ?
    WHERE id = ?
  `).run(name, price, billingCycle, description, maxJobs, active, isoNow(), planId);

  setFlash(req, 'success', 'Plan updated.');
  return res.redirect('/admin/plans');
});

router.get('/subscriptions', (_req, res) => {
  const users = db
    .prepare('SELECT id, name, email FROM users WHERE is_admin = 0 ORDER BY created_at DESC')
    .all();
  const plans = db.prepare('SELECT id, name, price_usd, billing_cycle, max_jobs FROM plans ORDER BY id DESC').all();
  const subscriptions = db
    .prepare(`
      SELECT s.*, u.name AS user_name, u.email AS user_email,
             p.name AS plan_name, p.price_usd, p.billing_cycle, p.max_jobs
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN plans p ON p.id = s.plan_id
      ORDER BY s.created_at DESC
      LIMIT 40
    `)
    .all();

  res.render('admin/subscriptions', {
    title: 'Subscription Management',
    users,
    plans,
    subscriptions,
  });
});

router.post('/subscriptions/assign', (req, res) => {
  const userId = Number.parseInt(req.body.userId || '0', 10);
  const planId = Number.parseInt(req.body.planId || '0', 10);
  const durationDays = Number.parseInt(req.body.durationDays || '0', 10);
  const notes = String(req.body.notes || '').trim();

  if (!userId || !planId) {
    setFlash(req, 'error', 'Select user and plan.');
    return res.redirect('/admin/subscriptions');
  }

  const now = new Date();
  const startsAt = now.toISOString();
  let endsAt = null;
  if (!Number.isNaN(durationDays) && durationDays > 0) {
    const endDate = new Date(now.getTime());
    endDate.setDate(endDate.getDate() + durationDays);
    endsAt = endDate.toISOString();
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE subscriptions
      SET status = 'expired', ends_at = COALESCE(ends_at, ?), updated_at = ?
      WHERE user_id = ? AND status = 'active'
    `).run(startsAt, isoNow(), userId);

    db.prepare(`
      INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at, notes, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?)
    `).run(userId, planId, startsAt, endsAt, notes, isoNow());
  });

  tx();

  setFlash(req, 'success', 'Subscription assigned. Existing active plan was closed.');
  return res.redirect('/admin/subscriptions');
});

module.exports = router;
