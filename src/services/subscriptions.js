const db = require('../config/db');

function getActiveSubscription(userId) {
  return db
    .prepare(`
      SELECT s.*, p.name AS plan_name, p.max_jobs, p.price_usd, p.billing_cycle
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = ?
        AND s.status = 'active'
        AND p.active = 1
        AND (s.ends_at IS NULL OR s.ends_at >= ?)
      ORDER BY s.created_at DESC
      LIMIT 1
    `)
    .get(userId, new Date().toISOString());
}

module.exports = {
  getActiveSubscription,
};
