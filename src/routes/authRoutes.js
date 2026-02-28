const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { setFlash } = require('../utils/flash');

const router = express.Router();

function redirectToHomeForUser(req, res) {
  if (!req.user) {
    return false;
  }

  if (req.user.is_admin === 1) {
    res.redirect('/admin');
  } else {
    res.redirect('/dashboard');
  }

  return true;
}

router.get('/login', (req, res) => {
  if (redirectToHomeForUser(req, res)) {
    return;
  }

  res.render('auth/login', {
    title: 'Login',
  });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.redirect('/login');
  }

  req.session.userId = user.id;
  setFlash(req, 'success', 'Logged in successfully.');

  if (user.is_admin === 1) {
    return res.redirect('/admin');
  }

  return res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  if (redirectToHomeForUser(req, res)) {
    return;
  }

  res.render('auth/register', {
    title: 'Register',
  });
});

router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !email || password.length < 8) {
    setFlash(req, 'error', 'Enter name, valid email, and a password with at least 8 characters.');
    return res.redirect('/register');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    setFlash(req, 'error', 'This email is already registered.');
    return res.redirect('/register');
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 0)')
    .run(name, email, passwordHash);

  req.session.userId = result.lastInsertRowid;
  setFlash(req, 'success', 'Account created. Ask admin to assign a subscription plan.');
  return res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
