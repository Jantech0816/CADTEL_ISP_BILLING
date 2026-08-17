require('dotenv').config();

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');

const { pool } = require('./db');
const { initSchema } = require('./schema');
const { csrf, flashMiddleware } = require('./middleware');
const { peso, invoiceStatus } = require('./helpers');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 3000);

if (String(process.env.TRUST_PROXY || '') === '1') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 10
  }
}));

app.use(csrf);
app.use(flashMiddleware);

app.locals.peso = peso;
app.locals.invoiceStatus = invoiceStatus;
app.locals.appName = 'CADTEL DATA NETSERV';

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/customers', require('./routes/customers'));
app.use('/plans', require('./routes/plans'));
app.use('/invoices', require('./routes/invoices'));
app.use('/payments', require('./routes/payments'));
app.use('/users', require('./routes/users'));
app.use('/audit', require('./routes/audit'));

app.use((req, res) => res.status(404).render('message', {
  title: 'Not Found',
  message: 'The requested page was not found.'
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('message', {
    title: 'System Error',
    message: 'An unexpected error occurred. Check the server logs for details.'
  });
});

initSchema()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`CADTEL ISP Billing running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
