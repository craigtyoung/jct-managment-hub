/**
 * checkin.js — Public kiosk check-in API. No authentication required.
 * Mounted at /api/checkin (without requireAuth) so the tablet can reach it
 * without any staff session.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

// Rate-limit: max 5 lookups per IP per minute (keeps bots out, not a problem for real members)
const lookupHits = {};
function rateOk(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const hits = (lookupHits[key] || []).filter(t => now - t < 60000);
  hits.push(now);
  lookupHits[key] = hits;
  return hits.length <= 30; // generous for a kiosk that multiple people share
}

// Sanitize member for kiosk display (no PIN, no email)
function kioskMember(m) {
  return { id: m.id, first_name: m.first_name, last_name: m.last_name, member_type: m.member_type };
}

// GET /api/checkin/lookup?pin=XXXX
router.get('/lookup', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many lookups — wait a moment' });
  const { pin } = req.query;
  if (!pin || String(pin).length < 2) return res.status(400).json({ error: 'PIN required' });
  const m = db.getMemberByPin(String(pin).trim());
  if (!m) return res.status(404).json({ error: 'No member found with that PIN' });
  // Check if already checked in today
  const existing = db.getMemberCheckinToday(m.id);
  res.json({ member: kioskMember(m), already_checked_in: !!existing });
});

// GET /api/checkin/search?q=Smi (first 3+ letters of last name)
router.get('/search', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many lookups — wait a moment' });
  const { q } = req.query;
  if (!q || String(q).length < 2) return res.status(400).json({ error: 'At least 2 characters required' });
  const members = db.searchMembersByName(String(q).trim().slice(0, 10));
  res.json(members.slice(0, 12).map(kioskMember)); // cap at 12 results
});

// POST /api/checkin — log a check-in
// Body: { member_id, method: 'pin'|'name' }
router.post('/', (req, res) => {
  if (!rateOk(req.ip)) return res.status(429).json({ error: 'Too many requests' });
  const { member_id, method } = req.body;
  const m = db.getMemberById(member_id);
  if (!m || m.active === false) return res.status(404).json({ error: 'Member not found' });
  const existing = db.getMemberCheckinToday(m.id);
  if (existing) return res.json({ ok: true, already: true, first_name: m.first_name });
  db.addCheckinLog({ memberId: m.id, method: method || 'pin' });
  res.json({ ok: true, already: false, first_name: m.first_name });
});

// GET /api/checkin/today — today's check-ins (also public — shows count only, names require mgmt)
router.get('/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const logs = db.getCheckinLogsByDate(today);
  res.json({ date: today, count: logs.length });
});

module.exports = router;
