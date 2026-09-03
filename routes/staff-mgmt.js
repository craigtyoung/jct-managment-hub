/**
 * staff-mgmt.js — Staff Management portal API.
 * Single access tier: the whole portal (Directory + Pay Review) is locked to the
 * STAFF_MGMT_IDS allowlist (Craig, Jaime, Victor). Staff records and pay data are
 * both sensitive, so managers outside the allowlist (e.g. David) have no access.
 * Mounted behind requireAuth at /api/staff-mgmt.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

const DEFAULT_PW = 'jct2026';

// Whole portal — tight allowlist (Craig, Jaime, Victor). Directory and Pay both.
function guardMgmt(req, res, next) {
  const real = db.getStaffById(req.session.staffId);
  if (!real || !db.canManageStaff(real.id)) return res.status(403).json({ error: 'Not permitted' });
  next();
}
// Aliases keep the route definitions below readable (directory vs pay intent).
const guardDir = guardMgmt;
const guardPay = guardMgmt;

// ── Directory (add / edit / remove staff, incl. last name + contact) ──
router.get('/directory', guardDir, (req, res) => res.json(db.getStaffDirectory()));

router.post('/directory', guardDir, (req, res) => {
  if (!req.body.first_name || !String(req.body.first_name).trim()) return res.status(400).json({ error: 'First name required' });
  const hash = bcrypt.hashSync(req.body.password || DEFAULT_PW, 10);
  const s = db.addStaffMember(req.body, hash);
  sse.broadcast('staff-pay');
  res.json(s);
});

router.put('/directory/:id', guardDir, (req, res) => {
  const s = db.updateStaffMember(req.params.id, req.body);
  if (!s) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('staff-pay');
  res.json(s);
});

// Manager resets a staff member's password → temp password + forces them to set
// their own again on next login.
router.post('/directory/:id/reset-password', guardDir, (req, res) => {
  const target = db.getStaffById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  const temp = (req.body.newPassword && String(req.body.newPassword).length >= 4) ? String(req.body.newPassword) : DEFAULT_PW;
  db.managerResetPassword(req.params.id, bcrypt.hashSync(temp, 10));
  res.json({ ok: true, temp });
});

router.delete('/directory/:id', guardDir, (req, res) => {
  if (parseInt(req.params.id) === req.session.staffId) return res.status(400).json({ error: 'Cannot remove your own account' });
  if (!db.removeStaff(req.params.id)) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('staff-pay');
  res.json({ ok: true });
});

// ── Pay Review (tight allowlist) ──
router.get('/', guardPay, (req, res) => res.json(db.getStaffPay()));

router.put('/:staffId', guardPay, (req, res) => {
  const row = db.updateStaffPay(req.params.staffId, req.body.job, req.body, req.session.staffId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('staff-pay'); // live-sync open Staff Management screens
  res.json(row);
});

module.exports = router;
