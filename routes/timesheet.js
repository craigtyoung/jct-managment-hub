const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db = require('../db');
const router = express.Router();

const DATA_FILE    = process.env.DATA_FILE || path.join(__dirname, '..', 'jct-data.json');
const RECEIPTS_DIR = path.join(path.dirname(DATA_FILE), 'receipts');
const RCPT_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
function findPeriodReceipt(base) {
  for (const ext of RCPT_EXTS) { const p = path.join(RECEIPTS_DIR, `${base}${ext}`); if (fs.existsSync(p)) return p; }
  return null;
}
const rcptStorage = multer.diskStorage({
  destination: (req, file, cb) => { if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true }); cb(null, RECEIPTS_DIR); },
  filename: (req, file, cb) => {
    const base = `period-${req.params.staffId}-${req.params.periodStart}`;
    RCPT_EXTS.forEach(ext => { try { fs.unlinkSync(path.join(RECEIPTS_DIR, `${base}${ext}`)); } catch (e) {} });
    cb(null, `${base}${path.extname(file.originalname).toLowerCase() || '.jpg'}`);
  },
});
const rcptUpload = multer({
  storage: rcptStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'),
});

// Multer for per-item receipts
const itemRcptStorage = multer.diskStorage({
  destination: (req, file, cb) => { if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true }); cb(null, RECEIPTS_DIR); },
  filename: (req, file, cb) => {
    const base = `expense-item-${req.params.itemId}`;
    RCPT_EXTS.forEach(ext => { try { fs.unlinkSync(path.join(RECEIPTS_DIR, `${base}${ext}`)); } catch (e) {} });
    cb(null, `${base}${path.extname(file.originalname).toLowerCase() || '.jpg'}`);
  },
});
const itemRcptUpload = multer({
  storage: itemRcptStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'),
});

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

function isManagement(s) { return s && ['admin', 'manager'].includes(s.role); }

// GET a pay period's scheduled shifts + timesheet entries merged
// ?start=YYYY-MM-DD&end=YYYY-MM-DD
// Shared data-gathering behind both the /week JSON endpoint (live page) and the
// /export-pdf endpoint (static report) — one source of truth for what a pay
// period's rows look like so the PDF never drifts from what the hub shows.
function buildWeekData(start, end) {
  const assignments = db.getAssignmentsForRange(start, end);
  const entries     = db.getTimesheetForRange(start, end);
  const defaults    = db.getShiftDefaults();
  const overrides   = db.getTimeOverridesForRange(start, end);
  const periodExp   = db.getPeriodExpensesForRange(start);
  const voids       = db.getTimesheetVoidsForRange(start, end);
  const manual      = db.getManualTimesheetForRange(start, end);

  const entryMap = {};
  for (const e of entries) {
    entryMap[`${e.staff_id}:${e.date}:${e.shift}`] = e;
  }

  // Scheduled shifts voided on the timesheet for this period (schedule untouched)
  const voidSet = new Set(voids.map(v => `${v.staff_id}:${v.date}:${v.shift}`));
  const liveAssignments = assignments.filter(a => !voidSet.has(`${a.staff_id}:${a.date}:${a.shift}`));

  // Office shifts are meant to be staffed one person at a time (occasional ~1hr
  // handoff overlap aside) — flag, don't block, when a shift accidentally ends up
  // with 2+ people on it so management can spot it during payroll review.
  const shiftStaffing = {}; // `${date}:${shift}` -> [{staff_id, staff_name}]
  for (const a of liveAssignments) {
    const k = `${a.date}:${a.shift}`;
    (shiftStaffing[k] = shiftStaffing[k] || []).push({ staff_id: a.staff_id, staff_name: a.staff_name });
  }

  const rows = liveAssignments
    .map(a => {
      const key   = `${a.staff_id}:${a.date}:${a.shift}`;
      const entry = entryMap[key] || null;
      const def   = defaults[a.shift] || {};
      const ov    = overrides[`${a.date}:${a.shift}`] || null;
      const others = (shiftStaffing[`${a.date}:${a.shift}`] || []).filter(o => o.staff_id !== a.staff_id);
      return {
        ...a,
        scheduled_start: ov?.start || def.start || null,
        scheduled_end:   ov?.end   || def.end   || null,
        actual_start:    entry ? entry.actual_start : null,
        actual_end:      entry ? entry.actual_end   : null,
        timesheet_id:    entry ? entry.id           : null,
        notes:           entry ? entry.notes        : '',
        double_booked_with: others.length ? others.map(o => o.staff_name) : null,
      };
    });

  // Manual lines (staff meetings, coverage, off-schedule) — appended as their own rows
  for (const m of manual) {
    const s = db.getStaffById(m.staff_id) || {};
    rows.push({
      is_manual:       true,
      manual_id:       m.id,
      staff_id:        m.staff_id,
      staff_name:      s.name,
      staff_color:     s.color,
      staff_role:      s.role,
      date:            m.date,
      shift:           'manual',
      label:           m.label,
      scheduled_start: null,
      scheduled_end:   null,
      actual_start:    m.actual_start,
      actual_end:      m.actual_end,
      timesheet_id:    null,
      notes:           m.notes || '',
    });
  }

  // Teaching hours per staff (read-only cross-reference from the Pro timesheet) so
  // accounting can total dual-role staff (office + teaching) in one place.
  const proByStaff = buildProHoursByStaff(start, end);

  return { start, end, rows, defaults, period_expenses: periodExp, period_receipts: db.getPeriodReceiptsForRange(start), string_counts: db.getStringCounts(start, end), expense_items: db.getExpenseItemsForPeriodAllStaff(start), pro_by_staff: proByStaff };
}

