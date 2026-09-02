const express = require('express');
const db = require('../db');
const sse = require('../sse');
const push = require('../push');
const router = express.Router();

// Resolve the acting identity for every request. Admins in "View as" mode act as
// the viewed staff member; everyone else acts as themselves.
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// GET messages — paginated, newest first
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const offset = parseInt(req.query.offset) || 0;
  const messages = db.getMessages({ limit, offset, staffId: req.actingStaffId });
  res.json(messages);
});

// GET unread count for current user
router.get('/unread-count', (req, res) => {
  const count = db.getUnreadCount(req.actingStaffId);
  res.json({ count });
});

// GET comms audience (for read receipts + recipient picker).
// Comms is office + management only for now — teaching pros are excluded.
router.get('/staff-list', (req, res) => {
  res.json(db.getAllStaff().filter(s => s.role !== 'pro'));
});

// POST new message
router.post('/', (req, res) => {
  const { content, shift, category } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  const validShifts = ['morning', 'afternoon', 'evening', 'general'];
  // recipients: array of staff IDs or empty/absent = everyone
  const recipients = Array.isArray(req.body.recipients) && req.body.recipients.length > 0
    ? req.body.recipients.map(Number)
    : null;

  const id = db.createMessage({
    staffId: req.actingStaffId,
    content: content.trim(),
    shift: validShifts.includes(shift) ? shift : 'general',
    category,
    recipients,
    show_on: req.body.show_on,
  });
  sse.broadcast('update');

  // Push notifications to the intended recipients (never the author), respecting
  // targeting: an everyone-note goes to all comms staff; a targeted note only to
  // its recipients. Fire-and-forget.
  try {
    const author = db.getStaffById(req.actingStaffId);
    const targetIds = recipients
      ? recipients.filter(sid => sid !== req.actingStaffId)
      : db.getAllStaff().filter(s => s.role !== 'pro' && s.id !== req.actingStaffId).map(s => s.id);
    push.sendToStaff(targetIds, {
      title: (author ? author.name : 'JCT Staff Hub') + (recipients ? ' · sent to you' : ''),
      body: content.trim().slice(0, 140),
      url: '/comms.html',
      tag: 'jct-comms-' + id,
    });
  } catch (e) { console.error('push send failed:', e.message); }

  res.json({ ok: true, id });
});

// POST mark as read
router.post('/:id/read', (req, res) => {
  db.markRead(req.params.id, req.actingStaffId);
  res.json({ ok: true });
});

// POST reply
router.post('/:id/reply', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  if (!db.getMessage(req.params.id)) return res.status(404).json({ error: 'Message not found' });
  db.createReply({ messageId: req.params.id, staffId: req.actingStaffId, content: content.trim() });
  sse.broadcast('update');
  res.json({ ok: true });
});

// DELETE all messages for a given day — must be before /:id (admin only)
router.delete('/day/:date', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || staff.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const count = db.clearDay(req.params.date);
  sse.broadcast('update');
  res.json({ ok: true, deleted: count });
});

// DELETE a single message (admin or manager only)
router.delete('/:id', (req, res) => {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  db.deleteMessage(req.params.id);
  sse.broadcast('update');
  res.json({ ok: true });
});

module.exports = router;
