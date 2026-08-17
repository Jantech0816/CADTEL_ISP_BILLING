const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const [
    totalCustomers,
    activeCustomers,
    monthlyRevenue,
    receivables,
    overdueCount,
    recentInvoices,
    recentPayments
  ] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM customers'),
    query(`SELECT COUNT(*)::int AS n FROM customers WHERE status='Active'`),
    query(`SELECT COALESCE(SUM(p.monthly_fee),0) AS n
           FROM customers c JOIN plans p ON p.id=c.plan_id
           WHERE c.status='Active'`),
    query(`SELECT COALESCE(SUM(balance),0) AS n FROM invoices WHERE balance>0`),
    query(`SELECT COUNT(*)::int AS n FROM invoices WHERE balance>0 AND due_date<CURRENT_DATE`),
    query(`SELECT i.*, c.account_no, c.full_name
           FROM invoices i JOIN customers c ON c.id=i.customer_id
           ORDER BY i.created_at DESC LIMIT 8`),
    query(`SELECT p.*, i.invoice_no, c.account_no, c.full_name, u.full_name AS received_by_name
           FROM payments p
           JOIN invoices i ON i.id=p.invoice_id
           JOIN customers c ON c.id=p.customer_id
           LEFT JOIN users u ON u.id=p.received_by
           ORDER BY p.created_at DESC LIMIT 8`)
  ]);

  res.render('dashboard', {
    title: 'Dashboard',
    stats: {
      total: totalCustomers.rows[0].n,
      active: activeCustomers.rows[0].n,
      monthly: monthlyRevenue.rows[0].n,
      receivables: receivables.rows[0].n,
      overdue: overdueCount.rows[0].n
    },
    recentInvoices: recentInvoices.rows,
    recentPayments: recentPayments.rows
  });
});

module.exports = router;
