const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'jct-staff-hub-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12-hour session
}));

// Auth guard middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.staffId) return next();
  res.redirect('/login.html');
}

// Routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const checklistRoutes  = require('./routes/checklist');
const scheduleRoutes   = require('./routes/schedule');
const timesheetRoutes  = require('./routes/timesheet');
const sse = require('./sse');

app.use('/api/auth', authRoutes);
app.use('/api/messages', requireAuth, messageRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/checklist', requireAuth, checklistRoutes);
app.use('/api/schedule',   requireAuth, scheduleRoutes);
app.use('/api/timesheet',  requireAuth, timesheetRoutes);

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
  res.json({
    id: eff.id, name: eff.name, color: eff.color, role: eff.role,
    is_admin: real.role === 'admin',
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
