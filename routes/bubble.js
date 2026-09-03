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

// GET /export — CSV log of pressure/temperature readings for the insurer.
// Optional ?start=YYYY-MM-DD&end=YYYY-MM-DD to scope the range.
router.get('/export', (req, res) => {
  const { start, end } = req.query;
  let rows = db.getBubbleReadings(1000000); // newest-first
  if (start) { const s = new Date(start + 'T00:00:00'); rows = rows.filter(r => new Date(r.created_at) >= s); }
  if (end)   { const e = new Date(end + 'T23:59:59');   rows = rows.filter(r => new Date(r.created_at) <= e); }
  rows = rows.slice().reverse(); // chronological order for a readings log
  const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push(['Date/Time', 'Staff', 'Temperature', 'Pressure', 'Wind (km/h)', 'Rec. min pressure', 'Condition', 'Note'].map(q).join(','));
  rows.forEach(r => {
    lines.push([
      r.created_at || '', r.staff_name || '',
      r.temperature != null ? r.temperature : '', r.pressure != null ? r.pressure : '',
      r.wind != null ? r.wind : '', r.rec_min != null ? r.rec_min : '',
      r.rec_tier || '', r.note || ''
    ].map(q).join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  const range = (start || end) ? `-${start || 'start'}_${end || 'end'}` : '';
  res.setHeader('Content-Disposition', `attachment; filename="bubble-readings${range}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;
