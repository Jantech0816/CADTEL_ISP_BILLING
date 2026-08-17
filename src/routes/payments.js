const express = require('express');
const { query, withTransaction } = require('../db');
const { requireAuth, audit } = require('../middleware');
const { generateReceiptNo, safeText } = require('../helpers');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const [openInvoices, payments] = await Promise.all([
    query(`SELECT i.id,i.invoice_no,i.balance,c.account_no,c.full_name
           FROM invoices i JOIN customers c ON c.id=i.customer_id
           WHERE i.balance>0 ORDER BY i.due_date ASC`),
    query(`SELECT p.*,i.invoice_no,c.account_no,c.full_name,u.full_name AS receiver
           FROM payments p
           JOIN invoices i ON i.id=p.invoice_id
           JOIN customers c ON c.id=p.customer_id
           LEFT JOIN users u ON u.id=p.received_by
           ORDER BY p.created_at DESC LIMIT 200`)
  ]);

  res.render('payments', {
    title: 'Payments',
    openInvoices: openInvoices.rows,
    payments: payments.rows
  });
});

router.post('/post', requireAuth, async (req, res) => {
  const invoiceId = Number(req.body.invoice_id);
  const amount = Number(req.body.amount || 0);
  const method = ['Cash','GCash','Bank Transfer','Other'].includes(req.body.method)
    ? req.body.method : 'Cash';

  try {
    const payment = await withTransaction(async client => {
      const inv = await client.query(
        'SELECT * FROM invoices WHERE id=$1 FOR UPDATE',
        [invoiceId]
      );
      const invoice = inv.rows[0];
      if (!invoice) throw new Error('Invoice not found.');
      if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
      if (amount > Number(invoice.balance)) throw new Error('Payment exceeds invoice balance.');

      const inserted = await client.query(
        `INSERT INTO payments
         (invoice_id,customer_id,amount,payment_date,method,reference_no,notes,received_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          invoiceId, invoice.customer_id, amount,
          req.body.payment_date || new Date().toISOString().slice(0,10),
          method, safeText(req.body.reference_no), safeText(req.body.notes),
          req.session.user.id
        ]
      );

      const id = inserted.rows[0].id;
      const receiptNo = generateReceiptNo(id);
      await client.query('UPDATE payments SET receipt_no=$1 WHERE id=$2', [receiptNo, id]);
      await client.query(
        `UPDATE invoices
         SET amount_paid=amount_paid+$1,balance=GREATEST(balance-$1,0)
         WHERE id=$2`,
        [amount, invoiceId]
      );

      return { id, receiptNo };
    });

    await audit(req, 'POST_PAYMENT', 'payment', payment.id, `${payment.receiptNo} - ${amount}`);
    req.session.flash = { type: 'success', message: `Payment posted. Receipt: ${payment.receiptNo}` };
  } catch (err) {
    req.session.flash = { type: 'danger', message: err.message || 'Unable to post payment.' };
  }

  res.redirect('/payments');
});

router.get('/:id/receipt', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const result = await query(
    `SELECT p.*,i.invoice_no,c.account_no,c.full_name,c.address,u.full_name AS receiver
     FROM payments p
     JOIN invoices i ON i.id=p.invoice_id
     JOIN customers c ON c.id=p.customer_id
     LEFT JOIN users u ON u.id=p.received_by
     WHERE p.id=$1`,
    [id]
  );
  if (!result.rows[0]) return res.status(404).send('Receipt not found.');
  res.render('receipt_print', { title: 'Receipt', payment: result.rows[0] });
});

module.exports = router;
