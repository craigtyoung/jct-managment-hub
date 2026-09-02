/**
 * staff-mgmt.js — manager-only staff management (pay review to start).
 * Gated to the STAFF_MGMT_IDS allowlist (Craig, Jaime, Victor) because pay data
 * is sensitive. Mounted behind requireAuth at /api/staff-mgmt.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

function guard(req, res, next) {
  const real = db.getStaffById(req.session.staffId);
  if (!real || !db.canManageStaff(real.id)) return res.status(403).json({ error: 'Not permitted' });
  next();
}

// GET all staff with pay fields
router.get('/', guard, (req, res) => res.json(db.getStaffPay()));

// PUT pay fields for one staff member (current_rate, new_rate, effective_date, notes)
router.put('/:staffId', guard, (req, res) => {
  const row = db.updateStaffPay(req.params.staffId, req.body, req.session.staffId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

module.exports = router;
