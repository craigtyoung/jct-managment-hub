const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

// Settings routes are open to management (admin + manager) — Craig, Jaime, Victor, David.
function requireManagement(req, res, next) {
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return res.status(403).json({ error: 'Management only' });
  }
  next();
}

router.use(requireManagement);

// GET all staff (full list for admin view)
router.get('/staff', (req, res) => {
  res.json(db.getAllStaff());
});

// POST add new staff member
router.post('/staff', (req, res) => {
  const { name, color, role, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const validRoles = ['admin', 'manager', 'staff'];
  const validColors = ['#6366f1','#10b981','#8b5cf6','#f59e0b','#ec4899','#f97316','#14b8a6','#f43f5e','#06b6d4','#a78bfa','#3b82f6','#84cc16'];
  const safeRole  = validRoles.includes(role)   ? role  : 'staff';
  const safeColor = validColors.includes(color)  ? color : '#6366f1';
  const hash = bcrypt.hashSync(password && password.length >= 4 ? password : 'jct2026', 10);
  const newStaff = db.addStaff({ name: name.trim(), color: safeColor, role: safeRole, passwordHash: hash });
  res.json({ ok: true, staff: newStaff });
});

// PUT update staff member (name, color, role)
router.put('/staff/:id', (req, res) => {
  const { name, color, role } = req.body;
  const validRoles = ['admin', 'manager', 'staff'];
  const patch = {};
  if (name  !== undefined) patch.name  = name.trim();
  if (color !== undefined) patch.color = color;
  if (role  !== undefined && validRoles.includes(role)) patch.role = role;
  const ok = db.updateStaff(req.params.id, patch);
  if (!ok) return res.status(404).json({ error: 'Staff not found' });
  res.json({ ok: true });
});

// POST reset another staff member's password (admin only)
router.post('/staff/:id/reset-password', (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const target = db.getStaffById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Staff not found' });
  db.updatePassword(req.params.id, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

// DELETE remove a staff member
router.delete('/staff/:id', (req, res) => {
  // Prevent self-deletion
  if (parseInt(req.params.id) === req.session.staffId) {
    return res.status(400).json({ error: 'Cannot remove your own account' });
  }
  const ok = db.removeStaff(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Staff not found' });
  res.json({ ok: true });
});

// POST /api/admin/gametime-sync — manually trigger GameTime sync (testing)
// Returns unsynced count; actual sync runs as a child process
router.post('/gametime-sync', (req, res) => {
  const pending = db.getUnsyncedCheckins();
  if (!pending.length) return res.json({ ok: true, message: 'Nothing to sync', pending: 0 });

  const { execFile } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', 'scripts', 'gametime-sync.js');

  // Fire and forget — client gets immediate response, sync runs in background
  execFile('node', [script], { env: process.env }, (err, stdout, stderr) => {
    if (err) console.error('[gametime-sync]', err.message, stderr);
    else console.log('[gametime-sync]', stdout);
  });

  res.json({ ok: true, message: `Sync started for ${pending.length} check-in(s)`, pending: pending.length });
});

// GET /api/admin/gametime-sync/status — show sync status of today's check-ins
router.get('/gametime-sync/status', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const logs = db.getCheckinLogsByDate(today);
  const summary = {
    total: logs.length,
    synced: logs.filter(l => l.gametime_synced_at).length,
    pending: logs.filter(l => !l.gametime_synced_at && !l.gametime_sync_error && !l.duplicate).length,
    failed: logs.filter(l => l.gametime_sync_error).length,
    duplicates: logs.filter(l => l.duplicate).length,
    logs: logs.map(l => ({
      id: l.id, time: l.time, member_name: l.member_name,
      synced: !!l.gametime_synced_at, synced_at: l.gametime_synced_at || null,
      error: l.gametime_sync_error || null, duplicate: !!l.duplicate,
    })),
  };
  res.json(summary);
});

module.exports = router;
