const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET recent readings
router.get('/', (req, res) => {
  res.json(db.getBubbleReadings(parseInt(req.query.limit) || 50));
});

// POST a new reading
router.post('/', (req, res) => {
  const { temperature, pressure, note, wind, recTier, recMin } = req.body;
  const empty = v => v == null || v === '';
  if (empty(temperature) && empty(pressure) && !note) {
    return res.status(400).json({ error: 'Enter a temperature, pressure, or note' });
  }
  const id = db.createBubbleReading({ staffId: req.actingStaffId, temperature, pressure, note, wind, recTier, recMin });
  sse.broadcast('update');
  res.json({ ok: true, id });
});

module.exports = router;