router.get('/week', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);
  res.json(buildWeekData(start, end));
});

// PUT upsert a timesheet entry
// Admin/Manager: can edit any row
// Staff: can only confirm/unconfirm their own shifts
router.put('/entry', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });

  const { staff_id, date, shift, actual_start, actual_end, notes } = req.body;
  const targetId = parseInt(staff_id);
  const isAdminOrManager = ['admin', 'manager'].includes(acting.role);
  const isOwnShift = targetId === req.actingStaffId;

  if (!isAdminOrManager && !isOwnShift) {
    return res.status(403).json({ error: 'Not authorised' });
  }

  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!targetId || !date || !validShifts.includes(shift)) {
    return res.status(400).json({ error: 'staff_id, date, and shift required' });
  }

  db.upsertTimesheetEntry({
    staffId:     targetId,
    date,
    shift,
    actualStart: actual_start || null,
    actualEnd:   actual_end   || null,
    expenses:    null, // expenses now handled per-period, not per-shift
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

// ── Manual timesheet lines (staff meetings, coverage, off-schedule work) ────────

// POST add a manual line (own line for any staff; admin/manager for anyone)
router.post('/manual-entry', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, date, label, actual_start, actual_end, notes } = req.body;
  if (!date || !actual_start || !actual_end) {
    return res.status(400).json({ error: 'date, actual_start and actual_end required' });
  }
  const isManagement = ['admin', 'manager'].includes(acting.role);
  const targetId = (staff_id && isManagement) ? parseInt(staff_id) : req.actingStaffId;
  if (targetId !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const entry = db.addManualTimesheetEntry({
    staffId: targetId, date, label,
    actualStart: actual_start, actualEnd: actual_end,
    notes, submittedBy: req.actingStaffId,
  });
  res.json({ ok: true, entry });
});

// PUT edit a manual line (own line; admin/manager any)
router.put('/manual-entry/:id', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const item = db.getManualTimesheetEntryById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const isManagement = ['admin', 'manager'].includes(acting.role);
  if (item.staff_id !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const { label, actual_start, actual_end, notes } = req.body;
  if (!actual_start || !actual_end) {
    return res.status(400).json({ error: 'actual_start and actual_end required' });
  }
  const entry = db.updateManualTimesheetEntry(req.params.id, {
    label, actualStart: actual_start, actualEnd: actual_end, notes, updatedBy: req.actingStaffId,
  });
  res.json({ ok: true, entry });
});

// DELETE a manual line (own line; admin/manager any)
router.delete('/manual-entry/:id', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const item = db.getManualTimesheetEntryById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const isManagement = ['admin', 'manager'].includes(acting.role);
  if (item.staff_id !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.deleteManualTimesheetEntry(req.params.id);
  res.json({ ok: true });
});

// ── Void a scheduled shift on the timesheet (schedule left untouched) ───────────

// POST void: remove a scheduled shift from the timesheet for this period.
// Own shift for any staff; admin/manager for anyone.
router.post('/void', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, date, shift } = req.body;
  const validShifts = ['morning', 'afternoon', 'closing'];
  if (!staff_id || !date || !validShifts.includes(shift)) {
    return res.status(400).json({ error: 'staff_id, date and a valid shift required' });
  }
  const targetId = parseInt(staff_id);
  const isManagement = ['admin', 'manager'].includes(acting.role);
  if (targetId !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.addTimesheetVoid({ staffId: targetId, date, shift, createdBy: req.actingStaffId });
  res.json({ ok: true });
});

// DELETE void: restore a previously-removed scheduled shift (admin/manager any; own)
router.delete('/void', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, date, shift } = req.body;
  if (!staff_id || !date || !shift) {
    return res.status(400).json({ error: 'staff_id, date and shift required' });
  }
  const targetId = parseInt(staff_id);
  const isManagement = ['admin', 'manager'].includes(acting.role);
  if (targetId !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.removeTimesheetVoid({ staffId: targetId, date, shift });
  res.json({ ok: true });
});

// GET period expenses for a specific person
router.get('/period-expenses', (req, res) => {
  const { staff_id, period_start } = req.query;
  if (!staff_id || !period_start) return res.status(400).json({ error: 'staff_id and period_start required' });
  const amount = db.getPeriodExpenses(parseInt(staff_id), period_start);
  res.json({ staff_id: parseInt(staff_id), period_start, amount });
});

