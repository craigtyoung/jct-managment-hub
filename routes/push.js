/**
 * push.js (route) — Web Push subscription management.
 * Clients fetch the VAPID public key, then POST their PushSubscription to store
 * it against the logged-in staff member. Mounted behind requireAuth at /api/push.
 */
const express = require('express');
const db = require('../db');
const push = require('../push');
const router = express.Router();

router.get('/vapid-public-key', (req, res) => res.json({ key: push.publicKey() }));

router.post('/subscribe', (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Bad subscription' });
  db.addPushSubscription(req.session.staffId, sub);
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  if (req.body.endpoint) db.removeSubscriptionByEndpoint(req.body.endpoint);
  res.json({ ok: true });
});

module.exports = router;
