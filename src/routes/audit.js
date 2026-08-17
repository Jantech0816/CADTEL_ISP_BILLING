const express = require('express');
const { query } = require('../db');
const { requireRole } = require('../middleware');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res) => {
  const logs = await query(
    `SELECT a.*,u.full_name,u.email
     FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     ORDER BY a.created_at DESC LIMIT 500`
  );
  res.render('audit', { title: 'Audit Trail', logs: logs.rows });
});

module.exports = router;
