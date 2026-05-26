import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Build quotation HTML preview from template + customer + products
// templateData: result from parseTemplate()
// customer: { companyName, contactName, country, needs }
// products: [{ model, name, qty, ...priceCols }] — price cols are dynamic
// bankInfo: string extracted from template
// quoteInfo: { number, date }
export function buildQuotationHTML(templateData, customer, products, bankInfo, quoteInfo) {
  const sheet = templateData.sheets[templateData.sheetNames[0]] || [];
  if (sheet.length === 0) return '<p>模板为空</p>';

  let html = '<div class="quotation-preview">';

  for (let r = 0; r < sheet.length; r++) {
    const row = sheet[r];
    const hasContent = row.some((c) => String(c).trim() !== '');
    if (!hasContent) {
      html += '<br/>';
      continue;
    }

    // Row 1: Company header
    if (r === 1) {
      const cell = String(row[1] || '');
      const parts = cell.split(/\n/);
      html += '<div class="qt-header">';
      html += `<div class="qt-company">${parts[0] || ''}</div>`;
      html += '<div class="qt-contact">';
      for (let i = 1; i < parts.length; i++) {
        html += `<div>${parts[i]}</div>`;
      }
      html += '</div></div>';
      continue;
    }

    // Row with "To:" — customer info
    if (String(row[1] || '').includes('To:')) {
      html += '<div class="qt-meta">';
      html += `<div class="qt-to"><span class="qt-label">To:</span> <strong>${customer.companyName}</strong></div>`;
      html += `<div class="qt-no">${String(row[7] || '')}</div>`;
      html += '</div>';
      continue;
    }

    // Row with "From:"
    if (String(row[1] || '').includes('From:')) {
      html += '<div class="qt-meta">';
      html += `<div class="qt-from"><span class="qt-label">From:</span> ${String(row[2] || '')}</div>`;
      html += `<div class="qt-date">Date: ${quoteInfo.date || ''}</div>`;
      html += '</div>';
      continue;
    }

    // Table header row (has No. / Product / QTY)
    if (String(row[1] || '').includes('No.')) {
      const cols = row.map((c) => String(c).trim());
      html += '<table class="qt-table"><thead><tr>';
      for (const col of cols) {
        html += `<th>${col.replace(/\n/g, '<br/>')}</th>`;
      }
      html += '</tr></thead><tbody>';
      continue;
    }

    // Product rows (after header)
    if (products.length > 0 && /^\d+(\.\d+)?$/.test(String(row[1] || '').trim())) {
      const idx = parseInt(row[1]) - 1;
      if (idx >= 0 && idx < products.length) {
        const p = products[idx];
        html += '<tr>';
        for (let c = 0; c < row.length; c++) {
          if (c === 0) continue; // empty col
          if (c === 1) { html += `<td>${idx + 1}</td>`; continue; }
          if (c === 2) { html += `<td>${p.name || p.model || ''}</td>`; continue; }
          if (c === 3) { html += `<td>${p.qty || 1}</td>`; continue; }
          // Price columns — user-editable values
          html += `<td>${p.columns ? (p.columns[c] || '') : String(row[c] || '')}</td>`;
        }
        html += '</tr>';
        continue;
      }
    }

    // Bank info row
    const cellStr = String(row[1] || '');
    if (cellStr.includes('Beneficiary') || cellStr.includes('Bank') || cellStr.includes('SWIFT')) {
      html += '</tbody></table>'; // close product table if open
      html += `<div class="qt-bank-info">${cellStr.replace(/\n/g, '<br/>')}</div>`;
      continue;
    }

    // Warranty / Remarks rows
    if (r === 9 || r === 10) {
      html += `<div class="qt-terms">${cellStr.replace(/\n/g, '<br/>')}</div>`;
      continue;
    }
  }

  html += '</div>';
  return html;
}

// Export quotation as PDF using jspdf-autotable
// products: [{ name, qty, ...priceFields }]
// priceCols: [{ key, header }] — dynamic price columns from template
export function exportQuotationPDF(customer, products, priceCols, bankInfo, quoteInfo, companyInfo) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  // Company header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(companyInfo.name || '', 14, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (companyInfo.contact) {
    for (const line of companyInfo.contact.split('\n')) {
      doc.text(line.trim(), 14, y);
      y += 4;
    }
  }

  // Quotation title
  y += 4;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', pageW / 2, y, { align: 'center' });
  y += 8;

  // To / From / No / Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`To: ${customer.companyName}`, 14, y);
  doc.text(`NO: ${quoteInfo.number || ''}`, pageW - 14, y, { align: 'right' });
  y += 5;
  doc.text('From: ZOOMLION Mining Department', 14, y);
  doc.text(`Date: ${quoteInfo.date || ''}`, pageW - 14, y, { align: 'right' });
  y += 8;

  // Build autotable columns
  const headers = priceCols.map((c) => c.header);
  const body = products.map((p) => {
    const row = [];
    for (const c of priceCols) {
      if (c.key === 'no') row.push(p.no || '');
      else if (c.key === 'product') row.push(p.name || p.model || '');
      else if (c.key === 'qty') row.push(String(p.qty || 1));
      else row.push(String(p[c.key] || ''));
    }
    return row;
  });

  doc.autoTable({
    head: [headers],
    body,
    startY: y,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Bank info
  if (bankInfo) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 50, 50);
    doc.text('BANK INFORMATION (Please verify):', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    for (const line of bankInfo.split('\n')) {
      if (line.trim()) {
        doc.text(line.trim(), 14, y);
        y += 4;
      }
    }
  }

  // Terms
  y += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  if (quoteInfo.terms) {
    for (const line of quoteInfo.terms.split('\n')) {
      if (line.trim()) {
        doc.text(line.trim(), 14, y);
        y += 4;
      }
    }
  }

  doc.save(`Quotation_${customer.companyName}_${quoteInfo.date || ''}.pdf`);
}
