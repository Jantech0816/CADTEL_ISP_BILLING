const express = require('express');
const { query, withTransaction } = require('../db');
const { requireAuth, audit } = require('../middleware');
const { generateInvoiceNo } = require('../helpers');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const status = String(req.query.status || '');
  let where = '';
  if (status === 'paid') where = 'WHERE i.balance<=0';
  if (status === 'unpaid') where = 'WHERE i.balance>0 AND i.due_date>=CURRENT_DATE';
  if (status === 'overdue') where = 'WHERE i.balance>0 AND i.due_date<CURRENT_DATE';

  const [customers, invoices] = await Promise.all([
    query(`SELECT c.id,c.account_no,c.full_name,c.billing_day,p.plan_name,p.monthly_fee
           FROM customers c JOIN plans p ON p.id=c.plan_id
           WHERE c.status='Active' ORDER BY c.full_name`),
    query(`SELECT i.*,c.account_no,c.full_name,p.plan_name
           FROM invoices i
           JOIN customers c ON c.id=i.customer_id
           LEFT JOIN plans p ON p.id=c.plan_id
           ${where}
           ORDER BY i.due_date DESC,i.id DESC`)
  ]);

  res.render('invoices', {
    title: 'Billing / Invoices',
    customers: customers.rows,
    invoices: invoices.rows,
    status
  });
});

async function createInvoice(client, customerId, month, userId) {
  const customerRes = await client.query(
    `SELECT c.*,p.monthly_fee FROM customers c
     JOIN plans p ON p.id=c.plan_id WHERE c.id=$1`,
    [customerId]
  );
  const c = customerRes.rows[0];
  if (!c) throw new Error('Subscriber or internet plan not found.');

  const existing = await client.query(
    'SELECT id FROM invoices WHERE customer_id=$1 AND billing_month=$2',
    [customerId, month]
  );
  if (existing.rows[0]) return null;

  const prev = await client.query(
    `SELECT COALESCE(SUM(balance),0) AS previous
     FROM invoices WHERE customer_id=$1 AND balance>0 AND billing_month<$2`,
    [customerId, month]
  );
  const previous = Number(prev.rows[0].previous || 0);
  const amount = Number(c.monthly_fee || 0);
  const total = amount + previous;
  const day = String(Math.max(1, Math.min(28, Number(c.billing_day || 1)))).padStart(2, '0');
  const dueDate = `${month}-${day}`;

  const inserted = await client.query(
    `INSERT INTO invoices
     (customer_id,billing_month,issue_date,due_date,amount,previous_balance,total_due,balance,created_by)
     VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$6,$7) RETURNING id`,
    [customerId, month, dueDate, amount, previous, total, userId]
  );

  const id = inserted.rows[0].id;
  const invoiceNo = generateInvoiceNo(id);
  await client.query('UPDATE invoices SET invoice_no=$1 WHERE id=$2', [invoiceNo, id]);
  return { id, invoiceNo };
}

router.post('/generate', requireAuth, async (req, res) => {
  const customerId = Number(req.body.customer_id);
  const month = req.body.billing_month;

  try {
    const result = await withTransaction(client =>
      createInvoice(client, customerId, month, req.session.user.id)
    );
    if (!result) {
      req.session.flash = { type: 'danger', message: 'Invoice already exists for that subscriber and billing month.' };
    } else {
      await audit(req, 'GENERATE_INVOICE', 'invoice', result.id, result.invoiceNo);
      req.session.flash = { type: 'success', message: `Invoice ${result.invoiceNo} generated.` };
    }
  } catch (err) {
    req.session.flash = { type: 'danger', message: err.message || 'Unable to generate invoice.' };
  }
  res.redirect('/invoices');
});

router.post('/generate-all', requireAuth, async (req, res) => {
  const month = req.body.billing_month;
  const active = await query(
    `SELECT c.id FROM customers c JOIN plans p ON p.id=c.plan_id WHERE c.status='Active'`
  );

  let count = 0;
  for (const c of active.rows) {
    try {
      const result = await withTransaction(client =>
        createInvoice(client, c.id, month, req.session.user.id)
      );
      if (result) count++;
    } catch (_) {}
  }

  await audit(req, 'BULK_GENERATE_INVOICES', 'invoice', null, `${month}: ${count} created`);
  req.session.flash = { type: 'success', message: `${count} invoice(s) generated for ${month}.` };
  res.redirect('/invoices');
});

router.get('/:id/print', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await query(
    `SELECT i.*,c.account_no,c.full_name,c.contact_no,c.address,p.plan_name,p.speed_mbps
     FROM invoices i
     JOIN customers c ON c.id=i.customer_id
     LEFT JOIN plans p ON p.id=c.plan_id
     WHERE i.id=$1`,
    [id]
  );
  if (!result.rows[0]) return res.status(404).send('Invoice not found.');
  res.render('invoice_print', { title: 'Invoice', invoice: result.rows[0] });
});

module.exports = router;
