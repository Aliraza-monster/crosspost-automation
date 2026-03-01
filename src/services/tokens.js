const db = require('../config/db');

function getTokenBalance(userId) {
  const row = db.prepare('SELECT token_balance FROM users WHERE id = ?').get(userId);
  return row ? Number(row.token_balance || 0) : 0;
}

function adjustUserTokens({
  userId,
  deltaTokens,
  reason,
  paymentRequestId = null,
  adminUserId = null,
  meta = null,
}) {
  const delta = Number.parseInt(deltaTokens, 10);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Token delta must be a non-zero integer.');
  }

  const note = String(reason || '').trim();
  if (!note) {
    throw new Error('Token reason is required.');
  }

  const tx = db.transaction(() => {
    const user = db.prepare('SELECT id, token_balance FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found for token update.');
    }

    const currentBalance = Number(user.token_balance || 0);
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) {
      throw new Error('Insufficient token balance.');
    }

    db.prepare('UPDATE users SET token_balance = ? WHERE id = ?').run(nextBalance, userId);
    db.prepare(
      `
      INSERT INTO token_ledger (
        user_id, delta_tokens, reason, payment_request_id, admin_user_id, meta_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(
      userId,
      delta,
      note,
      paymentRequestId,
      adminUserId,
      meta ? JSON.stringify(meta) : null,
    );

    return nextBalance;
  });

  return tx();
}

function listTokenLedgerForUser(userId, limit = 20) {
  return db
    .prepare(
      `
      SELECT l.id, l.delta_tokens, l.reason, l.created_at, l.payment_request_id, l.meta_json,
             a.name AS admin_name
      FROM token_ledger l
      LEFT JOIN users a ON a.id = l.admin_user_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?
    `,
    )
    .all(userId, limit);
}

module.exports = {
  getTokenBalance,
  adjustUserTokens,
  listTokenLedgerForUser,
};
