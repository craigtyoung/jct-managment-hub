const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

// Acting identity (admins in "view as" act as the viewed staff member)
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET all current coverage requests (open + recently resolved)
router.get('/', (req, res) => {
  res.json(db.getCoverageRequests());
});

// POST create a coverage request
router.post('/', (req, res) => {
  const { date, shift, reason } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!date || !validShifts.includes(shift)) {
    return res.status(400).json({ error: 'Date and a valid shift are required' });
  }
  const id = db.createCoverageRequest({ staffId: req.actingStaffId, date, shift, reason });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

// POST claim (cover) a request
router.post('/:id/cover', (req, res) => {
  const ok = db.coverCoverageRequest(req.params.id, req.actingStaffId);
  if (!ok) return res.status(409).json({ error: 'Already covered or no longer open' });
  sse.broadcast('update');
  res.json({ ok: true });
});

// POST cancel a request (requester or admin/manager)
router.post('/:id/cancel', (req, res) => {
  const me = db.getStaffById(req.actingStaffId);
  const isAdmin = me && (me.role === 'admin' || me.role === 'manager');
  const ok = db.cancelCoverageRequest(req.params.id, req.actingStaffId, isAdmin);
  if (!ok) return res.status(403).json({ error: 'Not allowed' });
  sse.broadcast('update');
  res.json({ ok: true });
});

module.exports = router;
