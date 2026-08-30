const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET week of assignments — ?start=YYYY-MM-DD (Monday of the week)
router.get('/week', (req, res) => {
  const start = req.query.start || mondayOf(new Date());
  const end   = addDays(start, 6);
  const rows  = db.getAssignmentsForRange(start, end);
  const overrides = db.getTimeOverridesForRange(start, end);
  const assignments = rows.map(a => {
    const ov = overrides[`${a.date}:${a.shift}`] || null;
    return { ...a, override_start: ov?.start || null, override_end: ov?.end || null };
  });
  res.json({ start, end, assignments });
});

// GET assignments for a single shift (used by checklist header)
router.get('/shift', (req, res) => {
  const { date, shift } = req.query;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!date || !validShifts.includes(shift)) return res.status(400).json({ error: 'date and shift required' });
  res.json(db.getAssignmentsForShift(date, shift));
});

// PUT set all staff for a shift (admin/manager only) — replaces existing
router.put('/shift', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const { date, shift, staff_ids } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!date || !validShifts.includes(shift)) return res.status(400).json({ error: 'date and shift required' });
  db.setShiftAssignments({ date, shift, staffIds: staff_ids || [], createdBy: req.actingStaffId });
  res.json({ ok: true });
});

// GET all staff list (for assignment picker)
router.get('/staff', (req, res) => {
  res.json(db.getAllStaff());
});

// GET all recurring rules
router.get('/rules', (req, res) => {
  res.json(db.getShiftRules());
});

// POST create a recurring rule — one record per staff member
router.post('/rules', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  const { staff_id, shift, day_of_week, start_date, end_date } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!staff_id || !validShifts.includes(shift) || day_of_week === undefined || !start_date) {
    return res.status(400).json({ error: 'staff_id, shift, day_of_week, start_date required' });
  }
  const id = db.addShiftRule({ staffId: staff_id, shift, dayOfWeek: day_of_week, startDate: start_date, endDate: end_date || null, createdBy: req.actingStaffId });
  res.json({ ok: true, id });
});

// PUT set or clear a slot time override (admin/manager only)
// Pass start+end to set, omit (or null) to clear
router.put('/override', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  const { date, shift, start, end } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!date || !validShifts.includes(shift)) return res.status(400).json({ error: 'date and shift required' });
  if (start && end) {
    db.setShiftTimeOverride(date, shift, start, end);
  } else {
    db.clearShiftTimeOverride(date, shift);
  }
  res.json({ ok: true });
});

// DELETE a recurring rule
router.delete('/rules/:id', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Not authorised' });
  db.deleteShiftRule(req.params.id);
  res.json({ ok: true });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = router;
