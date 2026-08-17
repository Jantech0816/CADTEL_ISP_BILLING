const express = require('express');
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const { safeText } = require('../helpers');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const plans = await query('SELECT * FROM plans ORDER BY active DESC, monthly_fee ASC');
  res.render('plans', { title: 'Internet Plans', plans: plans.rows, edit: null });
});

router.get('/:id/edit', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const [plans, edit] = await Promise.all([
    query('SELECT * FROM plans ORDER BY active DESC, monthly_fee ASC'),
    query('SELECT * FROM plans WHERE id=$1', [id])
  ]);
  res.render('plans', { title: 'Internet Plans', plans: plans.rows, edit: edit.rows[0] || null });
});

router.post('/save', requireRole('admin'), async (req, res) => {
  const id = Number(req.body.id || 0);
  const data = [
    safeText(req.body.plan_name),
    Number(req.body.speed_mbps || 0),
    Number(req.body.monthly_fee || 0),
    safeText(req.body.description)
  ];

  if (id) {
    await query('UPDATE plans SET plan_name=$1,speed_mbps=$2,monthly_fee=$3,description=$4 WHERE id=$5', [...data, id]);
    await audit(req, 'UPDATE_PLAN', 'plan', id, data[0]);
  } else {
    const { rows } = await query(
      'INSERT INTO plans (plan_name,speed_mbps,monthly_fee,description) VALUES ($1,$2,$3,$4) RETURNING id',
      data
    );
    await audit(req, 'CREATE_PLAN', 'plan', rows[0].id, data[0]);
  }
  req.session.flash = { type: 'success', message: 'Internet plan saved.' };
  res.redirect('/plans');
});

router.post('/:id/toggle', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  await query('UPDATE plans SET active=NOT active WHERE id=$1', [id]);
  await audit(req, 'TOGGLE_PLAN', 'plan', id);
  req.session.flash = { type: 'success', message: 'Plan status updated.' };
  res.redirect('/plans');
});

module.exports = router;