// PUT period expenses (admin/manager only)
router.put('/period-expenses', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting || !['admin', 'manager'].includes(acting.role)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const { staff_id, period_start, amount } = req.body;
  if (!staff_id || !period_start) return res.status(400).json({ error: 'staff_id and period_start required' });
  db.setPeriodExpenses(parseInt(staff_id), period_start, amount);
  res.json({ ok: true });
});

// Receipt photo for a staff member's period expenses — upload (self or management)
router.post('/period-expenses/:staffId/:periodStart/receipt', (req, res, next) => {
  const acting = db.getStaffById(req.actingStaffId);
  const targetId = parseInt(req.params.staffId);
  const isManagement = acting && ['admin', 'manager'].includes(acting.role);
  if (!acting || (targetId !== req.actingStaffId && !isManagement)) return res.status(403).json({ error: 'Not authorised' });
  next();
}, rcptUpload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.setPeriodReceipt(parseInt(req.params.staffId), req.params.periodStart, req.file.filename);
  res.json({ ok: true, receipt: req.file.filename });
});

// Serve a staff member's period-expense receipt (self or management)
router.get('/period-expenses/:staffId/:periodStart/receipt', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  const targetId = parseInt(req.params.staffId);
  const isManagement = acting && ['admin', 'manager'].includes(acting.role);
  if (!acting || (targetId !== req.actingStaffId && !isManagement)) return res.status(403).end();
  const p = findPeriodReceipt(`period-${req.params.staffId}-${req.params.periodStart}`);
  if (p) return res.sendFile(p);
  res.status(404).end();
});

// ── Expense Line Items ────────────────────────────────────────────────────────

// GET expense items for a period (own items; admin sees all staff via ?staff_id=all)
router.get('/expense-items', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { period_start, staff_id } = req.query;
  if (!period_start) return res.status(400).json({ error: 'period_start required' });
  const isManagement = ['admin', 'manager'].includes(acting.role);
  const targetId = staff_id && isManagement ? parseInt(staff_id) : req.actingStaffId;
  res.json(db.getExpenseItemsForPeriod(targetId, period_start));
});

// POST add a new expense item (any staff for own; admin for any)
router.post('/expense-items', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const { staff_id, period_start, date, description, amount } = req.body;
  if (!period_start || !description || amount === undefined) {
    return res.status(400).json({ error: 'period_start, description, amount required' });
  }
  const isManagement = ['admin', 'manager'].includes(acting.role);
  const targetId = (staff_id && isManagement) ? parseInt(staff_id) : req.actingStaffId;
  if (targetId !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  const item = db.addExpenseItem({ staffId: targetId, periodStart: period_start, date, description, amount, submittedBy: req.actingStaffId });
  res.json({ ok: true, item });
});

// DELETE an expense item (own items; admin any)
router.delete('/expense-items/:id', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!acting) return res.status(401).json({ error: 'Not authenticated' });
  const item = db.getExpenseItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const isManagement = ['admin', 'manager'].includes(acting.role);
  if (item.staff_id !== req.actingStaffId && !isManagement) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  // Delete receipt file if any
  if (item.receipt_file) {
    try { fs.unlinkSync(path.join(RECEIPTS_DIR, item.receipt_file)); } catch (e) {}
  }
  db.deleteExpenseItem(req.params.id);
  res.json({ ok: true });
});

// POST upload receipt for an expense item
router.post('/expense-items/:itemId/receipt', (req, res, next) => {
  const acting = db.getStaffById(req.actingStaffId);
  const item = db.getExpenseItemById(req.params.itemId);
  if (!acting || !item) return res.status(404).json({ error: 'Not found' });
  const isManagement = acting && ['admin', 'manager'].includes(acting.role);
  if (item.staff_id !== req.actingStaffId && !isManagement) return res.status(403).json({ error: 'Not authorised' });
  next();
}, itemRcptUpload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.setExpenseItemReceipt(req.params.itemId, req.file.filename);
  res.json({ ok: true, receipt: req.file.filename });
});

