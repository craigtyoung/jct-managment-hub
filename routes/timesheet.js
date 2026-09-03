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

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET a pay period's scheduled shifts + timesheet entries merged
// ?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/week', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const start = req.query.start || periodStart(today);
  const end   = req.query.end   || periodEnd(start);

  const assignments = db.getAssignmentsForRange(start, end);
  const entries     = db.getTimesheetForRange(start, end);
  const defaults    = db.getShiftDefaults();
  const overrides   = db.getTimeOverridesForRange(start, end);
  const periodExp   = db.getPeriodExpensesForRange(start);

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
      timesheet_id:    entry ? entry.id           : null,
      notes:           entry ? entry.notes        : '',
    };
  });

  res.json({ start, end, rows, defaults, period_expenses: periodExp, period_receipts: db.getPeriodReceiptsForRange(start) });
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

  const entryMap = {};
  for (const e of entries) entryMap[`${e.staff_id}:${e.date}:${e.shift}`] = e;

  const q = c => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const hrs = (s, e2) => {
    if (!s || !e2) return '';
    const [sh, sm] = s.split(':').map(Number), [eh, em] = e2.split(':').map(Number);
    let m = (eh * 60 + em) - (sh * 60 + sm); if (m < 0) m += 1440;
    return (m / 60).toFixed(2);
  };

  const lines = [];
  lines.push(['Staff', 'Date', 'Shift', 'Scheduled Start', 'Scheduled End', 'Actual Start', 'Actual End', 'Hours', 'Notes'].map(q).join(','));
  assignments.slice().sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift)).forEach(a => {
    const key = `${a.staff_id}:${a.date}:${a.shift}`;
    const en = entryMap[key]; const def = defaults[a.shift] || {}; const ov = overrides[`${a.date}:${a.shift}`] || null;
    const s = db.getStaffById(a.staff_id);
    const as = en ? en.actual_start : null, ae = en ? en.actual_end : null;
    lines.push([
      s ? s.name : a.staff_id, a.date, a.shift,
      ov?.start || def.start || '', ov?.end || def.end || '',
      as || '', ae || '', hrs(as, ae), en ? en.notes : ''
    ].map(q).join(','));
  });
  lines.push('');
  lines.push(['Period Expenses (by staff)'].map(q).join(','));
  Object.entries(periodExp || {}).forEach(([sid, val]) => {
    const s = db.getStaffById(parseInt(sid));
    const amt = (val && typeof val === 'object') ? (val.total != null ? val.total : '') : val;
    lines.push([s ? s.name : sid, amt].map(q).join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${start}_${end}.csv"`);
  res.send(lines.join('\n'));
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
