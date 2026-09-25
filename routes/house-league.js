/**
 * house-league.js — Men's/Women's House League: roster, weekly attendance, manual
 * court pairings, and score entry. Replaces the Google Sheets workflow (SCHEDULE/
 * DIVISIONS/per-week score tabs) that was breaking on the website embed.
 *
 * `router` (default export) is staff-only, mounted behind requireAuth at /api/house-league.
 * `router.publicRouter` is a separate, PUBLIC (no staff login) password-gated API for
 * players — mounted at /api/public/house-league in server.js, before the login guard.
 * Feeds /house-league.html (staff) and /house-league-view.html (public).
 */
const express = require('express');
const db = require('../db');
const sse = require('../sse');
const router = express.Router();

const LEAGUES = ['MHL', 'WHL'];
const validLeague = l => LEAGUES.includes(l);

const DESK_ROLES = ['admin', 'manager', 'staff'];
router.use((req, res, next) => {
  req.actingStaffId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  next();
});
const roleOf = id => { const s = db.getStaffById(id); return s ? s.role : null; };
const isDesk = id => DESK_ROLES.includes(roleOf(id));
const isMgmt = id => ['admin', 'manager'].includes(roleOf(id));
const guard = (test, msg) => (req, res, next) => test(req.actingStaffId) ? next() : res.status(403).json({ error: msg });
function reply(res, r) {
  if (r.error) return res.status(r.status || 400).json(r);
  sse.broadcast('update');
  res.json(r);
}

router.use(guard(isDesk, 'House League is staff only'));

router.get('/:league/grid', (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  res.json(db.getHouseLeagueGrid(req.params.league));
});

router.post('/:league/players', (req, res) => reply(res, db.addHousePlayer(req.params.league, req.body || {})));
router.put('/players/:id', (req, res) => reply(res, db.updateHousePlayer(req.params.id, req.body || {})));
router.delete('/players/:id', guard(isMgmt, 'Management only'), (req, res) => reply(res, db.deleteHousePlayer(req.params.id)));

router.post('/:league/weeks', guard(isMgmt, 'Management only'), (req, res) => reply(res, db.addHouseWeek(req.params.league, req.body || {})));
router.delete('/weeks/:id', guard(isMgmt, 'Management only'), (req, res) => reply(res, db.deleteHouseWeek(req.params.id)));

router.put('/:league/attendance', (req, res) => {
  const { weekId, playerId, status } = req.body || {};
  reply(res, db.setHouseAttendance(req.params.league, weekId, playerId, status));
});
router.delete('/:league/attendance', (req, res) => {
  const { weekId, playerId } = req.body || {};
  reply(res, db.clearHouseAttendance(req.params.league, weekId, playerId));
});

router.get('/:league/pairings', (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  res.json(db.getAllHousePairings(req.params.league));
});
router.get('/:league/weeks/:weekId/pairings', (req, res) => res.json(db.getHousePairings(req.params.league, req.params.weekId)));
router.post('/:league/weeks/:weekId/pairings', (req, res) => reply(res, db.addHousePairing(req.params.league, req.params.weekId, req.body || {})));
router.put('/pairings/:id', (req, res) => reply(res, db.updateHousePairing(req.params.id, req.body || {})));
router.delete('/pairings/:id', (req, res) => reply(res, db.deleteHousePairing(req.params.id)));

// Coverage requests — a player flagging they can't make a week. Any desk role can
// resolve/dismiss; anyone on staff can see them.
router.get('/:league/sub-requests', (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  res.json(db.getSubRequests(req.params.league));
});
router.put('/sub-requests/:id/resolve', (req, res) => reply(res, db.resolveSubRequest(req.params.id)));
router.delete('/sub-requests/:id', (req, res) => reply(res, db.deleteSubRequest(req.params.id)));

// Admin notes — free-form reminders for setting up matches. Any desk role can
// add/read; delete is management only (mirrors sub-requests' delete rule).
router.get('/:league/notes', (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  res.json(db.getHouseLeagueNotes(req.params.league));
});
router.post('/:league/notes', (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  reply(res, db.addHouseLeagueNote(req.params.league, req.actingStaffId, (req.body || {}).content));
});
router.delete('/notes/:id', guard(isMgmt, 'Management only'), (req, res) => reply(res, db.deleteHouseLeagueNote(req.params.id)));

// Public-view password — management only to view/change
router.get('/settings', guard(isMgmt, 'Management only'), (req, res) => res.json({ hasPassword: db.hasHouseLeaguePassword() }));
router.put('/settings/password', guard(isMgmt, 'Management only'),
  (req, res) => reply(res, db.setHouseLeaguePassword((req.body || {}).password)));

module.exports = router;

// ── Public, password-gated (no staff session). Mounted separately in server.js. ──
const publicRouter = express.Router();
const loginHits = [];
publicRouter.post('/login', (req, res) => {
  const t = Date.now();
  while (loginHits.length && t - loginHits[0] > 60000) loginHits.shift();
  if (loginHits.length >= 20) return res.status(429).json({ error: 'Too many attempts — wait a moment' });
  loginHits.push(t);
  const { password } = req.body || {};
  if (!db.checkHouseLeaguePassword(password)) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: db.issueHouseLeagueToken() });
});
function requireToken(req, res, next) {
  const token = req.get('x-hl-token') || req.query.token;
  if (!db.checkHouseLeagueToken(token)) return res.status(401).json({ error: 'Not authorized' });
  next();
}
publicRouter.get('/:league', requireToken, (req, res) => {
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  res.json(db.getHouseLeaguePublicData(req.params.league));
});

// A player flagging they can't make a week — the one write action players get.
// Rate-limited the same way login is; still requires the same shared token.
const subReqHits = [];
publicRouter.post('/:league/sub-request', requireToken, (req, res) => {
  const t = Date.now();
  while (subReqHits.length && t - subReqHits[0] > 60000) subReqHits.shift();
  if (subReqHits.length >= 20) return res.status(429).json({ error: 'Too many requests — wait a moment' });
  subReqHits.push(t);
  if (!validLeague(req.params.league)) return res.status(400).json({ error: 'Unknown league' });
  const { weekId, playerId, note } = req.body || {};
  const r = db.addSubRequest(req.params.league, weekId, playerId, note);
  if (r.error) return res.status(r.status || 400).json(r);
  sse.broadcast('update');
  res.json(r);
});
module.exports.publicRouter = publicRouter;
