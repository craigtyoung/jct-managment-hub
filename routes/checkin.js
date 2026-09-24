/**
 * checkin.js — Public kiosk check-in API. No authentication required.
 * Mounted at /api/checkin (without requireAuth) so the tablet can reach it
 * without any staff session.
 */
const express = require('express');
const db      = require('../db');
const sse     = require('../sse');
const router  = express.Router();

// Rate-limit: max 30 lookups per IP per minute (generous for a shared kiosk)
const lookupHits = {};
function rateOk(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const hits = (lookupHits[key] || []).filter(t => now - t < 60000);
  hits.push(now);
  lookupHits[key] = hits;
  return hits.length <= 30;
}

// Sanitize member for kiosk display (no PIN, no email)
function kioskMember(m) {
  return { id: m.id, first_name: m.first_name, last_name: m.last_name, club_number: m.club_number, member_type: m.member_type };
}

// GET /api/checkin/lookup?pin=XXXX
router.get('/lookup', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many lookups — wait a moment' });
  const { pin } = req.query;
  if (!pin || String(pin).length < 2) return res.status(400).json({ error: 'PIN required' });
  const m = db.getMemberByPin(String(pin).trim());
  if (!m) return res.status(404).json({ error: 'No member found with that PIN' });
  const existing = db.getMemberCheckinToday(m.id);
  res.json({ member: kioskMember(m), already_checked_in: !!existing });
});

// GET /api/checkin/search?q=Smi (first 2+ letters of name or club number)
router.get('/search', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many lookups — wait a moment' });
  const { q } = req.query;
  if (!q || String(q).length < 2) return res.status(400).json({ error: 'At least 2 characters required' });
  const members = db.searchMembersByName(String(q).trim().slice(0, 10));
  res.json(members.slice(0, 12).map(kioskMember));
});

// POST /api/checkin — log a check-in (logs both; flags duplicates)
// Body: { member_id, method: 'pin'|'name'|'staff' }
router.post('/', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many requests' });
  const { member_id, method } = req.body;
  const m = db.getMemberById(member_id);
  if (!m || m.active === false) return res.status(404).json({ error: 'Member not found' });
  const { id, duplicate } = db.addCheckinLog({ memberId: m.id, method: method || 'pin' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true, duplicate, first_name: m.first_name, last_name: m.last_name, club_number: m.club_number });
});

// GET /api/checkin/today — public count (for kiosk display)
router.get('/today', (req, res) => {
  const today = db.todayLocal();
  const logs = db.getCheckinLogsByDate(today);
  res.json({ date: today, count: logs.length });
});

// GET /api/checkin/feed?date=YYYY-MM-DD — authenticated, full list with member detail
// Restricted to office/admin roles (admin, manager, staff) — not pro or contractor; falls back to today if no date given
router.get('/feed', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager', 'staff'].includes(staff.role)) return res.status(403).json({ error: 'Admin staff only' });
  const date = req.query.date || db.todayLocal();
  const logs = db.getCheckinLogsByDate(date);
  // Enrich with club_number
  const byId = {};
  (db.getAllMembers(true) || []).forEach(m => { byId[m.id] = m; });
  const enriched = logs.map(l => {
    const m = byId[l.member_id] || {};
    return { ...l, club_number: m.club_number || '—', member_type: m.member_type || '—' };
  });
  res.json({ date, count: enriched.length, logs: enriched });
});

// POST /api/checkin/guest — staff logs a guest sign-in (no member record needed)
// Body: { guestName, hostMemberId, court }. Access: admin, manager, staff.
router.post('/guest', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager', 'staff'].includes(staff.role)) return res.status(403).json({ error: 'Admin staff only' });
  const { guestName, hostMemberId, court } = req.body;
  if (!guestName || !String(guestName).trim()) return res.status(400).json({ error: 'Guest name required' });
  const result = db.addGuestCheckinLog({ guestName, hostMemberId, court });
  if (!result) return res.status(400).json({ error: 'Guest name required' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true, id: result.id });
});

// PATCH /api/checkin/:id/court — staff assigns/changes which court (1–6) a checked-in member is on
// Body: { court: 1-6 | null }. Same access as /feed: admin, manager, staff.
router.patch('/:id/court', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager', 'staff'].includes(staff.role)) return res.status(403).json({ error: 'Admin staff only' });
  const { court } = req.body;
  const ok = db.setCheckinCourt(req.params.id, court);
  if (!ok) return res.status(400).json({ error: 'Court must be 1–6, or blank to clear' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true });
});

// PATCH /:id/lesson — name the pro on a private lesson (and how long it ran).
// Blank pro clears it back to a regular booking.
router.patch('/:id/lesson', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager', 'staff'].includes(staff.role)) return res.status(403).json({ error: 'Admin staff only' });
  const ok = db.setCheckinLesson(req.params.id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'Check-in not found' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true });
});

// GET /schedule — today's programmed court usage (classes, clinics, programs),
// read straight from the Court Schedule. Read-only on purpose: the schedule is
// edited in one place and only *drawn* here, as the backdrop staff reconcile
// check-ins against. Served from this route so front desk can see it without
// needing access to the scheduling area itself.
router.get('/schedule', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Built from parts: new Date('YYYY-MM-DD') is parsed as UTC, which rolls back
  // a day in Toronto and would show the wrong day's schedule every morning.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : db.todayLocal();
  const [y, m, d] = iso.split('-').map(Number);
  const dayName = DAYS[new Date(y, m - 1, d).getDay()];
  const slots = (db.getProScheduleSlots() || []).filter(s => s.active !== false && s.day === dayName);
  res.json(slots.map(s => ({
    id: s.id, start: s.start, end: s.end, time_label: s.time_label,
    program: s.program, category: s.category, type: s.type,
    courts: (s.courts || (s.court ? [String(s.court)] : [])).map(String),
  })));
});

// GET /pros — teaching pros + coaching managers, for the lesson picker
router.get('/pros', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  res.json(db.getAllStaff()
    .filter(s => ['pro', 'manager'].includes(s.role))
    .map(s => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name)));
});

// PATCH /:id/time — move a booking to another slot (and court). Desk staff can
// do this; it's correcting an arrival time, not deleting anything.
router.patch('/:id/time', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager', 'staff'].includes(staff.role)) return res.status(403).json({ error: 'Admin staff only' });
  if (!db.setCheckinTime(req.params.id, req.body.time, req.body.court))
    return res.status(400).json({ error: 'Need a valid HH:MM time, and court 1-6 if given' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true });
});

// DELETE /:id — remove a check-in entirely (admin only). Court staff can
// un-assign a court; only an admin can erase the record.
router.delete('/:id', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || staff.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  if (!db.deleteCheckin(req.params.id)) return res.status(404).json({ error: 'Check-in not found' });
  try { sse.broadcast('checkin-update'); } catch (e) {}
  res.json({ ok: true });
});

module.exports = router;
