// File: ThinkMart/lib/utils/invoice.ts
// Invoice Generation Utility - Creates printable/downloadable invoice

interface InvoiceItem {
    name: string;
    quantity: number;
    unitPrice: number;
}

interface InvoiceData {
    orderId: string;
    orderDate: Date;
    customerName: string;
    customerPhone: string;
    shippingAddress: {
        addressLine1: string;
        addressLine2?: string;
        city: string;
        state: string;
        pincode: string;
    };
    items: InvoiceItem[];
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    coinValue: number;
}

export function generateInvoiceHTML(data: InvoiceData): string {
    const invoiceNumber = `TM-${data.orderId.slice(-8).toUpperCase()}`;
    const orderDate = data.orderDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const itemsHTML = data.items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹${item.unitPrice.toLocaleString('en-IN')}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">₹${(item.unitPrice * item.quantity).toLocaleString('en-IN')}</td>
    </tr>
  `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice - ${invoiceNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1f2937;
      line-height: 1.5;
      background: #f3f4f6;
      padding: 20px;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: white;
      padding: 32px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 4px 0 0;
      opacity: 0.9;
    }
    .content {
      padding: 32px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    .info-block h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin: 0 0 8px;
    }
    .info-block p {
      margin: 0;
      font-size: 14px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table thead {
      background: #f9fafb;
    }
    .items-table th {
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }
    .items-table th:nth-child(2), .items-table th:nth-child(3), .items-table th:nth-child(4) {
      text-align: right;
    }
    .items-table th:nth-child(2) { text-align: center; }
    .summary {
      background: #f9fafb;
      padding: 20px;
      border-radius: 12px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .summary-row.total {
      border-top: 2px solid #e5e7eb;
      margin-top: 8px;
      padding-top: 16px;
      font-size: 18px;
      font-weight: 700;
      color: #4f46e5;
    }
    .footer {
      text-align: center;
      padding: 24px;
      background: #f9fafb;
      color: #6b7280;
      font-size: 12px;
    }
    .print-btn {
      display: block;
      width: 100%;
      max-width: 200px;
      margin: 20px auto 0;
      padding: 12px 24px;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <h1>ThinkMart</h1>
      <p>Order Invoice</p>
    </div>
    
    <div class="content">
      <div class="info-grid">
        <div class="info-block">
          <h3>Invoice Number</h3>
          <p style="font-weight: 700; font-size: 16px;">${invoiceNumber}</p>
          <p style="color: #6b7280; margin-top: 4px;">Date: ${orderDate}</p>
        </div>
        <div class="info-block" style="text-align: right;">
          <h3>Bill To</h3>
          <p style="font-weight: 600;">${data.customerName}</p>
          <p>${data.shippingAddress.addressLine1}</p>
          ${data.shippingAddress.addressLine2 ? `<p>${data.shippingAddress.addressLine2}</p>` : ''}
          <p>${data.shippingAddress.city}, ${data.shippingAddress.state} - ${data.shippingAddress.pincode}</p>
          <p>Phone: ${data.customerPhone}</p>
        </div>
      </div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
      
      <div class="summary">
        <div class="summary-row">
          <span>Subtotal</span>
          <span>₹${data.subtotal.toLocaleString('en-IN')}</span>
        </div>
        ${data.coinsRedeemed > 0 ? `
        <div class="summary-row" style="color: #ca8a04;">
          <span>🪙 Coins Redeemed (${data.coinsRedeemed.toLocaleString()})</span>
          <span>-₹${data.coinValue.toLocaleString('en-IN')}</span>
        </div>
        ` : ''}
        ${data.cashPaid > 0 ? `
        <div class="summary-row" style="color: #16a34a;">
          <span>💵 Cash Paid</span>
          <span>₹${data.cashPaid.toLocaleString('en-IN')}</span>
        </div>
        ` : ''}
        <div class="summary-row total">
          <span>Total Paid</span>
          <span>₹${data.subtotal.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>Thank you for shopping with ThinkMart!</p>
      <p>For support, contact support@thinkmart.com</p>
    </div>
  </div>
  
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print Invoice</button>
</body>
</html>
`;
}

export function downloadInvoice(data: InvoiceData): void {
    const html = generateInvoiceHTML(data);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open in new tab for printing
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
        printWindow.onload = () => {
            // Auto-trigger print dialog after a short delay
            setTimeout(() => {
                printWindow.focus();
            }, 500);
        };
    }

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
