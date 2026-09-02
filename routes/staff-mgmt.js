/**
 * staff-mgmt.js — manager-only staff management (pay review to start).
 * Gated to the STAFF_MGMT_IDS allowlist (Craig, Jaime, Victor) because pay data
 * is sensitive. Mounted behind requireAuth at /api/staff-mgmt.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

const DEFAULT_PW = 'jct2026';

function guard(req, res, next) {
  const real = db.getStaffById(req.session.staffId);
  if (!real || !db.canManageStaff(real.id)) return res.status(403).json({ error: 'Not permitted' });
  next();
}

// ── Directory (add / edit staff, incl. last name + contact) ──
router.get('/directory', guard, (req, res) => res.json(db.getStaffDirectory()));

router.post('/directory', guard, (req, res) => {
  if (!req.body.first_name || !String(req.body.first_name).trim()) return res.status(400).json({ error: 'First name required' });
  const hash = bcrypt.hashSync(req.body.password || DEFAULT_PW, 10);
  const s = db.addStaffMember(req.body, hash);
  sse.broadcast('staff-pay');
  res.json(s);
});

router.put('/directory/:id', guard, (req, res) => {
  const s = db.updateStaffMember(req.params.id, req.body);
  if (!s) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('staff-pay');
  res.json(s);
});

// GET all staff with pay fields
router.get('/', guard, (req, res) => res.json(db.getStaffPay()));

// PUT pay fields for one staff member (current_rate, new_rate, effective_date, notes)
router.put('/:staffId', guard, (req, res) => {
  const row = db.updateStaffPay(req.params.staffId, req.body, req.session.staffId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('staff-pay'); // live-sync open Staff Management screens
  res.json(row);
});

module.exports = router;
