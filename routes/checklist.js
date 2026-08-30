const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET items for a shift+date, with completion status
router.get('/', (req, res) => {
  const { shift, date } = req.query;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!validShifts.includes(shift)) return res.status(400).json({ error: 'Invalid shift' });
  const items = db.getChecklistItems(shift, date || null);
  res.json(items);
});

// GET progress summary for a shift+date
router.get('/progress', (req, res) => {
  const { shift, date } = req.query;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!validShifts.includes(shift)) return res.status(400).json({ error: 'Invalid shift' });
  res.json(db.getChecklistProgress(shift, date || null));
});

// POST complete or NR a task (one-way lock)
router.post('/complete', (req, res) => {
  const { item_id, shift, date, status, note } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!item_id || !validShifts.includes(shift)) return res.status(400).json({ error: 'item_id and valid shift required' });
  const dateStr = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : new Date().toISOString().slice(0, 10);

  const ok = db.completeChecklistItem({
    itemId: item_id, staffId: req.actingStaffId,
    shift, date: dateStr, status, note,
  });
  if (!ok) return res.status(409).json({ error: 'Already completed' });
  sse.broadcast('checklist-update');
  res.json({ ok: true });
});

// DELETE completion — admin only (reset)
router.delete('/complete', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || staff.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { item_id, shift, date } = req.body;
  db.resetChecklistItem({ itemId: item_id, shift, date });
  sse.broadcast('checklist-update');
  res.json({ ok: true });
});

// Admin: add item
router.post('/items', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  const item = db.addChecklistItem(req.body);
  res.json({ ok: true, item });
});

// Admin: update item
router.put('/items/:id', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  const ok = db.updateChecklistItem(req.params.id, req.body);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Admin: toggle active
router.patch('/items/:id/toggle', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  const ok = db.toggleChecklistItem(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
