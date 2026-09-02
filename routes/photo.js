const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const router = express.Router();

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'jct-data.json');
const PHOTOS_DIR = path.join(path.dirname(DATA_FILE), 'staff-photos');

const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function findPhotoPath(id) {
  for (const ext of EXTS) {
    const p = path.join(PHOTOS_DIR, `${id}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function ensureDir() {
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => { ensureDir(); cb(null, PHOTOS_DIR); },
  filename: (req, file, cb) => {
    // Remove any existing photo for this staff member
    EXTS.forEach(ext => {
      try { fs.unlinkSync(path.join(PHOTOS_DIR, `${req.params.id}${ext}`)); } catch(e) {}
    });
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// GET /api/staff/:id/photo — serve the photo (auth is enforced by server.js)
router.get('/:id/photo', (req, res) => {
  const p = findPhotoPath(req.params.id);
  if (p) return res.sendFile(p);
  res.status(404).end();
});

// POST /api/staff/:id/photo — upload. Management may set anyone's photo; any
// staff member may set their OWN (self-service account panel).
router.post('/:id/photo',
  (req, res, next) => {
    const acting = db.getStaffById(req.session.staffId);
    const isSelf = acting && String(acting.id) === String(req.params.id);
    const isManagement = acting && ['admin', 'manager'].includes(acting.role);
    if (!isSelf && !isManagement) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    next();
  },
  upload.single('photo'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    res.json({ ok: true });
  }
);

// DELETE /api/staff/:id/photo — remove (admin only)
router.delete('/:id/photo', (req, res) => {
  const acting = db.getStaffById(req.session.staffId);
  if (!acting || acting.role !== 'admin') return res.status(403).json({ error: 'Not authorised' });
  const p = findPhotoPath(req.params.id);
  if (p) try { fs.unlinkSync(p); } catch(e) {}
  res.json({ ok: true });
});

module.exports = router;
