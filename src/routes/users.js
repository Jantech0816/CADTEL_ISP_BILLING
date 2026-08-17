const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { requireRole, audit } = require('../middleware');
const { safeText } = require('../helpers');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res) => {
  const users = await query(
    'SELECT id,full_name,email,role,active,created_at FROM users ORDER BY created_at DESC'
  );
  res.render('users', { title: 'Users & Roles', users: users.rows });
});

router.post('/create', requireRole('admin'), async (req, res) => {
  const role = ['admin','cashier','collector'].includes(req.body.role) ? req.body.role : 'collector';
  const password = String(req.body.password || '');
  if (password.length < 8) {
    req.session.flash = { type: 'danger', message: 'Password must be at least 8 characters.' };
    return res.redirect('/users');
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (full_name,email,password_hash,role)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [safeText(req.body.full_name), safeText(req.body.email).toLowerCase(), hash, role]
    );
    await audit(req, 'CREATE_USER', 'user', rows[0].id, role);
    req.session.flash = { type: 'success', message: 'User account created.' };
  } catch (err) {
    req.session.flash = { type: 'danger', message: err.code === '23505' ? 'Email already exists.' : 'Unable to create user.' };
  }
  res.redirect('/users');
});

router.post('/:id/toggle', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (id === Number(req.session.user.id)) {
    req.session.flash = { type: 'danger', message: 'You cannot disable your own account.' };
    return res.redirect('/users');
  }
  await query('UPDATE users SET active=NOT active WHERE id=$1', [id]);
  await audit(req, 'TOGGLE_USER', 'user', id);
  req.session.flash = { type: 'success', message: 'User status updated.' };
  res.redirect('/users');
});

router.post('/:id/password', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password || '');
  if (password.length < 8) {
    req.session.flash = { type: 'danger', message: 'Password must be at least 8 characters.' };
    return res.redirect('/users');
  }
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
  await audit(req, 'RESET_PASSWORD', 'user', id);
  req.session.flash = { type: 'success', message: 'Password reset.' };
  res.redirect('/users');
});

module.exports = router;
