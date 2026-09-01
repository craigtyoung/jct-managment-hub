/**
 * ideas.js — the club Idea Board: rich idea cards (photo + link + category),
 * upvotes, a New→Considering→Planned→Done status journey, threaded comments,
 * and staff-reported member suggestions (named or anonymous).
 *
 * Mounted behind requireAuth at /api/ideas. Any staff member can post, vote, and
 * comment. Management (admin/manager) sets status. Authors + management delete.
 */
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const router = express.Router();

const DATA_FILE  = process.env.DATA_FILE || path.join(__dirname, '..', 'jct-data.json');
const IDEAS_DIR  = path.join(path.dirname(DATA_FILE), 'ideas');
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
function findImage(base) {
  for (const ext of EXTS) { const p = path.join(IDEAS_DIR, `${base}${ext}`); if (fs.existsSync(p)) return p; }
  return null;
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => { if (!fs.existsSync(IDEAS_DIR)) fs.mkdirSync(IDEAS_DIR, { recursive: true }); cb(null, IDEAS_DIR); },
  filename: (req, file, cb) => {
    const base = `idea-${req.params.id}`;
    EXTS.forEach(ext => { try { fs.unlinkSync(path.join(IDEAS_DIR, `${base}${ext}`)); } catch (e) {} });
    cb(null, `${base}${path.extname(file.originalname).toLowerCase() || '.jpg'}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

function acting(req) { return db.getStaffById(req.session.staffId); }
function isManagement(s) { return s && (s.role === 'admin' || s.role === 'manager'); }

// ── Ideas ───────────────────────────────────────────────────────────────────
router.get('/', (req, res) => res.json(db.getIdeas(req.session.staffId)));

router.get('/:id', (req, res) => {
  const idea = db.getIdeaOut(req.params.id, req.session.staffId);
  if (!idea) return res.status(404).json({ error: 'Not found' });
  res.json(idea);
});

router.post('/', (req, res) => {
  const { title, body, category, link, linkTitle, source, memberName } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
  res.json(db.addIdea({ authorId: req.session.staffId, title, body, category, link, linkTitle, source, memberName }));
});

router.delete('/:id', (req, res) => {
  if (!db.deleteIdea(req.params.id, req.session.staffId, isManagement(acting(req)))) return res.status(403).json({ error: 'Not authorised' });
  res.json({ ok: true });
});

// Vote (toggle) — any staff
router.post('/:id/vote', (req, res) => {
  const r = db.toggleIdeaVote(req.params.id, req.session.staffId);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// Status — management only
router.post('/:id/status', (req, res) => {
  if (!isManagement(acting(req))) return res.status(403).json({ error: 'Management only' });
  if (!db.setIdeaStatus(req.params.id, req.body.status)) return res.status(400).json({ error: 'Bad status' });
  res.json({ ok: true, status: req.body.status });
});

// Image — author or management upload; anyone signed in can view
router.post('/:id/image', (req, res, next) => {
  const idea = db.getIdea(req.params.id);
  if (!idea) return res.status(404).json({ error: 'Not found' });
  if (idea.author_id !== req.session.staffId && !isManagement(acting(req))) return res.status(403).json({ error: 'Not authorised' });
  next();
}, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  db.setIdeaImage(req.params.id, req.file.filename);
  res.json({ ok: true, image: req.file.filename });
});

router.get('/:id/image', (req, res) => {
  const p = findImage(`idea-${req.params.id}`);
  if (p) return res.sendFile(p);
  res.status(404).end();
});

// ── Comments ────────────────────────────────────────────────────────────────
router.get('/:id/comments', (req, res) => res.json(db.getIdeaComments(req.params.id)));

router.post('/:id/comments', (req, res) => {
  if (!req.body.content || !String(req.body.content).trim()) return res.status(400).json({ error: 'Comment required' });
  res.json(db.addIdeaComment({ ideaId: req.params.id, authorId: req.session.staffId, content: req.body.content }));
});

router.delete('/comments/:commentId', (req, res) => {
  if (!db.deleteIdeaComment(req.params.commentId, req.session.staffId, isManagement(acting(req)))) return res.status(403).json({ error: 'Not authorised' });
  res.json({ ok: true });
});

module.exports = router;
