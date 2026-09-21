/**
 * proshop.js — Pro Shop area. First feature: the String Log (rackets strung).
 * Counts only — no pay rates or dollar amounts live here; payroll handles pay.
 * Mounted behind requireAuth at /api/proshop.
 */
const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
function isMgmt(id) { const s = db.getStaffById(id); return s && ['admin', 'manager'].includes(s.role); }
function isStringer(id) { const s = db.getStaffById(id); return s && ['lil', 'matthew'].some(n => String(s.name || '').toLowerCase().includes(n)); }

// Staff list for the "Strung by" picker (everyone — office staff string too).
router.get('/staff', (req, res) => res.json(db.getAllStaff().map(s => ({ id: s.id, name: s.name, role: s.role }))));

// String log
router.get('/strings', (req, res) => res.json(db.getStringLogs()));
router.get('/strings/counts', (req, res) => res.json(db.getStringCounts()));

router.post('/strings', (req, res) => {
  if (!isMgmt(req.actingStaffId) && !isStringer(req.actingStaffId)) return res.status(403).json({ error: 'Only Lilly, Matthew, or managers can log string entries' });
  const { date, member, string, tension, strung_by, taken_in_by, string_source } = req.body;
  if (!strung_by) return res.status(400).json({ error: 'Strung by is required' });
  const id = db.addStringLog({ date, member, string, tension, strung_by, taken_in_by, string_source });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

// "Client paid" (the member paid at pickup): front desk, Lilly/Matthew and management can mark it;
// only management can undo it. Editing anything else follows the same rule as logging an entry.
const roleOf = id => { const s = db.getStaffById(id); return s ? s.role : null; };
const canMarkPaid = id => isMgmt(id) || isStringer(id) || roleOf(id) === 'staff';

router.put('/strings/:id', (req, res) => {
  const id = req.actingStaffId, b = req.body || {};
  const editsOther = Object.keys(b).some(k => !['paid', 'paid_date'].includes(k));
  if (editsOther && !isMgmt(id) && !isStringer(id)) return res.status(403).json({ error: 'Only Lilly, Matthew, or managers can edit string entries' });
  if (b.paid !== undefined) {
    if (b.paid && !canMarkPaid(id)) return res.status(403).json({ error: 'Only front desk, Lilly, Matthew, or managers can mark a string as paid' });
    if (!b.paid && !isMgmt(id)) return res.status(403).json({ error: 'Only a manager can undo a paid entry' });
  }
  const l = db.updateStringLog(req.params.id, b, id);
  if (!l) return res.status(404).json({ error: 'Not found' });
  if (l.error) return res.status(409).json({ error: l.error });
  sse.broadcast('update');
  res.json({ ok: true });
});

// Remove a mistaken entry — management only (soft-delete, recoverable).
router.delete('/strings/:id', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  if (!db.deleteStringLog(req.params.id)) return res.status(404).json({ error: 'Not found' });
  sse.broadcast('update');
  res.json({ ok: true });
});

module.exports = router;
