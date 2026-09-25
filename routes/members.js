/**
 * members.js — Member management API. Auth required; add/edit/deactivate is manager+.
 * Mounted at /api/members with requireAuth.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

function isMgmt(id) { const s = db.getStaffById(id); return s && ['admin', 'manager'].includes(s.role); }

// GET /api/members — list all members
router.get('/', (req, res) => {
  const includeInactive = req.query.inactive === '1' && isMgmt(req.actingStaffId);
  const members = db.getAllMembers(includeInactive);
  // Hide PINs from non-management
  const safe = members.map(m => {
    const out = { ...m };
    if (!isMgmt(req.actingStaffId)) { delete out.pin; delete out.phone; delete out.email; }
    return out;
  });
  res.json(safe);
});

// POST /api/members — add a member (manager+)
router.post('/', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const { first_name, last_name, club_number, phone, email, pin, member_type } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name required' });
  const id = db.addMember({ firstName: first_name, lastName: last_name, clubNumber: club_number, phone, email, pin, memberType: member_type });
  res.json({ ok: true, id });
});

// PUT /api/members/:id — update member (manager+)
router.put('/:id', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const { first_name, last_name, club_number, phone, email, pin, member_type, active } = req.body;
  const updated = db.updateMember(req.params.id, {
    firstName: first_name, lastName: last_name, clubNumber: club_number, phone, email, pin, memberType: member_type, active,
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/members/:id — deactivate a member (manager+)
router.delete('/:id', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  if (!db.deactivateMember(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// GET /api/members/checkins?date=YYYY-MM-DD — today's check-in log with names (manager+)
router.get('/checkins', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(db.getCheckinLogsByDate(date));
});

// ─── GameTime CSV import ─────────────────────────────────────────────────────
// GameTime exports "Name,Club Number,Email,Phone" with Name as "Last, First"
// and multi-value phone fields quoted (e.g. "9058426454(H) 9053397454(M)").
// A minimal RFC4180-ish parser — quotes, doubled-quote escaping, CRLF/LF.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip, \n handles the line break */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// A club number that doesn't look like the normal M/S/J + digits pattern —
// GameTime exports carry a handful of joke/test rows (RF001 "Federer, Roger",
// JD123 "Doe, John", GAMETIME "TEST, GT TEST") that shouldn't auto-import.
const CLUB_NUM_RE = /^[MSJ]\d+$/i;

router.post('/import/preview', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const csv = String((req.body || {}).csv || '');
  if (!csv.trim()) return res.status(400).json({ error: 'No CSV text received' });
  const allRows = parseCsv(csv).filter(r => r.some(f => String(f || '').trim()));
  if (!allRows.length) return res.status(400).json({ error: 'CSV appears empty' });
  const dataRows = /name/i.test(allRows[0][0] || '') ? allRows.slice(1) : allRows;

  const result = { new: [], existing: [], flagged: [], skipped: 0 };
  dataRows.forEach(cols => {
    const rawName = String(cols[0] || '').trim();
    const clubNumber = String(cols[1] || '').trim().toUpperCase();
    const email = String(cols[2] || '').trim();
    const phone = String(cols[3] || '').trim();
    if (!rawName || !clubNumber) return;
    // "1, Guest" / "905-257-5019, Call to Book" — placeholder/utility rows Craig
    // said to disregard, identified by the name starting with a digit.
    if (/^\d/.test(rawName)) { result.skipped++; return; }
    const commaIdx = rawName.indexOf(',');
    const last_name = commaIdx === -1 ? rawName : rawName.slice(0, commaIdx).trim();
    const first_name = commaIdx === -1 ? '' : rawName.slice(commaIdx + 1).trim();
    const row = { first_name, last_name, club_number: clubNumber, email, phone };

    const existing = db.getMemberByClubNumber(clubNumber);
    if (existing) { result.existing.push(row); return; }
    if (!CLUB_NUM_RE.test(clubNumber)) { row.reason = `Unusual member number format ("${clubNumber}") — check it's a real member before importing.`; result.flagged.push(row); return; }
    result.new.push(row);
  });
  res.json(result);
});

router.post('/import/commit', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const rows = Array.isArray((req.body || {}).rows) ? req.body.rows : [];
  let added = 0;
  const errors = [];
  rows.forEach(r => {
    if (!r || !r.first_name || !r.last_name) { errors.push(r && r.club_number || '(unknown)'); return; }
    // Skip if it slipped in twice in the same batch or was added between preview and commit.
    if (r.club_number && db.getMemberByClubNumber(r.club_number)) return;
    db.addMember({ firstName: r.first_name, lastName: r.last_name, clubNumber: r.club_number, phone: r.phone, email: r.email, memberType: 'full' });
    added++;
  });
  res.json({ ok: true, added, errors });
});

module.exports = router;
