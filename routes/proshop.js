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

// Staff list for the "Strung by" picker (everyone — office staff string too).
router.get('/staff', (req, res) => res.json(db.getAllStaff().map(s => ({ id: s.id, name: s.name, role: s.role }))));

// String log
router.get('/strings', (req, res) => res.json(db.getStringLogs()));
router.get('/strings/counts', (req, res) => res.json(db.getStringCounts()));

router.post('/strings', (req, res) => {
  const { date, member, string, tension, strung_by } = req.body;
  if (!strung_by) return res.status(400).json({ error: 'Strung by is required' });
  const id = db.addStringLog({ date, member, string, tension, strung_by });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

router.put('/strings/:id', (req, res) => {
  const l = db.updateStringLog(req.params.id, req.body);
  if (!l) return res.status(404).json({ error: 'Not found' });
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
