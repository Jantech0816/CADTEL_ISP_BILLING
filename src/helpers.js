function peso(value) {
  return '₱' + Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function invoiceStatus(invoice) {
  if (Number(invoice.balance) <= 0) return 'Paid';
  const due = String(invoice.due_date).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return due < today ? 'Overdue' : 'Unpaid';
}

function generateInvoiceNo(id) {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `INV-${ym}-${String(id).padStart(6, '0')}`;
}

function generateReceiptNo(id) {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `OR-${ym}-${String(id).padStart(6, '0')}`;
}

function safeText(v) {
  return String(v ?? '').trim();
}

module.exports = { peso, invoiceStatus, generateInvoiceNo, generateReceiptNo, safeText };
