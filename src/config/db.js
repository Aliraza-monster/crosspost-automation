const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const env = require('./env');

const dbDir = path.dirname(env.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(env.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price_usd REAL NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      description TEXT,
      max_jobs INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      source_platform TEXT NOT NULL,
      source_url TEXT NOT NULL,
      facebook_user_token TEXT NOT NULL,
      facebook_page_id TEXT NOT NULL,
      facebook_page_name TEXT NOT NULL,
      facebook_page_token TEXT NOT NULL,
      next_media_index INTEGER NOT NULL DEFAULT 0,
      last_posted_url TEXT,
      last_posted_at TEXT,
      next_run_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON automation_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON automation_jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON automation_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `);
}

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(env.adminEmail);
  if (existing) {
    return;
  }

  const hash = bcrypt.hashSync(env.adminPassword, 12);
  db.prepare(
    'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)',
  ).run('Administrator', env.adminEmail, hash);

  console.log(`Seeded admin user: ${env.adminEmail}`);
}

function seedPlans() {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM plans').get();
  if (countRow.count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO plans (name, price_usd, billing_cycle, description, max_jobs, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const seed = db.transaction(() => {
    insert.run('Starter', 49, 'monthly', '1 automation workflow, basic support', 1);
    insert.run('Growth', 149, 'monthly', '3 automation workflows, priority support', 3);
    insert.run('Agency', 399, 'monthly', '10 automation workflows for teams and agencies', 10);
  });

  seed();
}

initializeSchema();
seedAdmin();
seedPlans();

module.exports = db;
