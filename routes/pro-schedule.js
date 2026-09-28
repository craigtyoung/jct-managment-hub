/**
 * pro-schedule.js — the teaching pros' class schedule (season grid).
 *
 * Slots are seeded from the academy class catalog; management assigns a court and
 * one or more pros per slot via dropdowns. Mounted behind requireAuth at
 * /api/pro-schedule. GET is open to all staff (pros view their board); writes are
 * management-only. Acting identity resolves through dev "View as".
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
function acting(req) { return db.getStaffById(req.actingStaffId); }
function isManagement(s) { return s && (s.role === 'admin' || s.role === 'manager'); }

// Pros available for assignment: teaching pros + managers who also coach (Victor,
// David), plus anyone else flagged is_pro regardless of their base role (staff
// management's Office+Pro checkboxes, or an admin who also coaches) — the role-name
// check alone missed dual-role people who aren't role==='pro' outright.
router.get('/pros', (req, res) => {
  res.json(db.getAllStaff()
    .filter(s => ['pro', 'manager'].includes(s.role) || s.is_pro)
    .map(s => ({ id: s.id, name: s.name, color: s.color, role: s.role })));
});

// Slots (optionally scoped to one day: ?day=Mon)
router.get('/slots', (req, res) => res.json(db.getProScheduleSlots(req.query.day)));

router.post('/slots', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  res.json(db.addProScheduleSlot(req.body));
});

router.put('/slots/:id', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  const s = db.updateProScheduleSlot(req.params.id, req.body);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.delete('/slots/:id', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  if (!db.deleteProScheduleSlot(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
