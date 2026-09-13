/**
 * pro-timesheet.js — the teaching pros' hourly timesheet.
 *
 * Rows are auto-generated from the live pro-schedule class grid (see
 * db.getProAssignmentsForRange), merged with a pro's confirmations and any manual
 * lines. A pro confirms the classes they actually taught; hours come from the class
 * length. Confirmations snapshot the class details so past periods survive a season
 * grid swap. Mirrors routes/timesheet.js (the office sheet) intentionally.
 *
 * Permissions: a pro edits their OWN rows; management (admin/manager) edits anyone's.
 * Salaried staff (David, Megan) are excluded upstream in db.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

function isManagement(s) { return s && ['admin', 'manager'].includes(s.role); }

// GET /week?start=&end= — auto class rows merged with confirmations + manual entries.
// Management sees EVERY teaching pro (one card each, like the office sheet); a pro
// sees only their own. Rows carry staff_name/color so the client can group by pro.
router.get('/week', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const mgmt = isManagement(acting);

  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);

  let assignments = db.getProAssignmentsForRange(start, end);
  let entries     = db.getProTimesheetForRange(start, end);
  if (!mgmt) {
    assignments = assignments.filter(a => a.staff_id === req.actingStaffId);
    entries     = entries.filter(e => e.staff_id === req.actingStaffId);
  }

  const entryMap = {};
  const manual = [];
  for (const e of entries) {
    if (e.source === 'manual') manual.push(e);
    else entryMap[`${e.staff_id}:${e.slot_id}:${e.date}`] = e;
  }

  const rows = assignments
    .map(a => {
      const entry = entryMap[`${a.staff_id}:${a.slot_id}:${a.date}`] || null;
      const s = db.getStaffById(a.staff_id);
      return {
        slot_id: a.slot_id, staff_id: a.staff_id,
        staff_name: s ? s.name : 'Unknown', staff_color: s ? s.color : '#999',
        date: a.date, day: a.day,
        program: a.program, time_label: a.time_label, kind: a.kind,
        scheduled_start: a.start, scheduled_end: a.end,
        actual_start: entry ? entry.actual_start : null,
        actual_end:   entry ? entry.actual_end   : null,
        entry_id:     entry ? entry.id           : null,
        notes:        entry ? entry.notes        : '',
        source: 'class',
      };
    })
    .sort((a, b) => a.staff_name.localeCompare(b.staff_name) || a.date.localeCompare(b.date) || String(a.scheduled_start).localeCompare(String(b.scheduled_start)));

  manual.sort((a, b) => (a.staff_name || '').localeCompare(b.staff_name || '') || a.date.localeCompare(b.date) || String(a.actual_start).localeCompare(String(b.actual_start)));

  res.json({ start, end, acting_id: req.actingStaffId, is_management: mgmt, rows, manual });
});

// GET /pros — non-salaried teaching pros (management staff-picker source)
router.get('/pros', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!isManagement(acting)) return res.status(403).json({ error: 'Management only' });
  res.json(db.getTeachingPros());
});

// PUT /entry — confirm (or edit) a class row. Snapshots the program label + times.
router.put('/entry', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, date, slot_id, actual_start, actual_end, program, notes } = req.body;
  const targetId = parseInt(staff_id);
  if (targetId !== req.actingStaffId && !isManagement(acting)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  if (!targetId || !date || !slot_id) {
    return res.status(400).json({ error: 'staff_id, date, slot_id required' });
  }
  db.upsertProTimesheetEntry({
    staffId: targetId, date, slotId: slot_id,
    actualStart: actual_start || null, actualEnd: actual_end || null,
    program, notes: notes || '', updatedBy: req.actingStaffId,
  });
  res.json({ ok: true });
});

// POST /manual — add a manual line (private lesson, sub, off-grid). Flagged for management.
router.post('/manual', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, date, actual_start, actual_end, program, notes } = req.body;
  const mgmt = isManagement(acting);
  const targetId = (staff_id && mgmt) ? parseInt(staff_id) : req.actingStaffId;
  if (targetId !== req.actingStaffId && !mgmt) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  if (!date || !actual_start || !actual_end) {
    return res.status(400).json({ error: 'date, actual_start, actual_end required' });
  }
  const item = db.addProManualEntry({
    staffId: targetId, date, actualStart: actual_start, actualEnd: actual_end,
    program, notes: notes || '', submittedBy: req.actingStaffId,
  });
  res.json({ ok: true, item });
});

// DELETE /entry/:id — unconfirm a class row or remove a manual line (own; management any)
router.delete('/entry/:id', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const entry = db.getProTimesheetEntryById(req.params.id);
  if (!entry) return res.json({ ok: true }); // already gone — idempotent
  if (entry.staff_id !== req.actingStaffId && !isManagement(acting)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.deleteProTimesheetEntry(req.params.id);
  res.json({ ok: true });
});

// GET /export?start=&end=&staff_id= — CSV of the period. Type column flags manual lines.
router.get('/export', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const mgmt = isManagement(acting);
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);
  // Management exports every pro; a pro exports their own.
  let assignments = db.getProAssignmentsForRange(start, end);
  let entries     = db.getProTimesheetForRange(start, end);
  if (!mgmt) {
    assignments = assignments.filter(a => a.staff_id === req.actingStaffId);
    entries     = entries.filter(e => e.staff_id === req.actingStaffId);
  }

  const entryMap = {};
  const manual = [];
  for (const e of entries) {
    if (e.source === 'manual') manual.push(e);
    else entryMap[`${e.staff_id}:${e.slot_id}:${e.date}`] = e;
  }
  const nameOf = id => { const s = db.getStaffById(id); return s ? s.name : id; };

  const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const hrs = (s, e2) => {
    if (!s || !e2) return '';
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e2.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 1440;
    return (m / 60).toFixed(2);
  };

  const lines = [];
  lines.push(['Pro', 'Date', 'Type', 'Class', 'Scheduled Start', 'Scheduled End', 'Actual Start', 'Actual End', 'Hours', 'Notes'].map(q).join(','));

  // Confirmed classes only (unconfirmed = 0 hours, omitted from payroll export)
  assignments
    .sort((a, b) => nameOf(a.staff_id).localeCompare(nameOf(b.staff_id)) || a.date.localeCompare(b.date))
    .forEach(a => {
      const en = entryMap[`${a.staff_id}:${a.slot_id}:${a.date}`];
      if (!en || !en.actual_start) return;
      lines.push([
        nameOf(a.staff_id), a.date, 'Class', a.program,
        a.start, a.end, en.actual_start, en.actual_end,
        hrs(en.actual_start, en.actual_end), en.notes || '',
      ].map(q).join(','));
    });

  // Manual lines
  manual.forEach(m => {
    lines.push([
      nameOf(m.staff_id), m.date, 'Manual', m.program || '',
      '', '', m.actual_start || '', m.actual_end || '',
      hrs(m.actual_start, m.actual_end), m.notes || '',
    ].map(q).join(','));
  });

  const who = mgmt ? 'all-pros' : (nameOf(req.actingStaffId) || 'pro').toString().replace(/\s+/g, '-');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="pro-timesheet-${who}-${start}_${end}.csv"`);
  res.send(lines.join('\n'));
});

// ── Helpers (semi-monthly periods; identical to the office sheet) ──────────────
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