// GET receipt for an expense item
router.get('/expense-items/:itemId/receipt', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  const item = db.getExpenseItemById(req.params.itemId);
  if (!acting || !item) return res.status(404).end();
  const isManagement = acting && ['admin', 'manager'].includes(acting.role);
  if (item.staff_id !== req.actingStaffId && !isManagement) return res.status(403).end();
  if (!item.receipt_file) return res.status(404).end();
  const p = path.join(RECEIPTS_DIR, item.receipt_file);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
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

// GET /export?start=YYYY-MM-DD&end=YYYY-MM-DD — CSV of the pay period.
router.get('/export', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);

  const assignments = db.getAssignmentsForRange(start, end);
  const entries     = db.getTimesheetForRange(start, end);
  const defaults    = db.getShiftDefaults();
  const overrides   = db.getTimeOverridesForRange(start, end);
  const periodExp   = db.getPeriodExpensesForRange(start);
  const voids       = db.getTimesheetVoidsForRange(start, end);
  const manual      = db.getManualTimesheetForRange(start, end);

  const entryMap = {};
  for (const e of entries) entryMap[`${e.staff_id}:${e.date}:${e.shift}`] = e;
  const voidSet = new Set(voids.map(v => `${v.staff_id}:${v.date}:${v.shift}`));

  const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const hrs = (s, e2) => {
    if (!s || !e2) return '';
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e2.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 1440;
    return (m / 60).toFixed(2);
  };

  const decHrs = (s, e2) => { const v = hrs(s, e2); return v === '' ? 0 : parseFloat(v); };
  const officeHoursById = {}; // office hours per staff for the combined summary

  const lines = [];
  lines.push(['Staff', 'Date', 'Shift', 'Scheduled Start', 'Scheduled End', 'Actual Start', 'Actual End', 'Hours', 'Notes'].map(q).join(','));
  // Combine scheduled shifts (minus voided ones) with manual lines, grouped by
  // staff (matching the on-screen per-person cards) with a blank-row break
  // between staff, chronological within each staff's own block.
  const exportRows = [];
  assignments
    .filter(a => !voidSet.has(`${a.staff_id}:${a.date}:${a.shift}`))
    .forEach(a => {
      const key = `${a.staff_id}:${a.date}:${a.shift}`;
      const en = entryMap[key]; const def = defaults[a.shift] || {}; const ov = overrides[`${a.date}:${a.shift}`] || null;
      const s = db.getStaffById(a.staff_id);
      const as = en ? en.actual_start : null, ae = en ? en.actual_end : null;
      // Match the hub's own definition of "confirmed" (isConfirmed = !!actual_start) —
      // a scheduled-but-never-confirmed shift shouldn't appear in the pay-period export.
      if (!as) return;
      officeHoursById[a.staff_id] = (officeHoursById[a.staff_id] || 0) + decHrs(as, ae);
      exportRows.push({ staffId: a.staff_id, staffName: s ? s.name : String(a.staff_id), sortKey: a.date + a.shift, cells: [
        s ? s.name : a.staff_id, a.date, a.shift,
        ov?.start || def.start || '', ov?.end || def.end || '',
        as || '', ae || '', hrs(as, ae), en ? en.notes : ''
      ]});
    });
  manual.forEach(m => {
    const s = db.getStaffById(m.staff_id);
    officeHoursById[m.staff_id] = (officeHoursById[m.staff_id] || 0) + decHrs(m.actual_start, m.actual_end);
    exportRows.push({ staffId: m.staff_id, staffName: s ? s.name : String(m.staff_id), sortKey: m.date + 'zz', cells: [
      s ? s.name : m.staff_id, m.date, `Added: ${m.label || 'Manual entry'}`,
      '', '', m.actual_start || '', m.actual_end || '', hrs(m.actual_start, m.actual_end), m.notes || ''
    ]});
  });
  const byStaff = {};
  exportRows.forEach(r => { (byStaff[r.staffId] = byStaff[r.staffId] || []).push(r); });
  Object.keys(byStaff)
    .sort((a, b) => byStaff[a][0].staffName.localeCompare(byStaff[b][0].staffName))
    .forEach((sid, i) => {
      if (i > 0) lines.push(''); // blank row between staff blocks
      byStaff[sid]
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .forEach(r => lines.push(r.cells.map(q).join(',')));
    });
  lines.push('');

  // Combined hours summary (office + teaching) so dual-role staff total in one place
  const proByStaff = buildProHoursByStaff(start, end);
  const summaryIds = new Set([...Object.keys(officeHoursById), ...Object.keys(proByStaff)].map(Number));
  if (summaryIds.size) {
    lines.push(['Hours Summary (Office + Teaching)'].map(q).join(','));
    lines.push(['Staff', 'Office Hours', 'Teaching Hours', 'Total Hours'].map(q).join(','));
    [...summaryIds]
      .sort((a, b) => { const na = db.getStaffById(a), nb = db.getStaffById(b); return (na ? na.name : String(a)).localeCompare(nb ? nb.name : String(b)); })
      .forEach(id => {
        const s = db.getStaffById(id);
        const office = officeHoursById[id] || 0;
        const teach  = proByStaff[id] ? proByStaff[id].total_hours : 0;
        lines.push([s ? s.name : id, office.toFixed(2), teach.toFixed(2), (office + teach).toFixed(2)].map(q).join(','));
      });
    lines.push('');
  }
  lines.push(['Expense Items'].map(q).join(','));
  lines.push(['Staff', 'Date', 'Description', 'Amount', 'Receipt'].map(q).join(','));
  const allItems = db.getExpenseItemsForPeriodAllStaff(start);
  Object.entries(allItems).forEach(([sid, items]) => {
    const s = db.getStaffById(parseInt(sid));
    for (const item of items) {
      lines.push([s ? s.name : sid, item.date, item.description, parseFloat(item.amount).toFixed(2), item.receipt_file ? 'Yes' : ''].map(q).join(','));
    }
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${start}_${end}.csv"`);
  res.send(lines.join('\n'));
});

// GET /export-pdf?start=&end= — a formatted PDF of the pay period, visually matching
// the Timesheets page (person cards, staff colors, pills) instead of a flat CSV.
// Built from the exact same data as /week (buildWeekData) so it never drifts from
// what the hub shows. Rendered by printing a static HTML document to PDF with a
// headless Chromium (puppeteer-core + @sparticuz/chromium — no external service,
// no account, no recurring cost; the Chromium binary just ships inside the app).
router.get('/export-pdf', (req, res) => {
  (async () => {
    const today = new Date().toISOString().slice(0, 10);
    const start = req.query.start || periodStart(today);
    const end   = req.query.end   || periodEnd(start);
    const { rows, string_counts, pro_by_staff } = buildWeekData(start, end);

    const stringByStaff = {}; (string_counts || []).forEach(c => { stringByStaff[c.staff_id] = c; });

    const groups = {};
    for (const row of rows) {
      if (!groups[row.staff_id]) {
        const s = db.getStaffById(row.staff_id);
        groups[row.staff_id] = { id: row.staff_id, name: row.staff_name, color: (s && s.color) || '#2c5c9c', role: row.staff_role, rows: [] };
      }
      groups[row.staff_id].rows.push(row);
    }
    const SHIFT_ORDER = { morning: 0, afternoon: 1, closing: 2, manual: 3 };
    Object.values(groups).forEach(g => g.rows.sort((a, b) => a.date.localeCompare(b.date) || (SHIFT_ORDER[a.shift] ?? 9) - (SHIFT_ORDER[b.shift] ?? 9)));

    const html = buildTimesheetPdfHtml({ start, end, groups, stringByStaff, proByStaff: pro_by_staff });

    let browser;
    try {
      // v123+ of @sparticuz/chromium ships as ESM with a CJS compat wrapper —
      // require() returns { default: <actual chromium object> }, not the object itself.
      const chromium = require('@sparticuz/chromium').default;
      const puppeteer = require('puppeteer-core');
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '28px', bottom: '28px', left: '24px', right: '24px' } });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="timesheets-${start}_${end}.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error('PDF export failed:', err);
      res.status(500).json({ error: 'PDF export failed: ' + err.message });
    } finally {
      if (browser) await browser.close();
    }
  })();
});

