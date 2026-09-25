/**
 * help.js — contextual "?" icon content shown on staff hub pages. Read by any
 * logged-in staff member; editable in-app by management only, no redeploy
 * needed to fix wording as pages change. Mounted behind requireAuth at /api/help.
 */
const express = require('express');
const db = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
function isMgmt(id) { const s = db.getStaffById(id); return s && ['admin', 'manager'].includes(s.role); }

router.get('/:page', (req, res) => res.json(db.getPageHelp(req.params.page)));

router.put('/:page', (req, res) => {
  if (!isMgmt(req.actingStaffId)) return res.status(403).json({ error: 'Management only' });
  const r = db.setPageHelp(req.params.page, (req.body || {}).content, req.actingStaffId);
  if (r.error) return res.status(r.status || 400).json(r);
  res.json(r);
});

module.exports = router;
