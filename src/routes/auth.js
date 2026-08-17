const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { audit } = require('../middleware');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Login' });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const { rows } = await query(
    'SELECT id,full_name,email,password_hash,role,active FROM users WHERE email=$1',
    [email]
  );
  const user = rows[0];

  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    req.session.flash = { type: 'danger', message: 'Invalid email or password.' };
    return res.redirect('/login');
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).send('Session error.');
    req.session.user = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    };
    req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    audit(req, 'LOGIN', 'user', user.id, `Role: ${user.role}`);
    res.redirect('/');
  });
});

router.post('/logout', async (req, res) => {
  if (req.session.user) {
    await audit(req, 'LOGOUT', 'user', req.session.user.id);
  }
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
