const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

// All routes here require admin role
function requireAdmin(req, res, next) {
  const staff = db.getStaffById(req.session.staffId);
  if (!staff || staff.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

router.use(requireAdmin);

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
  const hash = bcrypt.hashSync(password && password.length >= 4 ? password : 'jct2025', 10);
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

module.exports = router;
