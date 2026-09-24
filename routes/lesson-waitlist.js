/**
 * lesson-waitlist.js — Private Lesson Waiting List.
 *
 * Admin/managers log a member/guest who wants a private lesson (name, date,
 * member?, level, phone, email). Pros view the list to pick lessons up and can
 * "claim" one. Distinct from the court/open-spots waitlist (routes/waitlist.js).
 *
 * Mounted behind requireAuth at /api/lesson-waitlist.
 */
const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

function acting(req) { return db.getStaffById(req.session.staffId); }
function isManagement(s) { return s && (s.role === 'admin' || s.role === 'manager'); }
function isPro(s) { return !!(s && db.isTeachingPro(s.id)); }

// GET / — the whole list (any signed-in staff may view)
router.get('/', (req, res) => res.json(db.getLessonInquiries()));

// POST / — add an inquiry (management only)
router.post('/', (req, res) => {
  const me = acting(req);
  if (!isManagement(me)) return res.status(403).json({ error: 'Management only' });
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  const rec = db.addLessonInquiry({
    name: req.body.name,
    inquiryDate: req.body.inquiry_date,
    isMember: req.body.is_member === true || req.body.is_member === 'true',
    level: req.body.level,
    phone: req.body.phone,
    email: req.body.email,
    requestedPro: req.body.requested_pro,
    notes: req.body.notes,
    addedBy: req.session.staffId,
  });
  try { sse.broadcast('update'); } catch (e) {}
  res.json(rec);
});

// PUT /:id — edit any field / status / assignment (management only)
router.put('/:id', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  const rec = db.updateLessonInquiry(req.params.id, req.body || {});
  if (!rec) return res.status(404).json({ error: 'Not found' });
  try { sse.broadcast('update'); } catch (e) {}
  res.json(rec);
});

// POST /:id/claim — a pro (or management) claims/unclaims the lesson
router.post('/:id/claim', (req, res) => {
  const me = acting(req);
  if (!isPro(me) && !isManagement(me)) return res.status(403).json({ error: 'Pros or management only' });
  const list = db.getLessonInquiries();
  const cur = list.find(i => i.id === parseInt(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const mine = cur.assigned_pro === me.id;
  const rec = db.updateLessonInquiry(req.params.id, {
    assigned_pro: mine ? null : me.id,
    status: mine ? 'open' : 'scheduled',
  });
  try { sse.broadcast('update'); } catch (e) {}
  res.json(rec);
});

// DELETE /:id — remove (management only)
router.delete('/:id', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  if (!db.deleteLessonInquiry(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try { sse.broadcast('update'); } catch (e) {}
  res.json({ ok: true });
});

module.exports = router;
