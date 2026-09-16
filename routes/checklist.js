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

// DELETE completion — any staff can uncheck today; admin-only for past dates
router.delete('/complete', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff) return res.status(403).json({ error: 'Not authorised' });
  const { item_id, shift, date } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  if (date !== today && staff.role !== 'admin') return res.status(403).json({ error: 'Admin only for past dates' });
  db.resetChecklistItem({ itemId: item_id, shift, date });
  sse.broadcast('checklist-update');
  res.json({ ok: true });
});

// GET compliance — per-shift "are they checking as they go?" signal for the dashboard.
// Read-only; derived from each task's phase + completed_at vs the shift start time.
// Grace windows: opening tasks on-time within 30 min of shift start (green),
// 30–60 min late = amber, 60+ = red. A tight cluster of completions = "bulk" flag.
router.get('/compliance', (req, res) => {
  const date = (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date
    : torontoDateStr();
  const defaults = db.getShiftDefaults();
  const isToday  = date === torontoDateStr();
  const nowMin   = torontoMinutes(new Date());

  const shiftMeta = { morning: 'Morning', afternoon: 'Afternoon', closing: 'Closing' };
  const shifts = Object.keys(shiftMeta).map(shift =>
    computeShiftCompliance(shift, shiftMeta[shift], date, defaults[shift] || {}, isToday, nowMin)
  );
  res.json({ date, is_today: isToday, now_min: nowMin, shifts });
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

// ── Compliance helpers ─────────────────────────────────────────────────────────
function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const [h, m] = s.split(':').map(Number);
  return (Number.isFinite(h) && Number.isFinite(m)) ? h * 60 + m : null;
}
function torontoMinutes(d) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = +parts.find(p => p.type === 'hour').value;
  const m = +parts.find(p => p.type === 'minute').value;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}
function torontoDateStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function fmt12(hhmm) {
  const mins = parseHHMM(hhmm); if (mins == null) return hhmm || '';
  let h = Math.floor(mins / 60), m = mins % 60; const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')}${ap}`;
}

function computeShiftCompliance(shift, label, date, def, isToday, nowMin) {
  const items = db.getChecklistItems(shift, date);
  const total = items.length;
  const base  = { shift, label, start: def.start || null, total };

  if (total === 0) {
    return { ...base, state: 'none', status: 'neutral', reason: 'No tasks set', complete: 0, pending: 0, start_total: 0, start_pending: 0, mins: null, bulk: false };
  }

  const done      = i => i.status === 'complete' || i.status === 'not_required';
  const complete  = items.filter(done).length;
  const pending   = items.filter(i => i.status === 'pending').length;
  const startItems = items.filter(i => i.phase === 'start');
  const startTotal   = startItems.length;
  const startPending = startItems.filter(i => i.status === 'pending').length;

  // Bulk detection: many completions crammed into a tight window = retroactive catch-up.
  const compMins = items.filter(i => i.completed_at).map(i => torontoMinutes(new Date(i.completed_at)));
  let bulk = false;
  if (compMins.length >= 4 && compMins.length >= Math.ceil(total * 0.6)) {
    const span = Math.max(...compMins) - Math.min(...compMins);
    if (span >= 0 && span <= 5) bulk = true;
  }

  const startMin = parseHHMM(def.start);
  const endMin   = parseHHMM(def.end);

  // Historical day, or shift already over → final compliance.
  const isOver = !isToday || (endMin != null && nowMin > endMin + 30);
  if (isOver) {
    let status = 'green', reason = 'Completed on time';
    if (startPending > 0) { status = 'red';   reason = `${startPending} opening task${startPending > 1 ? 's' : ''} never checked`; }
    else if (bulk)        { status = 'amber'; reason = 'Checked in a single batch'; }
    else if (pending > 0) { status = 'amber'; reason = `${pending} task${pending > 1 ? 's' : ''} left unchecked`; }
    return { ...base, state: 'done', status, reason, complete, pending, start_total: startTotal, start_pending: startPending, mins: null, bulk };
  }

  // Not started yet today.
  if (startMin != null && nowMin < startMin) {
    return { ...base, state: 'upcoming', status: 'neutral', reason: `Starts ${fmt12(def.start)}`, complete, pending, start_total: startTotal, start_pending: startPending, mins: null, bulk };
  }

  // Active shift.
  const mins = startMin != null ? Math.max(0, nowMin - startMin) : 0;
  let status = 'green', reason = 'On track';
  if (startTotal === 0) {
    status = 'green'; reason = 'No opening tasks';
  } else if (startPending === 0) {
    status = bulk ? 'amber' : 'green';
    reason = bulk ? 'Opening done, but checked in a batch' : 'Opening tasks done';
  } else if (mins <= 30) {
    status = 'green'; reason = 'Opening tasks in progress';
  } else if (mins <= 60) {
    status = 'amber'; reason = `${startPending} opening task${startPending > 1 ? 's' : ''} not checked, ${mins} min in`;
  } else {
    status = 'red'; reason = `${startPending} opening task${startPending > 1 ? 's' : ''} still not checked, ${mins} min in`;
  }
  return { ...base, state: 'active', status, reason, complete, pending, start_total: startTotal, start_pending: startPending, mins, bulk };
}

module.exports = router;
