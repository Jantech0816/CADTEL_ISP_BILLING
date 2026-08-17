const express = require('express');
const { query } = require('../db');
const { requireAuth, requireRole, audit } = require('../middleware');
const { safeText } = require('../helpers');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const q = safeText(req.query.q);
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE c.full_name ILIKE $1 OR c.account_no ILIKE $1 OR c.contact_no ILIKE $1`;
  }

  const [customers, plans] = await Promise.all([
    query(`SELECT c.*, p.plan_name, p.monthly_fee
           FROM customers c LEFT JOIN plans p ON p.id=c.plan_id
           ${where}
           ORDER BY c.created_at DESC`, params),
    query(`SELECT * FROM plans WHERE active=TRUE ORDER BY monthly_fee`)
  ]);

  res.render('customers', {
    title: 'Subscribers',
    customers: customers.rows,
    plans: plans.rows,
    q,
    edit: null
  });
});

router.get('/:id/edit', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [customer, customers, plans] = await Promise.all([
    query('SELECT * FROM customers WHERE id=$1', [id]),
    query(`SELECT c.*, p.plan_name, p.monthly_fee
           FROM customers c LEFT JOIN plans p ON p.id=c.plan_id
           ORDER BY c.created_at DESC`),
    query(`SELECT * FROM plans WHERE active=TRUE ORDER BY monthly_fee`)
  ]);
  if (!customer.rows[0]) return res.redirect('/customers');

  res.render('customers', {
    title: 'Subscribers',
    customers: customers.rows,
    plans: plans.rows,
    q: '',
    edit: customer.rows[0]
  });
});

router.post('/save', requireAuth, async (req, res) => {
  const id = Number(req.body.id || 0);
  const accountNo = safeText(req.body.account_no);
  const fullName = safeText(req.body.full_name);
  const planId = Number(req.body.plan_id || 0) || null;
  const billingDay = Math.max(1, Math.min(28, Number(req.body.billing_day || 1)));

  if (!accountNo || !fullName) {
    req.session.flash = { type: 'danger', message: 'Account number and subscriber name are required.' };
    return res.redirect('/customers');
  }

  try {
    if (id) {
      await query(
        `UPDATE customers SET account_no=$1,full_name=$2,contact_no=$3,email=$4,address=$5,
         plan_id=$6,installation_date=$7,billing_day=$8,status=$9,notes=$10 WHERE id=$11`,
        [
          accountNo, fullName, safeText(req.body.contact_no), safeText(req.body.email),
          safeText(req.body.address), planId, req.body.installation_date || null,
          billingDay, req.body.status || 'Active', safeText(req.body.notes), id
        ]
      );
      await audit(req, 'UPDATE_SUBSCRIBER', 'customer', id, `${accountNo} - ${fullName}`);
    } else {
      const { rows } = await query(
        `INSERT INTO customers
         (account_no,full_name,contact_no,email,address,plan_id,installation_date,billing_day,status,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          accountNo, fullName, safeText(req.body.contact_no), safeText(req.body.email),
          safeText(req.body.address), planId, req.body.installation_date || null,
          billingDay, req.body.status || 'Active', safeText(req.body.notes)
        ]
      );
      await audit(req, 'CREATE_SUBSCRIBER', 'customer', rows[0].id, `${accountNo} - ${fullName}`);
    }
    req.session.flash = { type: 'success', message: 'Subscriber saved.' };
  } catch (err) {
    req.session.flash = {
      type: 'danger',
      message: err.code === '23505' ? 'Account number already exists.' : 'Unable to save subscriber.'
    };
  }
  res.redirect('/customers');
});

router.post('/:id/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ['Active', 'Suspended', 'Disconnected'];
  const status = allowed.includes(req.body.status) ? req.body.status : 'Active';
  await query('UPDATE customers SET status=$1 WHERE id=$2', [status, id]);
  await audit(req, 'CHANGE_SERVICE_STATUS', 'customer', id, `New status: ${status}`);
  req.session.flash = { type: 'success', message: 'Service status updated.' };
  res.redirect('/customers');
});

router.post('/:id/delete', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM customers WHERE id=$1', [id]);
  await audit(req, 'DELETE_SUBSCRIBER', 'customer', id);
  req.session.flash = { type: 'success', message: 'Subscriber deleted.' };
  res.redirect('/customers');
});

module.exports = router;