function fmt12pdf(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function calcHoursPdf(s, e) {
  if (!s || !e) return null;
  const [sh, sm] = s.split(':').map(Number), [eh, em] = e.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : null;
}
function fmtHoursPdf(h) {
  if (h === null || h === undefined || isNaN(h)) return '—';
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
function escPdf(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toMinutesPdf(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function computeFlagsPdf(rows) {
  const notConfirmed = rows.filter(r => !r.actual_start).length;
  const doubleBooked = rows.filter(r => r.double_booked_with && r.double_booked_with.length).length;
  const byDate = {};
  rows.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const overlapDates = new Set();
  Object.entries(byDate).forEach(([date, dayRows]) => {
    if (dayRows.length < 2) return;
    const spans = dayRows
      .map(r => [r.actual_start || r.scheduled_start, r.actual_end || r.scheduled_end])
      .filter(([s, e]) => s && e)
      .map(([s, e]) => [toMinutesPdf(s), toMinutesPdf(e)]);
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[i][0] < spans[j][1] && spans[j][0] < spans[i][1]) overlapDates.add(date);
      }
    }
  });
  return { notConfirmed, doubleBooked, overlapDates: [...overlapDates] };
}
const SHIFT_LABELS_PDF = { morning: 'Morning', afternoon: 'Afternoon', closing: 'Closing', manual: 'Added' };

function renderPdfShiftRow(row) {
  if (row.is_manual) {
    const hrs = calcHoursPdf(row.actual_start, row.actual_end);
    return `<div class="pr-row">
      <span class="pr-date">${row.date}</span>
      <span class="pr-badge manual">Added</span>
      <span class="pr-mid">${escPdf(row.label || 'Manual entry')} · ${fmt12pdf(row.actual_start)} – ${fmt12pdf(row.actual_end)}</span>
      <span class="pr-hours">${hrs ? fmtHoursPdf(hrs) : ''}</span>
    </div>`;
  }
  const isConfirmed = !!row.actual_start;
  const isOverride = isConfirmed && (row.actual_start !== row.scheduled_start || row.actual_end !== row.scheduled_end);
  const dupe = row.double_booked_with && row.double_booked_with.length
    ? `<span class="pr-dupe">⚠ +${row.double_booked_with.length}</span>` : '';
  let statusHtml;
  if (isOverride) statusHtml = `<span class="pr-override">${fmt12pdf(row.actual_start)} – ${fmt12pdf(row.actual_end)}</span>`;
  else if (isConfirmed) statusHtml = `<span class="pr-confirmed">Confirmed ✓</span>`;
  else statusHtml = `<span class="pr-pending">Not confirmed</span>`;
  const shiftHours = isConfirmed ? calcHoursPdf(row.actual_start, row.actual_end) : null;
  const schedHtml = isOverride ? '' : `<span class="pr-sched">${fmt12pdf(row.scheduled_start)} – ${fmt12pdf(row.scheduled_end)}</span>`;
  return `<div class="pr-row">
    <span class="pr-date">${row.date}</span>
    <span class="pr-badge ${row.shift}">${SHIFT_LABELS_PDF[row.shift] || row.shift}</span>
    ${dupe}
    <span class="pr-mid">${schedHtml}${statusHtml}${row.notes ? `<span class="pr-note">${escPdf(row.notes)}</span>` : ''}</span>
    <span class="pr-hours">${shiftHours ? fmtHoursPdf(shiftHours) : ''}</span>
  </div>`;
}

function renderPdfPersonCard(person, stringByStaff, proByStaff) {
  const totalHours = person.rows.reduce((sum, r) => sum + (calcHoursPdf(r.actual_start, r.actual_end) || 0), 0);
  const confirmed = person.rows.filter(r => r.actual_start).length;
  const total = person.rows.length;
  const flags = computeFlagsPdf(person.rows);
  const flagParts = [];
  if (flags.notConfirmed > 0) flagParts.push(`${flags.notConfirmed} not worked`);
  if (flags.overlapDates.length) flagParts.push(`${flags.overlapDates.length} overlap${flags.overlapDates.length > 1 ? 's' : ''}`);
  if (flags.doubleBooked > 0) flagParts.push(`${flags.doubleBooked} double-booked`);
  const flagPill = flagParts.length ? `<span class="pr-pill pr-flag">⚠ ${flagParts.join(' · ')}</span>` : '';

  const pro = (proByStaff || {})[person.id] || null;
  const proHours = pro ? (pro.total_hours || 0) : 0;
  const combined = totalHours + proHours;
  const hoursPill = totalHours > 0 ? `<span class="pr-pill pr-green">${fmtHoursPdf(totalHours)}${proHours > 0 ? ' office' : ''}</span>` : (proHours > 0 ? '' : `<span class="pr-pill pr-none">No hours logged</span>`);
  const teachPill = proHours > 0 ? `<span class="pr-pill pr-blue">${fmtHoursPdf(proHours)} teaching</span>` : '';
  const totalPill = proHours > 0 ? `<span class="pr-pill pr-navy">Total ${fmtHoursPdf(combined)}</span>` : '';
  const sc = stringByStaff[person.id];
  const stringPill = sc && sc.total ? `<span class="pr-pill pr-blue">🎾 ${sc.total} strung</span>` : '';

  return `<div class="pr-card">
    <div class="pr-head">
      <div class="pr-head-left">
        <span class="pr-chip" style="background:${person.color}18;color:${person.color}">${escPdf(person.name)}</span>
        <span class="pr-role">${escPdf(person.role || '')}</span>
      </div>
      <div class="pr-head-right">
        <span class="pr-progress">${confirmed}/${total} shifts</span>
        ${flagPill}${hoursPill}${teachPill}${totalPill}${stringPill}
      </div>
    </div>
    ${person.rows.map(renderPdfShiftRow).join('')}
  </div>`;
}

function buildTimesheetPdfHtml({ start, end, groups, stringByStaff, proByStaff }) {
  const staffIds = Object.keys(groups).map(Number).sort((a, b) => groups[a].name.localeCompare(groups[b].name));
  const cards = staffIds.map(id => renderPdfPersonCard(groups[id], stringByStaff, proByStaff)).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page { margin: 0; }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',system-ui,sans-serif;font-size:11.5px;line-height:1.4;color:#0c1738;background:#fff;}
    .pr-title{font-size:18px;font-weight:700;color:#0c1738;margin-bottom:2px;}
    .pr-sub{font-size:11px;color:#8fa0b8;margin-bottom:18px;}
    .pr-card{border:1px solid rgba(12,23,56,0.12);border-radius:10px;overflow:hidden;margin-bottom:12px;page-break-inside:avoid;}
    .pr-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f0f4f9;border-bottom:1px solid rgba(12,23,56,0.08);flex-wrap:wrap;gap:6px;}
    .pr-head-left{display:flex;align-items:center;gap:8px;}
    .pr-chip{display:inline-block;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:700;}
    .pr-role{font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8fa0b8;}
    .pr-head-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .pr-progress{font-size:10.5px;color:#8fa0b8;}
    .pr-pill{display:inline-block;padding:2px 9px;border-radius:100px;font-size:10.5px;font-weight:700;}
    .pr-green{background:rgba(22,163,74,0.10);color:#16a34a;}
    .pr-blue{background:rgba(44,92,156,0.12);color:#2c5c9c;}
    .pr-navy{background:#0c1738;color:#f0f4ff;}
    .pr-none{color:#8fa0b8;font-weight:400;}
    .pr-flag{background:rgba(217,119,6,0.16);color:#b45309;}
    .pr-row{display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid rgba(12,23,56,0.05);font-size:11px;}
    .pr-row:last-child{border-bottom:none;}
    .pr-date{width:72px;color:#4a6080;flex-shrink:0;}
    .pr-badge{display:inline-block;padding:1px 7px;border-radius:100px;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;flex-shrink:0;}
    .pr-badge.morning{background:rgba(251,191,36,0.16);color:#b45309;}
    .pr-badge.afternoon{background:rgba(44,92,156,0.12);color:#2c5c9c;}
    .pr-badge.closing{background:rgba(12,23,56,0.08);color:#4a6080;}
    .pr-badge.manual{background:rgba(22,163,74,0.14);color:#16a34a;}
    .pr-dupe{font-size:9.5px;font-weight:700;color:#b45309;flex-shrink:0;}
    .pr-mid{flex:1;display:flex;gap:8px;align-items:center;min-width:0;color:#4a6080;}
    .pr-sched{color:#8fa0b8;}
    .pr-confirmed{color:#16a34a;font-weight:600;}
    .pr-override{color:#2c5c9c;font-weight:600;}
    .pr-pending{color:#b45309;font-weight:600;}
    .pr-note{font-style:italic;color:#8fa0b8;font-size:10px;}
    .pr-hours{font-weight:700;color:#0c1738;flex-shrink:0;}
  </style></head><body>
    <div class="pr-title">JCT Staff Hub — Timesheets</div>
    <div class="pr-sub">Pay period: ${start} to ${end}</div>
    ${cards || '<div style="color:#8fa0b8">No shifts scheduled this period.</div>'}
  </body></html>`;
}

// GET /payroll-summary?start=&end= — itemized payroll snapshot, one block per staff
// member (name, then every paid line — office shifts, academy classes, off court,
// stringing, expenses — in date order, then that person's own totals right underneath).
// Mirrors the old pay sheet's per-person layout but vertical (one block after another)
// instead of side-by-side columns needing horizontal scroll. Not stored server-side —
// re-run the same start/end later to regenerate from current records.
router.get('/payroll-summary', (req, res) => {
  const acting = db.getStaffById(req.actingStaffId);
  if (!isManagement(acting)) return res.status(403).json({ error: 'Management only' });

  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);

  const assignments = db.getAssignmentsForRange(start, end);
  const manual       = db.getManualTimesheetForRange(start, end);
  const voids        = db.getTimesheetVoidsForRange(start, end);
  const entries      = db.getTimesheetForRange(start, end);
  const defaults     = db.getShiftDefaults();
  const overrides    = db.getTimeOverridesForRange(start, end);
  const entryMap = {};
  for (const e of entries) entryMap[`${e.staff_id}:${e.date}:${e.shift}`] = e;
  const voidSet = new Set(voids.map(v => `${v.staff_id}:${v.date}:${v.shift}`));

  const decHrs = (s, e2) => {
    if (!s || !e2) return 0;
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e2.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 1440;
    return m / 60;
  };
  const fmt12 = t => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  // byStaff[id] = { name, rows: [{sortKey, cells:[Date,Type,Time In,Time Out,Hours,Detail,Amount]}],
  //                 regular, academy, offCourt, strung, expenses }
  const byStaff = {};
  const bucket = id => {
    if (!byStaff[id]) {
      const s = db.getStaffById(id);
      byStaff[id] = { name: s ? s.name : String(id), rows: [], regular: 0, academy: 0, offCourt: 0, strung: 0, expenses: 0 };
    }
    return byStaff[id];
  };

  // Office shifts (minus voided) + manual office lines
  assignments.filter(a => !voidSet.has(`${a.staff_id}:${a.date}:${a.shift}`)).forEach(a => {
    const key = `${a.staff_id}:${a.date}:${a.shift}`;
    const en = entryMap[key]; const def = defaults[a.shift] || {}; const ov = overrides[`${a.date}:${a.shift}`] || null;
    const as = en ? en.actual_start : null, ae = en ? en.actual_end : null;
    const hours = decHrs(as, ae);
    const b = bucket(a.staff_id);
    b.regular += hours;
    b.rows.push({ sortKey: a.date + a.shift, cells: [a.date, a.shift, fmt12(as || ov?.start || def.start), fmt12(ae || ov?.end || def.end), hours ? hours.toFixed(2) : '', en ? en.notes || '' : '', ''] });
  });
  manual.forEach(m => {
    const hours = decHrs(m.actual_start, m.actual_end);
    const b = bucket(m.staff_id);
    b.regular += hours;
    b.rows.push({ sortKey: m.date + 'zz', cells: [m.date, `Added: ${m.label || 'Manual entry'}`, fmt12(m.actual_start), fmt12(m.actual_end), hours ? hours.toFixed(2) : '', m.notes || '', ''] });
  });

  // Academy (grid classes + covered-class manual) + Off Court manual
  const proByStaff = buildProHoursByStaff(start, end);
  Object.entries(proByStaff).forEach(([id, data]) => {
    const b = bucket(id);
    b.academy = data.academy_hours; b.offCourt = data.off_court_hours;
    data.lines.forEach(l => {
      const isOffCourt = l.category === 'off_court';
      b.rows.push({ sortKey: l.date + (isOffCourt ? 'offcourt' : 'academy'), cells: [l.date, isOffCourt ? 'Off Court' : 'Academy', fmt12(l.actual_start), fmt12(l.actual_end), l.hours.toFixed(2), l.program || '', ''] });
    });
  });

  // Stringing — one row per racquet, count only (no $, per the String Log's own rule)
  const stringLogs = db.getStringLogs().filter(l => {
    if (l.strung_by == null) return false;
    const d = l.strung_date || l.date;
    return d >= start && d <= end;
  });
  stringLogs.forEach(l => {
    const b = bucket(l.strung_by);
    b.strung += 1;
    const d = l.strung_date || l.date;
    b.rows.push({ sortKey: d + 'string', cells: [d, 'Stringing', '', '', '', l.member ? `Strung for ${l.member}` : 'Strung', ''] });
  });

  // Expenses, folded in with the person instead of a separate end-of-report section
  const allItems = db.getExpenseItemsForPeriodAllStaff(start);
  Object.entries(allItems).forEach(([sid, items]) => {
    (items || []).forEach(item => {
      const amt = parseFloat(item.amount) || 0;
      const b = bucket(parseInt(sid));
      b.expenses += amt;
      b.rows.push({ sortKey: item.date + 'zzexpense', cells: [item.date, 'Expense', '', '', '', item.description || '', amt.toFixed(2)] });
    });
  });

  const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  Object.keys(byStaff)
    .sort((a, b) => byStaff[a].name.localeCompare(byStaff[b].name))
    .forEach((sid, i) => {
      const b = byStaff[sid];
      if (i > 0) lines.push('');
      lines.push(q(b.name));
      lines.push(['Date', 'Type', 'Time In', 'Time Out', 'Hours', 'Detail', 'Amount'].map(q).join(','));
      b.rows.sort((x, y) => x.sortKey.localeCompare(y.sortKey)).forEach(r => lines.push(r.cells.map(q).join(',')));
      const totalHours = b.regular + b.academy + b.offCourt;
      lines.push(['TOTAL', '', '', '', totalHours.toFixed(2), '', b.expenses.toFixed(2)].map(q).join(','));
      if (b.regular)  lines.push(['', '', '', '', 'Regular Hours', b.regular.toFixed(2), ''].map(q).join(','));
      if (b.academy)  lines.push(['', '', '', '', 'Academy Hours', b.academy.toFixed(2), ''].map(q).join(','));
      if (b.offCourt) lines.push(['', '', '', '', 'Off Court Hours', b.offCourt.toFixed(2), ''].map(q).join(','));
      if (b.strung)   lines.push(['', '', '', '', 'Strung', b.strung, ''].map(q).join(','));
    });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-summary-${start}_${end}.csv"`);
  res.send(lines.join('\n'));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Pro/teaching hours per staff for a period — confirmed classes + manual lines only
// (mirrors the pro-timesheet payroll export). Returns { staffId: { lines:[], total_hours } }.
function buildProHoursByStaff(start, end) {
  const decimalHours = (s, e2) => {
    if (!s || !e2) return 0;
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e2.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 1440;
    return m / 60;
  };
  let assignments = [], entries = [];
  try { assignments = db.getProAssignmentsForRange(start, end) || []; } catch (e) { assignments = []; }
  try { entries     = db.getProTimesheetForRange(start, end)   || []; } catch (e) { entries = []; }

  const entryMap = {};
  const manual = [];
  for (const e of entries) {
    if (e.source === 'manual') manual.push(e);
    else entryMap[`${e.staff_id}:${e.slot_id}:${e.date}`] = e;
  }
  const byStaff = {};
  const add = (staffId, line) => {
    if (!byStaff[staffId]) byStaff[staffId] = { lines: [], total_hours: 0, academy_hours: 0, off_court_hours: 0 };
    byStaff[staffId].lines.push(line);
    byStaff[staffId].total_hours += line.hours;
    if (line.category === 'off_court') byStaff[staffId].off_court_hours += line.hours;
    else byStaff[staffId].academy_hours += line.hours;   // grid classes + covered-class manual lines
  };
  for (const a of assignments) {
    const en = entryMap[`${a.staff_id}:${a.slot_id}:${a.date}`];
    if (!en || !en.actual_start) continue; // unconfirmed classes = 0 hours
    add(a.staff_id, { date: a.date, program: a.program || 'Class', actual_start: en.actual_start, actual_end: en.actual_end, hours: decimalHours(en.actual_start, en.actual_end), kind: 'class', category: 'academy' });
  }
  for (const m of manual) {
    add(m.staff_id, { date: m.date, program: m.program || 'Manual', actual_start: m.actual_start, actual_end: m.actual_end, hours: decimalHours(m.actual_start, m.actual_end), kind: 'manual', category: m.category === 'off_court' ? 'off_court' : 'academy' });
  }
  // Sort each staff's lines by date
  for (const s of Object.values(byStaff)) s.lines.sort((a, b) => a.date.localeCompare(b.date));
  return byStaff;
}

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
