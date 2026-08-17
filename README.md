# CADTEL DATA NETSERV – Centralized Cloud ISP Billing System

This version is designed for **multiple PCs, cashiers, collectors, and phones** using one shared online database.

## Architecture

- Node.js / Express web application
- PostgreSQL central database
- Server-side login sessions stored in PostgreSQL
- Role-based access:
  - **Admin** – full access, plans, users, audit trail
  - **Cashier** – subscribers, billing, payments
  - **Collector** – subscribers, billing, payments
- No XAMPP is required on client computers.
- Every device only needs a browser and the system URL.

## Included modules

- Dashboard
- Subscribers
- Internet plans
- Service status: Active / Suspended / Disconnected
- Single invoice generation
- Bulk monthly billing
- Previous balance carry-forward
- Paid / Unpaid / Overdue monitoring
- Payment posting
- Cash / GCash / Bank Transfer / Other
- Printable billing statement
- Printable payment receipt
- Admin user management
- Admin password reset
- Audit trail
- PostgreSQL-backed login sessions
- Mobile responsive interface

## How to deploy

You need:
1. A Node.js hosting service or VPS/container service
2. A PostgreSQL database
3. Environment variables from `.env.example`

### Required environment variables

- `DATABASE_URL`
- `DATABASE_SSL=true` for cloud PostgreSQL providers that require SSL
- `SESSION_SECRET`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TRUST_PROXY=1` when behind a cloud reverse proxy
- `NODE_ENV=production`

The database tables are created automatically on first startup.

### First administrator

When the `users` table is empty, the system creates the initial administrator from:

- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Change the password after deployment.

## Run without XAMPP on a server

```bash
npm install
npm start
```

The server listens on `PORT` or defaults to port 3000.

## Docker deployment

```bash
docker build -t cadtel-isp .
docker run -p 3000:3000 --env-file .env cadtel-isp
```

## Multi-user behavior

All cashiers/collectors connect to the **same website URL** and the **same PostgreSQL database**. This means a payment posted by one cashier is immediately available to the other users after refresh. No copying of files between PCs is required.

## Recommended next upgrades

- SMS reminders for due/overdue accounts
- Automatic scheduled monthly billing
- Collector route/area assignment
- Daily cashier closing report
- Expense and income reports
- Customer self-service portal
- Online payment gateway
- Modem/ONU/router inventory
- Installation/work-order module
- MikroTik/PPPoE/RADIUS integration
- Automatic suspend/reconnect rules
- Backup/export reports to Excel/PDF
