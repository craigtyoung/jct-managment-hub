const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET a pay period's scheduled shifts + timesheet entries merged
// ?start=YYYY-MM-DD&end=YYYY-MM-DD  (client computes semi-monthly period)
router.get('/week', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);

  const assignments = db.getAssignmentsForRange(start, end);
  const entries     = db.getTimesheetForRange(start, end);
  const defaults    = db.getShiftDefaults();
  const overrides   = db.getTimeOverridesForRange(start, end);

  const entryMap = {};
  for (const e of entries) {
    entryMap[`${e.staff_id}:${e.date}:${e.shift}`] = e;
  }

  const rows = assignments.map(a => {
    const key   = `${a.staff_id}:${a.date}:${a.shift}`;
    const entry = entryMap[key] || null;
    const def   = defaults[a.shift] || {};
    const ov    = overrides[`${a.date}:${a.shift}`] || null;
    return {
      ...a,
      scheduled_start: ov?.start || def.start || null,
      scheduled_end:   ov?.end   || def.end   || null,
      actual_start:    entry ? entry.actual_start : null,
      actual_end:      entry ? entry.actual_end   : null,
      expenses:        entry ? entry.expenses     : null,
      timesheet_id:    entry ? entry.id           : null,
      notes:           entry ? entry.notes        : '',
    };
  });

  res.json({ start, end, rows, defaults });
});

// PUT upsert a timesheet entry (admin/manager only)
router.put('/entry', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const { staff_id, date, shift, actual_start, actual_end, expenses, notes } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!staff_id || !date || !validShifts.includes(shift)) {
    return res.status(400).json({ error: 'staff_id, date, and shift required' });
  }
  db.upsertTimesheetEntry({
    staffId:     staff_id,
    date,
    shift,
    actualStart: actual_start || null,
    actualEnd:   actual_end   || null,
    expenses:    expenses != null ? expenses : null,
    notes:       notes || '',
    updatedBy:   req.actingStaffId,
  });
  res.json({ ok: true });
});

// DELETE a timesheet entry (admin/manager only)
router.delete('/entry/:id', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.deleteTimesheetEntry(req.params.id);
  res.json({ ok: true });
});

// GET shift time defaults
router.get('/defaults', (req, res) => {
  res.json(db.getShiftDefaults());
});

// PUT update a shift default (admin only)
router.put('/defaults/:shift', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || staff.role !== 'admin') return res.status(403).json({ error: 'Not authorised' });
  const { shift } = req.params;
  const { start, end } = req.body;
  if (!['morning', 'afternoon', 'closing'].includes(shift) || !start || !end) {
    return res.status(400).json({ error: 'shift, start, end required' });
  }
  db.setShiftDefault(shift, start, end);
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const yr = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0');
  return d.getDate() <= 15 ? `${yr}-${mo}-01` : `${yr}-${mo}-16`;
}

function periodEnd(startStr) {
  const d = new Date(startStr + 'T12:00:00');
  const yr = d.getFullYear(), month = d.getMonth();
  if (d.getDate() === 1) return `${yr}-${String(month + 1).padStart(2, '0')}-15`;
  const lastDay = new Date(yr, month + 1, 0).getDate();
  return `${yr}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
}

module.exports = router;
