// ════════════════════════════════════════════════
//  INVOICE PDF + EMAIL (Graph auth itself lives in shared/msal.js, loaded
//  alongside this file — this covers only the invoice-specific pieces:
//  the PDF template, PDF rendering, and the sendMail call.)
// ════════════════════════════════════════════════
// jobGroups is [{ job, items }, ...] — normally one entry, but more than one
// for a consolidated invoice covering several jobs for the same client. Each
// group's items render under their own job-number sub-header when there's
// more than one group, so a single-job invoice looks exactly as before.
function buildInvoiceHTML(jobGroups, client, invNo, total, invDate, dueDate) {
  var fmtDate = function(d){ return d.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}); };
  var multi = jobGroups.length > 1;
  var jobNosStr = jobGroups.map(function(g){ return g.job.job_no + (g.job.revision ? ' Rev '+g.job.revision : ''); }).join(', ');
  // Each group gets its own <tbody> (wrapped in a data-pdf-group marker) so
  // generateInvoicePdf() can measure exactly where it sits and never cut a
  // page break through the middle of one.
  var rows = jobGroups.map(function(g, gi) {
    var groupHeader = multi
      ? '<tr><td colspan="3" style="padding:10px 10px 4px;font-size:11px;font-weight:700;color:#111;border-bottom:1px solid #ccc">'+esc(g.job.job_no)+(g.job.revision?' Rev '+esc(g.job.revision):'')+'</td></tr>'
      : '';
    var itemRows = g.items.map(function(it) {
      return '<tr>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#222">'+esc(it.desc)+'</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#666;text-align:center">GST Free</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #ddd;font-size:12px;color:#222;text-align:right">A$ '+(it.amt||0).toFixed(2)+'</td>' +
      '</tr>';
    }).join('');
    return '<tbody data-pdf-group="'+gi+'">' + groupHeader + itemRows + '</tbody>';
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
        '<tr><td style="padding:1px 8px 1px 0;text-align:right;color:#999;vertical-align:top">'+(multi?'Job Nos':'Job No')+'</td><td style="padding:1px 0;text-align:right;max-width:200px">'+esc(jobNosStr)+'</td></tr>' +
        '</tbody></table>' +
      '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr>' +
      '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Description</th>' +
      '<th style="text-align:center;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Taxed</th>' +
      '<th style="text-align:right;padding:8px 10px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#777">Amount</th>' +
    '</tr></thead>'+rows+'</table>' +
    '<div data-pdf-footer>' +
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
    '</div>' +
  '</div>';
}

// Renders the invoice off-screen, rasterises it with html2canvas, then paginates into an A4 PDF.
// Returns the PDF as a base64 string (no data: prefix) ready for a Graph fileAttachment.
//
// Page breaks are chosen at measured, safe boundaries — between job groups,
// or just before the totals/payment/signature block — rather than at a
// blind fixed pixel height. A naive fixed-height slice can land mid-section,
// and because each page redraws the *whole* image shifted up to continue
// from where the last one cut off, a break landing mid-element made that
// element appear to render twice with a hard seam between the halves.
async function generateInvoicePdf(jobGroups, client, invNo, total, invDate, dueDate) {
  var container = document.getElementById('invoice-render');
  container.innerHTML = buildInvoiceHTML(jobGroups, client, invNo, total, invDate, dueDate);
  await new Promise(function(r){ setTimeout(r, 60); }); // let layout/fonts settle before capture

  var containerCssWidth = container.offsetWidth;
  var breakEls = Array.prototype.slice.call(container.querySelectorAll('[data-pdf-group]'));
  var footerEl = container.querySelector('[data-pdf-footer]');
  if (footerEl) breakEls.push(footerEl);
  var safeBreaksCss = breakEls.map(function(el){ return el.offsetTop; }).filter(function(t){ return t > 0; });

  var canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
  container.innerHTML = '';

  var jsPDF = window.jspdf.jsPDF;
  var pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  var pageWidthPt  = pdf.internal.pageSize.getWidth();
  var pageHeightPt = pdf.internal.pageSize.getHeight();
  var canvasPxPerCssPx  = canvas.width / containerCssWidth;
  var ptPerCanvasPx     = pageWidthPt / canvas.width;
  var pageHeightCanvasPx = pageHeightPt / ptPerCanvasPx;
  var safeBreaksCanvasPx = safeBreaksCss.map(function(t){ return t * canvasPxPerCssPx; });

  // Walk down the full image choosing each page's end point: the furthest
  // safe break that still fits within one page's height, falling back to a
  // hard cut only if a single section is taller than a whole page.
  var slices = [0];
  var cursor = 0;
  while (cursor < canvas.height) {
    var remaining = canvas.height - cursor;
    if (remaining <= pageHeightCanvasPx) { slices.push(canvas.height); break; }
    var candidate = null;
    for (var i = 0; i < safeBreaksCanvasPx.length; i++) {
      var b = safeBreaksCanvasPx[i];
      if (b > cursor && b <= cursor + pageHeightCanvasPx) candidate = b;
    }
    var nextBreak = candidate || (cursor + pageHeightCanvasPx);
    slices.push(nextBreak);
    cursor = nextBreak;
  }

  for (var p = 0; p < slices.length - 1; p++) {
    if (p > 0) pdf.addPage();
    var top = slices[p], bottom = slices[p + 1];
    var sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = bottom - top;
    sliceCanvas.getContext('2d').drawImage(canvas, 0, top, canvas.width, bottom - top, 0, 0, canvas.width, bottom - top);
    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidthPt, (bottom - top) * ptPerCanvasPx);
  }

  return pdf.output('datauristring').split(',')[1];
}

async function sendInvoiceEmail(token, jobGroups, client, invNo, pdfBase64, total) {
  var toRecipients = [{ emailAddress: { address: client.email_to } }];
  var ccRecipients = client.email_cc ? [{ emailAddress: { address: client.email_cc } }] : [];
  var jobNosStr = jobGroups.map(function(g){ return g.job.job_no + (g.job.revision ? ' (Rev ' + g.job.revision + ')' : ''); }).join(', ');
  var jobWord = jobGroups.length > 1 ? 'jobs' : 'job';
  var bodyHtml =
    '<p>Dear ' + esc(client.name) + ',</p>' +
    '<p>Please find attached invoice <strong>' + esc(invNo) + '</strong> for ' + jobWord + ' ' + esc(jobNosStr) + ', totalling A$ ' + total.toFixed(2) + '.</p>' +
    '<p>Kind regards,<br>Steven Lionghardy<br>Lionghardy Design Works</p>';
  var payload = {
    message: {
      subject: 'Invoice ' + invNo + ' — ' + jobNosStr + ' — Lionghardy Design Works',
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
