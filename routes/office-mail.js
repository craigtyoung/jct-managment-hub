/**
 * office-mail.js — "new email" alert for the shared office Gmail inbox.
 *
 * A Google Apps Script running inside the office account POSTs the unread list (sender, subject,
 * time — never bodies) to /api/office-mail/webhook every minute. That one endpoint is PUBLIC but
 * refuses anything without the shared secret. Everything else requires a hub login:
 *   GET  /status            office staff + management (drives the dashboard card)
 *   GET  /setup, POST /setup/regenerate, PUT /settings   admins only (Craig, Jaime)
 * No Gmail password is stored anywhere.
 */
const express = require('express');
const db = require('../db');
const sse = require('../sse');
const push = require('../push');
const router = express.Router();

const OFFICE_ROLES = ['admin', 'manager', 'staff'];   // pros and contractors never see the inbox
const roleOf = id => { const s = db.getStaffById(id); return s ? s.role : null; };
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
const guard = (test, msg) => (req, res, next) => test(req.actingStaffId) ? next() : res.status(403).json({ error: msg });
const isOffice = id => OFFICE_ROLES.includes(roleOf(id));
const isAdmin = id => roleOf(id) === 'admin';

// ── Public webhook (secret-guarded, mounted before the login guard in server.js) ──
const hits = [];   // crude flood guard: max 120 calls/minute
function webhook(req, res) {
  const t = Date.now();
  while (hits.length && t - hits[0] > 60000) hits.shift();
  if (hits.length >= 120) return res.status(429).json({ error: 'Slow down' });
  hits.push(t);

  if (!db.checkOfficeMailSecret(req.get('x-hub-secret'))) return res.status(401).json({ error: 'Unauthorized' });
  const r = db.recordOfficeMailSync(req.body);
  if (r.error) return res.status(400).json({ error: r.error });

  if (r.newThreads.length) {
    try {
      const n = r.newThreads.length, first = r.newThreads[0];
      push.sendToStaff(db.getOfficeMailRecipients(), {
        title: n === 1 ? 'New office email' : `${n} new office emails`,
        body: n === 1 ? `${first.from}: ${first.subject}`.slice(0, 140) : `${first.from}: ${first.subject} (+${n - 1} more)`.slice(0, 140),
        url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(db.getOfficeMailSetup().mailbox)}`,
        tag: 'jct-office-mail',
      });
    } catch (e) { console.error('office mail push failed:', e.message); }
  }
  if (r.changed) sse.broadcast('update');
  res.json({ ok: true });
}

// ── Logged-in routes ──
router.get('/status', guard(isOffice, 'Office staff only'), (req, res) => res.json(db.getOfficeMailStatus()));

router.get('/setup', guard(isAdmin, 'Admins only'), (req, res) => res.json(db.getOfficeMailSetup()));
router.post('/setup/regenerate', guard(isAdmin, 'Admins only'), (req, res) => res.json(db.regenerateOfficeMailSecret()));
router.put('/settings', guard(isAdmin, 'Admins only'), (req, res) => res.json(db.updateOfficeMailSettings(req.body || {})));

module.exports = router;
module.exports.webhook = webhook;
