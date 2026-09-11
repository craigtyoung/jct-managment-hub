const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Sessions persist to the Railway volume (next to the data file) so a redeploy no
// longer wipes everyone's login. Locally this falls back to ./sessions.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'jct-data.json');
const SESSIONS_DIR = path.join(path.dirname(DATA_FILE), 'sessions');

// Server boot id — changes on every deploy so open pages can detect a new version.
const BOOT_ID = Date.now();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new FileStore({ path: SESSIONS_DIR, ttl: 60 * 60 * 12, reapInterval: 60 * 60, retries: 1, logFn: function () {} }),
  secret: process.env.SESSION_SECRET || 'jct-staff-hub-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12-hour session
}));

// Auth guard middleware — returns 401 JSON for API routes so fetch() can detect it
function requireAuth(req, res, next) {
  if (req.session && req.session.staffId) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const checklistRoutes  = require('./routes/checklist');
const scheduleRoutes   = require('./routes/schedule');
const timesheetRoutes  = require('./routes/timesheet');
const sse = require('./sse');
const chatRoutes = require('./routes/chat');
const photoRoutes = require('./routes/photo');
const aiRoutes          = require('./routes/ai');
const cashSummaryRoutes = require('./routes/cash-summary');
const coverageRoutes    = require('./routes/coverage');
const waitlistRoutes    = require('./routes/waitlist');
const proshopRoutes     = require('./routes/proshop');
const knowledgeRoutes   = require('./routes/knowledge');
const bubbleRoutes      = require('./routes/bubble');
const contractorRoutes  = require('./routes/contractor');
const ideaRoutes        = require('./routes/ideas');
const academyRoutes     = require('./routes/academy');
const proScheduleRoutes = require('./routes/pro-schedule');
const staffMgmtRoutes   = require('./routes/staff-mgmt');
const pushRoutes        = require('./routes/push');
const checkinRoutes     = require('./routes/checkin');
const membersRoutes     = require('./routes/members');

app.use('/api/auth', authRoutes);

// Public (no-login) read-only pro schedule — feeds the shareable /pro-schedule-view.html
// page so pros can glance at times without signing in. First names + class/court/time
// only; nothing sensitive. Mounted before the /api guard so it stays open to everyone.
app.get('/api/public/pro-schedule', (req, res) => {
  res.json(require('./db').getPublicProSchedule());
});

// Public: current server build id. Open pages poll this to detect a new deploy and
// offer a soft "update now" prompt — never a forced reload.
app.get('/api/version', (req, res) => res.json({ boot: BOOT_ID }));

// Public kiosk: member check-in (no login required — tablet stays open all day)
app.use('/api/checkin', checkinRoutes);

// First-login guard: until a user sets their own password, block every data
// endpoint (auth, identity and avatar reads stay open so they can complete setup).
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/me' || req.path.startsWith('/staff/')) return next();
  if (!req.session || !req.session.staffId) return next(); // requireAuth on each route handles 401
  const db = require('./db');
  const s = db.getStaffById(req.session.staffId);
  if (s && s.must_set_password) return res.status(403).json({ error: 'Password change required', must_set_password: true });
  next();
});

// Global live-sync: after ANY successful mutating API request, push a generic
// 'update' over SSE so every open screen refreshes near-instantly (Google-Docs
// style). Individual routes may still emit their own channel events; an extra
// generic 'update' is idempotent for listeners. One hook covers all routes,
// including future ones, without touching each handler.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try { require('./sse').broadcast('update'); } catch (e) {}
      }
    });
  }
  next();
});

app.use('/api/messages', requireAuth, messageRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/checklist', requireAuth, checklistRoutes);
app.use('/api/schedule',   requireAuth, scheduleRoutes);
app.use('/api/timesheet',  requireAuth, timesheetRoutes);
app.use('/api/chat',       requireAuth, chatRoutes);
// Lightweight badge map { staffId: 'M' } so avatars can overlay a role badge everywhere
app.get('/api/staff/badges', requireAuth, (req, res) => {
  const db = require('./db');
  const map = {};
  for (const s of db.getAllStaff()) { if (s.badge) map[s.id] = s.badge; }
  res.json(map);
});
app.use('/api/staff',     requireAuth, photoRoutes);
app.use('/api/ai',           requireAuth, aiRoutes);
app.use('/api/cash-summary', requireAuth, cashSummaryRoutes);
app.use('/api/coverage',     requireAuth, coverageRoutes);
app.use('/api/waitlist',     requireAuth, waitlistRoutes);
app.use('/api/proshop',      requireAuth, proshopRoutes);
app.use('/api/knowledge',    requireAuth, knowledgeRoutes);
app.use('/api/bubble',       requireAuth, bubbleRoutes);
app.use('/api/contractor',   requireAuth, contractorRoutes);
app.use('/api/ideas',        requireAuth, ideaRoutes);
app.use('/api/academy',      requireAuth, academyRoutes);
app.use('/api/pro-schedule', requireAuth, proScheduleRoutes);
app.use('/api/staff-mgmt',   requireAuth, staffMgmtRoutes);
app.use('/api/push',         requireAuth, pushRoutes);
app.use('/api/members',      requireAuth, membersRoutes);

// Server-Sent Events — one persistent connection per logged-in client
app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sse.addClient(res);

  // Heartbeat every 25s keeps the connection alive through proxies/NAT
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.removeClient(res);
  });
});

// Session info endpoint (used by frontend to know who's logged in).
// If an admin is in "View as" mode, this reports the VIEWED identity so the whole
// UI renders through that person's eyes, plus the real identity for the banner.
app.get('/api/me', requireAuth, (req, res) => {
  const db = require('./db');
  const real = db.getStaffById(req.session.staffId);
  if (!real) return res.status(404).json({ error: 'Not found' });
  const effId = db.getEffectiveStaffId(req.session.staffId, req.session.viewAsStaffId);
  const eff = db.getStaffById(effId) || real;
  // Capabilities reflect the EFFECTIVE (viewed) user so "View as" is an honest
  // preview — viewing as a staff member correctly shows what they'd see. The only
  // exception is can_view_as, which stays tied to the REAL user so the tester never
  // loses the view-as switcher / exit control while impersonating.
  res.json({
    id: eff.id, name: eff.name, color: eff.color, role: eff.role, badge: eff.badge || null,
    is_admin: eff.role === 'admin',
    is_management: eff.role === 'admin' || eff.role === 'manager',
    can_view_as: db.canViewAs(real.id),
    can_manage_directory: db.canManageDirectory(eff.id), // Directory: all management (incl. David)
    can_manage_pay: db.canManageStaff(eff.id),           // Pay Review: trio only
    can_manage_staff: db.canManageDirectory(eff.id),     // legacy alias → portal (directory) access
    must_set_password: !!real.must_set_password,
    real_id: real.id, real_name: real.name, real_color: real.color, real_role: real.role,
    viewing_as: eff.id !== real.id,
  });
});

// Root → redirect to hub or login
app.get('/', (req, res) => {
  if (req.session && req.session.staffId) {
    res.redirect('/hub.html');
  } else {
    res.redirect('/login.html');
  }
});

app.listen(PORT, () => {
  console.log(`\nJCT Staff Hub running at http://localhost:${PORT}\n`);
});
