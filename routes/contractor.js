/**
 * contractor.js — independent-contractor work log, expenses (with receipt photos),
 * and project pitches, plus management approval of each.
 *
 * Mounted behind requireAuth at /api/contractor, so req.session.staffId is set.
 * Roles: a `contractor` submits their own items; `admin`/`manager` ("management")
 * approve/reject them. Other roles have no access here.
 */
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const router = express.Router();

const DATA_FILE   = process.env.DATA_FILE || path.join(__dirname, '..', 'jct-data.json');
const RECEIPTS_DIR = path.join(path.dirname(DATA_FILE), 'receipts');
const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];

function ensureDir() { if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true }); }
function findReceipt(base) {
  for (const ext of EXTS) {
    const p = path.join(RECEIPTS_DIR, `${base}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => { ensureDir(); cb(null, RECEIPTS_DIR); },
  filename: (req, file, cb) => {
    const base = `exp-${req.params.id}`;
    EXTS.forEach(ext => { try { fs.unlinkSync(path.join(RECEIPTS_DIR, `${base}${ext}`)); } catch (e) {} });
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Images or PDF only'));
  },
});

// ── Access helpers ────────────────────────────────────────────────────────────
function acting(req) { return db.getStaffById(req.session.staffId); }
function isManagement(s) { return s && (s.role === 'admin' || s.role === 'manager'); }
function isContractor(s) { return s && s.role === 'contractor'; }

// Gate: only contractors + management may touch this area at all
router.use((req, res, next) => {
  const s = acting(req);
  if (!s || (!isManagement(s) && !isContractor(s))) {
    return res.status(403).json({ error: 'Not authorised' });
  }
  req.acting = s;
  next();
});

// Contractor sees their own items; management sees everyone's.
function scopeStaffId(req) {
  if (isManagement(req.acting)) {
    return req.query.staffId ? parseInt(req.query.staffId) : null; // null = all
  }
  return req.acting.id;
}

// ── Work log ──────────────────────────────────────────────────────────────────
router.get('/work', (req, res) => res.json(db.getContractorWork(scopeStaffId(req))));

router.post('/work', (req, res) => {
  if (!isContractor(req.acting)) return res.status(403).json({ error: 'Contractors only' });
  const { date, description, hours, amount } = req.body;
  if (!date || !description) return res.status(400).json({ error: 'Date and description required' });
  res.json(db.addContractorWork({ staffId: req.acting.id, date, description, hours, amount }));
});

router.post('/work/:id/decision', (req, res) => {
  if (!isManagement(req.acting)) return res.status(403).json({ error: 'Management only' });
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  if (!db.decideContractorWork(req.params.id, req.acting.id, decision)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: decision });
});

router.delete('/work/:id', (req, res) => {
  if (!db.deleteContractorWork(req.params.id, req.acting.id)) return res.status(400).json({ error: 'Cannot delete' });
  res.json({ ok: true });
});

// ── Subcontractor hours (contractor's own subs; JCT pays them directly) ─────────
router.get('/subwork', (req, res) => res.json(db.getContractorSubWork(scopeStaffId(req))));

router.post('/subwork', (req, res) => {
  if (!isContractor(req.acting)) return res.status(403).json({ error: 'Contractors only' });
  const { workerName, date, description, hours, amount } = req.body;
  if (!workerName || !date) return res.status(400).json({ error: 'Worker name and date required' });
  res.json(db.addContractorSubWork({ staffId: req.acting.id, workerName, date, description, hours, amount }));
});

router.post('/subwork/:id/decision', (req, res) => {
  if (!isManagement(req.acting)) return res.status(403).json({ error: 'Management only' });
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  if (!db.decideContractorSubWork(req.params.id, req.acting.id, decision)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: decision });
});

router.delete('/subwork/:id', (req, res) => {
  if (!db.deleteContractorSubWork(req.params.id, req.acting.id)) return res.status(400).json({ error: 'Cannot delete' });
  res.json({ ok: true });
});

// ── Expenses ──────────────────────────────────────────────────────────────────
router.get('/expenses', (req, res) => res.json(db.getContractorExpenses(scopeStaffId(req))));

router.post('/expenses', (req, res) => {
  if (!isContractor(req.acting)) return res.status(403).json({ error: 'Contractors only' });
  const { date, vendor, amount, category } = req.body;
  if (!date || amount == null || amount === '') return res.status(400).json({ error: 'Date and amount required' });
  res.json(db.addContractorExpense({ staffId: req.acting.id, date, vendor, amount, category }));
});

router.post('/expenses/:id/decision', (req, res) => {
  if (!isManagement(req.acting)) return res.status(403).json({ error: 'Management only' });
  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  if (!db.decideContractorExpense(req.params.id, req.acting.id, decision)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: decision });
});

router.delete('/expenses/:id', (req, res) => {
  if (!db.deleteContractorExpense(req.params.id, req.acting.id)) return res.status(400).json({ error: 'Cannot delete' });
  res.json({ ok: true });
});

// Receipt upload (owner or management) / serve
router.post('/expenses/:id/receipt', (req, res, next) => {
  const exp = db.getContractorExpense(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (exp.staff_id !== req.acting.id && !isManagement(req.acting)) return res.status(403).json({ error: 'Not authorised' });
  next();
}, upload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.setContractorExpenseReceipt(req.params.id, req.file.filename);
  res.json({ ok: true, receipt: req.file.filename });
});

router.get('/expenses/:id/receipt', (req, res) => {
  const exp = db.getContractorExpense(req.params.id);
  if (!exp) return res.status(404).end();
  if (exp.staff_id !== req.acting.id && !isManagement(req.acting)) return res.status(403).end();
  const p = findReceipt(`exp-${req.params.id}`);
  if (p) return res.sendFile(p);
  res.status(404).end();
});

// ── Project pitches ─────────────────────────────────────────────────────────────
router.get('/projects', (req, res) => res.json(db.getContractorProjects(scopeStaffId(req))));

router.post('/projects', (req, res) => {
  if (!isContractor(req.acting)) return res.status(403).json({ error: 'Contractors only' });
  const { title, description, estimate } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  res.json(db.addContractorProject({ staffId: req.acting.id, title, description, estimate }));
});

router.post('/projects/:id/decision', (req, res) => {
  if (!isManagement(req.acting)) return res.status(403).json({ error: 'Management only' });
  const decision = req.body.decision === 'approved' ? 'approved' : 'declined';
  if (!db.decideContractorProject(req.params.id, req.acting.id, decision, req.body.note)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: decision });
});

router.delete('/projects/:id', (req, res) => {
  if (!db.deleteContractorProject(req.params.id, req.acting.id)) return res.status(400).json({ error: 'Cannot delete' });
  res.json({ ok: true });
});

// ── Summary (totals for a contractor) ──────────────────────────────────────────
router.get('/summary', (req, res) => {
  const sid = isManagement(req.acting) && req.query.staffId ? parseInt(req.query.staffId) : req.acting.id;
  res.json(db.getContractorSummary(sid));
});

module.exports = router;
