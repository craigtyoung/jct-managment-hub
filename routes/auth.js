const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const router = express.Router();

// GET all staff (for login picker)
router.get('/staff', (req, res) => {
  res.json(db.getAllStaff());
});

// GET staff photo — public so the login page can show headshots before auth
router.get('/photo/:id', (req, res) => {
  const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'jct-data.json');
  const PHOTOS_DIR = path.join(path.dirname(DATA_FILE), 'staff-photos');
  const EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  for (const ext of EXTS) {
    const p = path.join(PHOTOS_DIR, `${req.params.id}${ext}`);
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).end();
});

// POST login
router.post('/login', (req, res) => {
  const { staffId, password } = req.body;
  if (!staffId || !password) return res.status(400).json({ error: 'Missing credentials' });

  const staff = db.getStaffById(staffId);
  if (!staff) return res.status(401).json({ error: 'Unknown staff member' });

  if (!bcrypt.compareSync(password, staff.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  req.session.staffId = staff.id;
  delete req.session.viewAsStaffId; // never carry a stale dev-view into a fresh login
  res.json({ ok: true, name: staff.name, role: staff.role, must_set_password: !!staff.must_set_password });
});

// POST set-initial-password — first-login forced password change. Requires a
// session (they've authenticated with the default), sets their own password,
// and clears the must-change flag.
router.post('/set-initial-password', (req, res) => {
  if (!req.session.staffId) return res.status(401).json({ error: 'Not logged in' });
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  db.setInitialPassword(req.session.staffId, bcrypt.hashSync(String(newPassword), 10));
  res.json({ ok: true });
});

// POST view-as — allow-listed testers only. Temporarily view the hub as another
// staff member. Body: { staffId } to enter, or { staffId: null } to exit.
router.post('/view-as', (req, res) => {
  if (!req.session.staffId) return res.status(401).json({ error: 'Not logged in' });
  const real = db.getStaffById(req.session.staffId);
  if (!real || !db.canViewAs(real.id)) return res.status(403).json({ error: 'Not permitted' });

  const { staffId } = req.body;
  if (staffId === null || staffId === undefined || staffId === '') {
    delete req.session.viewAsStaffId;
    return res.json({ ok: true, viewing_as: null });
  }
  const viewed = db.getStaffById(staffId);
  if (!viewed) return res.status(404).json({ error: 'Unknown staff member' });
  if (viewed.id === real.id) {
    delete req.session.viewAsStaffId;
    return res.json({ ok: true, viewing_as: null });
  }
  req.session.viewAsStaffId = viewed.id;
  res.json({ ok: true, viewing_as: { id: viewed.id, name: viewed.name } });
});

// POST logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST change password
router.post('/change-password', (req, res) => {
  if (!req.session.staffId) return res.status(401).json({ error: 'Not logged in' });
  const { currentPassword, newPassword } = req.body;
  const staff = db.getStaffById(req.session.staffId);
  if (!bcrypt.compareSync(currentPassword, staff.password)) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }
  db.updatePassword(req.session.staffId, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

module.exports = router;
