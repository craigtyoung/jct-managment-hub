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

module.exports = router;
