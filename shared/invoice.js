// ════════════════════════════════════════════════
//  INVOICE PDF + EMAIL (Graph auth itself lives in shared/msal.js, loaded
//  alongside this file — this covers only the invoice-specific pieces:
//  the PDF template, PDF rendering, and the sendMail call.)
// ════════════════════════════════════════════════
function buildInvoiceHTML(job, client, invNo, items, total, invDate, dueDate) {
  var fmtDate = function(d){ return d.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}); };
  var rows = items.map(function(it) {
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#222">'+esc(it.desc)+'</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#666;text-align:center">GST Free</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#222;text-align:right">A$ '+(it.amt||0).toFixed(2)+'</td>' +
    '</tr>';
  }).join('');
  return '' +
  '<div style="width:760px;background:#fff;color:#222;font-family:Arial,Helvetica,sans-serif;padding:40px 44px;box-sizing:border-box">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">' +
      '<div>' +
        '<div style="font-size:20px;font-weight:700;color:#111">Lionghardy Design Works</div>' +
        '<div style="font-size:11px;color:#777;letter-spacing:0.05em;margin-top:2px">LDW ENGINEERING</div>' +
      '</div>' +
      '<div style="text-align:right;font-size:11px;color:#555;line-height:1.6">' +
        'Taman Kota Baloi F1 Block No 12B<br>Tanjung Uma, Batam City 29444, Indonesia<br>Phone: +62 81261574790' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:28px">' +
      '<div>' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:6px">Bill To</div>' +
        '<div style="font-size:13px;font-weight:700;color:#111">'+esc(client.name)+'</div>' +
        '<div style="font-size:12px;color:#555;margin-top:2px;max-width:260px">'+esc(client.address||'')+'</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:8px">INVOICE</div>' +
        '<table style="font-size:11px;color:#555;margin-left:auto"><tbody>' +
        '<tr><td style="padding:1px 8px 1px 0;text-align:right;color:#999">Invoice No</td><td style="padding:1px 0;text-align:right;font-weight:600;color:#222">'+esc(invNo)+'</td></tr>' +
        '<tr><td style="padding:1px 8px 1px 0;text-align:right;color:#999">Date</td><td style="padding:1px 0;text-align:right">'+fmtDate(invDate)+'</td></tr>' +
        '<tr><td style="padding:1px 8px 1px 0;text-align:right;color:#999">Due Date</td><td style="padding:1px 0;text-align:right">'+fmtDate(dueDate)+'</td></tr>' +
        '<tr><td style="padding:1px 8px 1px 0;text-align:right;color:#999">Job No</td><td style="padding:1px 0;text-align:right">'+esc(job.job_no)+(job.revision?' Rev '+esc(job.revision):'')+'</td></tr>' +
        '</tbody></table>' +
      '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr>' +
      '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Description</th>' +
      '<th style="text-align:center;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Taxed</th>' +
      '<th style="text-align:right;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Amount</th>' +
    '</tr></thead><tbody>'+rows+'</tbody></table>' +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:32px">' +
      '<table style="font-size:12px;color:#333;min-width:220px"><tbody>' +
        '<tr><td style="padding:4px 10px;text-align:right;color:#777">Subtotal</td><td style="padding:4px 0;text-align:right;width:110px">A$ '+total.toFixed(2)+'</td></tr>' +
        '<tr><td style="padding:4px 10px;text-align:right;color:#777">Tax Rate</td><td style="padding:4px 0;text-align:right">0.000%</td></tr>' +
        '<tr><td style="padding:8px 10px;text-align:right;font-weight:700;border-top:2px solid #333;color:#111">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;border-top:2px solid #333;color:#111">A$ '+total.toFixed(2)+'</td></tr>' +
      '</tbody></table>' +
    '</div>' +
    '<div style="margin-bottom:36px;font-size:12px;color:#333">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin-bottom:4px">Payment</div>' +
      'Paypal: lionghardydesignworks@gmail.com' +
    '</div>' +
    '<div style="border-top:1px solid #ddd;padding-top:14px;font-size:11px;color:#777;text-align:center">' +
      'Steven Lionghardy &nbsp;&middot;&nbsp; +6281261574790 &nbsp;&middot;&nbsp; lionghardydesignworks@gmail.com' +
    '</div>' +
  '</div>';
}

// Renders the invoice off-screen, rasterises it with html2canvas, then paginates into an A4 PDF.
// Returns the PDF as a base64 string (no data: prefix) ready for a Graph fileAttachment.
async function generateInvoicePdf(job, client, invNo, items, total, invDate, dueDate) {
  var container = document.getElementById('invoice-render');
  container.innerHTML = buildInvoiceHTML(job, client, invNo, items, total, invDate, dueDate);
  await new Promise(function(r){ setTimeout(r, 60); }); // let layout/fonts settle before capture
  var canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
  container.innerHTML = '';
  var imgData = canvas.toDataURL('image/jpeg', 0.92);
  var jsPDF = window.jspdf.jsPDF;
  var pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  var pageWidth  = pdf.internal.pageSize.getWidth();
  var pageHeight = pdf.internal.pageSize.getHeight();
  var imgWidth   = pageWidth;
  var imgHeight  = canvas.height * imgWidth / canvas.width;
  var heightLeft = imgHeight, position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return pdf.output('datauristring').split(',')[1];
}

async function sendInvoiceEmail(token, job, client, invNo, pdfBase64, total) {
  var toRecipients = [{ emailAddress: { address: client.email_to } }];
  var ccRecipients = client.email_cc ? [{ emailAddress: { address: client.email_cc } }] : [];
  var bodyHtml =
    '<p>Dear ' + esc(client.name) + ',</p>' +
    '<p>Please find attached invoice <strong>' + esc(invNo) + '</strong> for job ' + esc(job.job_no) + (job.revision ? ' (Rev ' + esc(job.revision) + ')' : '') + ', totalling A$ ' + total.toFixed(2) + '.</p>' +
    '<p>Kind regards,<br>Steven Lionghardy<br>Lionghardy Design Works</p>';
  var payload = {
    message: {
      subject: 'Invoice ' + invNo + ' — ' + job.job_no + ' — Lionghardy Design Works',
      body: { contentType: 'HTML', content: bodyHtml },
      toRecipients: toRecipients,
      ccRecipients: ccRecipients,
      attachments: [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: invNo.replace(/\s+/g,'_') + '.pdf',
        contentType: 'application/pdf',
        contentBytes: pdfBase64
      }]
    },
    saveToSentItems: true
  };
  var res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Graph sendMail failed (' + res.status + '): ' + errText.slice(0,200));
  }
}
