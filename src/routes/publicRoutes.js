const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  const plans = db
    .prepare('SELECT * FROM plans WHERE active = 1 ORDER BY price_usd ASC')
    .all();

  res.render('home', {
    title: 'Cross Posting Automation',
    plans,
  });
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

module.exports = router;
