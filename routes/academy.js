/**
 * academy.js — Academy management: the class catalog (seeded from the Indoor
 * Pricing sheet), waitlists, class changes/switches, and a light notes feed.
 *
 * Mounted behind requireAuth at /api/academy. Open to ALL staff — the admin desk
 * and management both make preseason changes. Acting identity resolves through
 * dev "View as" so avatars and authorship stay correct.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

// Resolve the acting identity (honours dev "View as").
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
function acting(req) { return db.getStaffById(req.actingStaffId); }
function isManagement(s) { return s && (s.role === 'admin' || s.role === 'manager'); }

// ── Classes ──────────────────────────────────────────────────────────────────
router.get('/classes', (req, res) => res.json(db.getAcademyClasses()));

router.post('/classes', (req, res) => {
  if (!req.body.program || !String(req.body.program).trim()) return res.status(400).json({ error: 'Program required' });
  res.json(db.addAcademyClass(req.body));
});

router.put('/classes/:id', (req, res) => {
  const c = db.updateAcademyClass(req.params.id, req.body);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

// ── Waitlist ─────────────────────────────────────────────────────────────────
router.get('/waitlist', (req, res) => res.json(db.getWaitlist()));

router.post('/waitlist', (req, res) => {
  if (!req.body.student_name || !String(req.body.student_name).trim()) return res.status(400).json({ error: 'Student name required' });
  res.json(db.addWaitlist({ ...req.body, created_by: req.actingStaffId }));
});

router.put('/waitlist/:id', (req, res) => {
  const w = db.updateWaitlist(req.params.id, req.body);
  if (!w) return res.status(404).json({ error: 'Not found' });
  res.json(w);
});

router.delete('/waitlist/:id', (req, res) => {
  if (!db.deleteWaitlist(req.params.id, req.actingStaffId, isManagement(acting(req)))) return res.status(403).json({ error: 'Not authorised' });
  res.json({ ok: true });
});

// Accountability chain — claim / follow-up / resolve, stamped with the acting staff
router.post('/waitlist/:id/activity', (req, res) => {
  const w = db.addWaitlistActivity(req.params.id, { action: req.body.action, note: req.body.note, actingId: req.actingStaffId });
  if (!w) return res.status(400).json({ error: 'Bad request' });
  res.json(w);
});

// ── Class changes / switches ─────────────────────────────────────────────────
router.get('/changes', (req, res) => res.json(db.getChanges()));

router.post('/changes', (req, res) => {
  if (!req.body.student_name || !String(req.body.student_name).trim()) return res.status(400).json({ error: 'Student name required' });
  res.json(db.addChange({ ...req.body, created_by: req.actingStaffId }));
});

router.put('/changes/:id', (req, res) => {
  const ch = db.updateChange(req.params.id, req.body);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  res.json(ch);
});

router.delete('/changes/:id', (req, res) => {
  if (!db.deleteChange(req.params.id, req.actingStaffId, isManagement(acting(req)))) return res.status(403).json({ error: 'Not authorised' });
  res.json({ ok: true });
});

router.post('/changes/:id/activity', (req, res) => {
  const ch = db.addChangeActivity(req.params.id, { action: req.body.action, note: req.body.note, actingId: req.actingStaffId });
  if (!ch) return res.status(400).json({ error: 'Bad request' });
  res.json(ch);
});

// ── Notes (light feed) ───────────────────────────────────────────────────────
router.get('/notes', (req, res) => res.json(db.getAcademyNotes()));

router.post('/notes', (req, res) => {
  if (!req.body.body || !String(req.body.body).trim()) return res.status(400).json({ error: 'Note required' });
  res.json(db.addAcademyNote({ body: req.body.body, created_by: req.actingStaffId }));
});

router.delete('/notes/:id', (req, res) => {
  if (!db.deleteAcademyNote(req.params.id, req.actingStaffId, isManagement(acting(req)))) return res.status(403).json({ error: 'Not authorised' });
  res.json({ ok: true });
});

module.exports = router;
