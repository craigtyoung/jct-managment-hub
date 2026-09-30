/**
 * apparel.js — Pro Shop → Academy Apparel. Free performance tees issued to Performance
 * Academy classes and pros. Flow: a request is logged → an approver approves → it is marked
 * issued (stock drops then). Counts only — no money, no student names.
 * Management only for now (see DESK_ROLES). Mounted behind requireAuth at /api/apparel.
 */
const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

// Who may see and use the tracker at all. Opened to front desk 2026-09-30 (was management-only).
const DESK_ROLES = ['admin', 'manager', 'staff'];
// Roster check-off (below) is also usable by pros directly — they're the ones at the class.
const ROSTER_ROLES = [...DESK_ROLES, 'pro'];

router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});

const roleOf = id => { const s = db.getStaffById(id); return s ? s.role : null; };
const isDesk = id => DESK_ROLES.includes(roleOf(id));
const isRoster = id => ROSTER_ROLES.includes(roleOf(id));
const isMgmt = id => ['admin', 'manager'].includes(roleOf(id));   // stock corrections, reversals, settings

// Result of a db action → HTTP response (+ live-refresh everyone on success).
function reply(res, r) {
  if (r.error) return res.status(r.status || 400).json(r);
  sse.broadcast('update');
  res.json(r);
}
const guard = (test, msg) => (req, res, next) => test(req.actingStaffId) ? next() : res.status(403).json({ error: msg });

// Roster check-off — registered ahead of the DESK_ROLES gate below so pros (not desk staff)
// can reach it too. This is the "pro checks off their class list" workflow, separate from the
// by-class request flow, which stays desk/management only.
router.get('/roster', guard(isRoster, 'Not available for your role'), (req, res) => res.json(db.getApparelRoster()));
router.post('/roster/:id/size', guard(isRoster, 'Not available for your role'),
  (req, res) => reply(res, db.setApparelRosterSize(req.params.id, (req.body || {}).size)));
router.post('/roster/:id/issue', guard(isRoster, 'Not available for your role'),
  (req, res) => reply(res, db.issueApparelRosterShirt(req.params.id, req.actingStaffId)));
router.post('/roster/:id/unissue', guard(isMgmt, 'Management only'),
  (req, res) => reply(res, db.unissueApparelRosterShirt(req.params.id, req.actingStaffId)));

// Nothing below here is visible outside DESK_ROLES.
router.use(guard(isDesk, 'Academy Apparel is management only for now'));

// Everything the page needs in one call (stock grid, counts, and what this user may do).
router.get('/summary', (req, res) => {
  const id = req.actingStaffId;
  res.json({ ...db.getApparelSummary(), perms: { desk: true, approve: db.canApproveApparel(id), manage: isMgmt(id) } });
});
router.get('/classes', (req, res) => res.json(db.getApparelClasses()));
router.get('/pros', (req, res) => res.json(db.getApparelPros()));
router.get('/requests', (req, res) => res.json(db.getApparelRequests()));
router.get('/by-class', (req, res) => res.json(db.getApparelByClass()));

// Requests
router.post('/requests', (req, res) => reply(res, db.addApparelRequest(req.body || {}, req.actingStaffId)));
router.post('/requests/:id/approve', guard(id => db.canApproveApparel(id), 'Only an approver can approve'),
  (req, res) => reply(res, db.approveApparelRequest(req.params.id, req.actingStaffId)));
router.post('/requests/:id/decline', guard(id => db.canApproveApparel(id), 'Only an approver can decline'),
  (req, res) => reply(res, db.declineApparelRequest(req.params.id, req.actingStaffId, (req.body || {}).reason)));
router.post('/requests/:id/cancel', (req, res) => reply(res, db.cancelApparelRequest(req.params.id, req.actingStaffId)));
router.post('/requests/:id/issue', (req, res) => reply(res, db.issueApparelRequest(req.params.id, req.actingStaffId)));
router.post('/requests/:id/reverse', guard(isMgmt, 'Management only'),
  (req, res) => reply(res, db.reverseApparelRequest(req.params.id, req.actingStaffId)));

// Stock corrections, movement log, settings
router.post('/stock', guard(isMgmt, 'Management only'),
  (req, res) => reply(res, db.addApparelStock(req.body || {}, req.actingStaffId)));
router.get('/moves', guard(isMgmt, 'Management only'), (req, res) => res.json(db.getApparelMoves(100)));
router.get('/settings', guard(isMgmt, 'Management only'), (req, res) => res.json(db.getApparelSettings()));
router.put('/settings', guard(isMgmt, 'Management only'),
  (req, res) => { const s = db.updateApparelSettings(req.body || {}); sse.broadcast('update'); res.json(s); });

module.exports = router;
