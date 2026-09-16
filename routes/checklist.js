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

  // "not_required" counts as handled, same as complete.
  const done     = i => i.status === 'complete' || i.status === 'not_required';
  const complete = items.filter(done).length;
  const pending  = items.filter(i => i.status === 'pending').length;

  const startMin = parseHHMM(def.start);
  const endMin   = parseHHMM(def.end);
  const mk = (state, status, reason) => ({ ...base, state, status, reason, complete, pending, mins_left: (endMin != null && isToday) ? endMin - nowMin : null });

  // Historical day, or shift already over → final tally, no pressure.
  const isOver = !isToday || (endMin != null && nowMin > endMin + 30);
  if (isOver) {
    if (pending === 0) return mk('done', 'green', 'All tasks done');
    return mk('done', 'amber', `${pending} of ${total} task${pending > 1 ? 's' : ''} left unchecked`);
  }

  // Not started yet today → neutral, no pressure.
  if (startMin != null && nowMin < startMin) {
    return mk('upcoming', 'neutral', `Starts ${fmt12(def.start)}`);
  }

  // Active shift. We DON'T nag at the start — staff are encouraged to check as they
  // go. We only flag as the shift nears its end and things are still undone. Fair.
  if (pending === 0) return mk('active', 'green', 'All tasks done');

  const minsLeft = endMin != null ? endMin - nowMin : null;
  if (minsLeft == null || minsLeft > 120) {
    // Plenty of time left — no pressure, just show progress.
    return mk('active', 'green', `${complete}/${total} done · check the rest as you go`);
  }
  if (complete === 0) {
    // Nothing checked and the shift is winding down — the real flag.
    return mk('active', 'red', `Nothing checked yet, ${minsLeft <= 60 ? 'under an hour' : 'under 2 hours'} left in the shift`);
  }
  if (minsLeft > 60) {
    return mk('active', 'amber', `${pending} of ${total} left — finish them before the shift ends`);
  }
  return mk('active', 'red', `${pending} of ${total} still not done, under an hour left`);
}

module.exports = router;
