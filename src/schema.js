const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(30) NOT NULL CHECK (role IN ('admin','cashier','collector')),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plans (
        id BIGSERIAL PRIMARY KEY,
        plan_name VARCHAR(120) NOT NULL,
        speed_mbps INTEGER NOT NULL CHECK (speed_mbps > 0),
        monthly_fee NUMERIC(12,2) NOT NULL CHECK (monthly_fee >= 0),
        description VARCHAR(255),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        account_no VARCHAR(40) NOT NULL UNIQUE,
        full_name VARCHAR(160) NOT NULL,
        contact_no VARCHAR(50),
        email VARCHAR(190),
        address TEXT,
        plan_id BIGINT REFERENCES plans(id) ON DELETE SET NULL,
        installation_date DATE,
        billing_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
        status VARCHAR(30) NOT NULL DEFAULT 'Active'
          CHECK (status IN ('Active','Suspended','Disconnected')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id BIGSERIAL PRIMARY KEY,
        invoice_no VARCHAR(50) UNIQUE,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        billing_month CHAR(7) NOT NULL,
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        previous_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        adjustments NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_due NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(customer_id, billing_month)
      );

      CREATE TABLE IF NOT EXISTS payments (
        id BIGSERIAL PRIMARY KEY,
        receipt_no VARCHAR(50) UNIQUE,
        invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        payment_date DATE NOT NULL,
        method VARCHAR(40) NOT NULL
          CHECK (method IN ('Cash','GCash','Bank Transfer','Other')),
        reference_no VARCHAR(120),
        notes VARCHAR(255),
        received_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(120) NOT NULL,
        entity_type VARCHAR(80),
        entity_id BIGINT,
        details TEXT,
        ip_address VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_balance ON invoices(balance);
      CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
    `);

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (rows[0].count === 0) {
      const adminName = process.env.ADMIN_NAME || 'System Administrator';
      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cadtel.local').toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMeNow123!';
      const hash = await bcrypt.hash(adminPassword, 12);

      await client.query(
        'INSERT INTO users (full_name,email,password_hash,role) VALUES ($1,$2,$3,$4)',
        [adminName, adminEmail, hash, 'admin']
      );
    }

    const plans = await client.query('SELECT COUNT(*)::int AS count FROM plans');
    if (plans.rows[0].count === 0) {
      await client.query(`
        INSERT INTO plans (plan_name,speed_mbps,monthly_fee,description) VALUES
        ('Starter 25',25,799,'25 Mbps residential plan'),
        ('Home 50',50,999,'50 Mbps residential plan'),
        ('Turbo 100',100,1499,'100 Mbps high-speed plan')
      `);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initSchema };
