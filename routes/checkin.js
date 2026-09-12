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
  const today = new Date().toISOString().slice(0, 10);
  const logs = db.getCheckinLogsByDate(today);
  res.json({ date: today, count: logs.length });
});

// GET /api/checkin/feed?date=YYYY-MM-DD — authenticated, full list with member detail
// Restricted to admin/manager roles; falls back to today if no date given
router.get('/feed', (req, res) => {
  if (!req.session?.staffId) return res.status(401).json({ error: 'Auth required' });
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) return res.status(403).json({ error: 'Management only' });
  const date = req.query.date || new Date().toISOString().slice(0, 10);
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

module.exports = router;
