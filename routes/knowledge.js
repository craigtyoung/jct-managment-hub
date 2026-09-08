const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

// Acting identity
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

// Management (admin/manager) only — the knowledge base is club-config, not staff-editable.
function requireMgmt(req, res) {
  const staff = db.getStaffById(req.actingStaffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    res.status(403).json({ error: 'Management only' });
    return null;
  }
  return staff;
}

// Fetch a URL and reduce it to readable plain text (a snapshot the assistant can read).
async function fetchUrlText(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are supported');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'JCT-Staff-Hub/1.0' } });
    if (!r.ok) throw new Error(`Fetch failed (HTTP ${r.status})`);
    const html = await r.text();
    return htmlToText(html);
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html) {
  let t = String(html);
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
  t = t.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  return t.slice(0, 40000);
}

// GET all docs
router.get('/', (req, res) => {
  if (!requireMgmt(req, res)) return;
  res.json(db.getKnowledgeDocs());
});

// POST create — text doc, or url doc (fetched + snapshotted on save)
router.post('/', async (req, res) => {
  if (!requireMgmt(req, res)) return;
  const { title, category, source_type, url } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
  let body = req.body.body || '';
  let note = null;
  if (source_type === 'url') {
    if (!url || !String(url).trim()) return res.status(400).json({ error: 'URL is required' });
    try { body = await fetchUrlText(String(url).trim()); }
    catch (e) { body = ''; note = 'Could not fetch the page (' + e.message + '). Saved as a reference — you can paste the content in manually.'; }
  }
  const id = db.createKnowledgeDoc({ title, category, source_type, url, body, staffId: req.actingStaffId });
  sse.broadcast('update');
  res.json({ ok: true, id, note });
});

// PUT update a doc (title/category/body/url)
router.put('/:id', (req, res) => {
  if (!requireMgmt(req, res)) return;
  const d = db.updateKnowledgeDoc(req.params.id, { ...req.body, staffId: req.actingStaffId });
  if (!d) return res.status(404).json({ error: 'Doc not found' });
  sse.broadcast('update');
  res.json({ ok: true });
});

// POST re-fetch a URL doc's snapshot
router.post('/:id/refresh', async (req, res) => {
  if (!requireMgmt(req, res)) return;
  const doc = db.getKnowledgeDocs().find(x => x.id === parseInt(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Doc not found' });
  if (doc.source_type !== 'url' || !doc.url) return res.status(400).json({ error: 'Not a URL doc' });
  try {
    const body = await fetchUrlText(doc.url);
    db.updateKnowledgeDoc(doc.id, { body, staffId: req.actingStaffId });
    sse.broadcast('update');
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Could not fetch: ' + e.message });
  }
});

// DELETE a doc
router.delete('/:id', (req, res) => {
  if (!requireMgmt(req, res)) return;
  db.deleteKnowledgeDoc(req.params.id);
  sse.broadcast('update');
  res.json({ ok: true });
});

module.exports = router;
