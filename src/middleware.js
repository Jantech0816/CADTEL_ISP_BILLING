const crypto = require('crypto');
const { query } = require('./db');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) {
      req.session.flash = { type: 'danger', message: 'You do not have permission to access that function.' };
      return res.redirect('/');
    }
    next();
  };
}

function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'POST') {
    const token = req.body?.csrf;
    if (!token || token !== req.session.csrfToken) {
      return res.status(419).send('Invalid or expired form token.');
    }
  }
  next();
}

function flashMiddleware(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.user = req.session.user || null;
  next();
}

async function audit(req, action, entityType = null, entityId = null, details = null) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        req.session.user?.id || null,
        action,
        entityType,
        entityId,
        details,
        req.ip
      ]
    );
  } catch (_) {}
}

module.exports = { requireAuth, requireRole, csrf, flashMiddleware, audit };
