const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

// Acting identity (admins in "view as" act as the viewed staff member)
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET all spots (open + working + recently filled), each with its update thread
router.get('/', (req, res) => {
  res.json(db.getWaitlistSpots());
});

// POST create an open spot (any staff — front-desk work)
router.post('/', (req, res) => {
  const { program, day_time, opened_date, spots, note } = req.body;
  if (!program || !String(program).trim()) return res.status(400).json({ error: 'Class / program is required' });
  const id = db.createWaitlistSpot({
    staffId: req.actingStaffId,
    program: String(program).trim(),
    day_time, opened_date, spots, note,
  });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

// PUT change a spot's status (open | working | filled)
router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['open', 'working', 'filled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const s = db.setWaitlistStatus(req.params.id, status, req.actingStaffId);
  if (!s) return res.status(404).json({ error: 'Spot not found' });
  sse.broadcast('update');
  res.json({ ok: true });
});

// POST add an update to a spot's chain of communication (any staff)
router.post('/:id/update', (req, res) => {
  const { content } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'Update text is required' });
  const id = db.addWaitlistUpdate({ spotId: req.params.id, staffId: req.actingStaffId, content: String(content).trim() });
  if (!id) return res.status(404).json({ error: 'Spot not found' });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

// DELETE a spot — management (admin/manager) only, for removing a mistaken entry.
router.delete('/:id', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  db.deleteWaitlistSpot(req.params.id);
  sse.broadcast('update');
  res.json({ ok: true });
});

module.exports = router;
