// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var invJobs = [], jobsLite = [], clients = [];
var invFilter = 'all';
var invoiceNoMap = {}; // "jobNo||revision" -> most recent invoice_no, from invoice_log
var selectMode = false;
var selectedKeys = new Set();
var pendingConsolidated = null; // { jobGroups, client, invNo, invDate } once Generate's run on a selection

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadInvoiceJobs() {
  var { data, error } = await sb.from('invoice_data').select('*').order('job_no');
  if (error) throw error;
  // Group by job_no + revision. `key` (not invoice_data's row id) is the card's
  // identity throughout this page, since a job that hasn't been invoiced yet
  // has no invoice_data row — and therefore no such id — at all.
  var jobMap = {};
  (data || []).forEach(function(row) {
    var key = row.job_no + '||' + (row.revision || '');
    if (!jobMap[key]) {
      jobMap[key] = {
        key: key, job_no: row.job_no, revision: row.revision,
        client_id: row.client_id, job_type: row.job_type,
        payment_status: row.payment_status || 'Unpaid',
        lineItems: []
      };
    }
    if (row.payment_status) jobMap[key].payment_status = row.payment_status;
    jobMap[key].lineItems.push({ line_no: row.line_no, desc: row.description, amt: row.amount, id: row.id });
  });

  // Nothing elsewhere in the app creates an invoice_data row when a job's stage
  // becomes "Invoicing" — without this, such a job would sit on the Board at
  // that stage forever without ever actually becoming visible here to invoice.
  jobsLite.filter(function(j){ return j.job_progress === 'Invoicing'; }).forEach(function(j) {
    var key = j.job_no + '||' + (j.revision || '');
    if (!jobMap[key]) {
      jobMap[key] = {
        key: key, job_no: j.job_no, revision: j.revision,
        client_id: null, job_type: j.job_type,
        payment_status: 'Unpaid',
        lineItems: []
      };
    }
  });

  invJobs = Object.values(jobMap).map(function(j) {
    j.lineItems.sort(function(a,b){ return a.line_no - b.line_no; });
    j.invoiceNo = invoiceNoMap[j.key] || null;
    return j;
  });
  return invJobs;
}

async function loadJobsLite() {
  var { data, error } = await sb.from('jobs').select('job_no,revision,client_name,job_type,job_progress');
  if (error) throw error;
  jobsLite = data || [];
  return jobsLite;
}

// The invoice number only ever lives in invoice_log (doSendInv writes it there),
// and was never read back — so once sent, it was only ever visible in that
// moment's toast, never again on the page itself.
async function loadInvoiceLog() {
  var { data, error } = await sb.from('invoice_log').select('job_no,revision,invoice_no,date').order('date');
  if (error) throw error;
  invoiceNoMap = {};
  (data || []).forEach(function(row) {
    invoiceNoMap[row.job_no + '||' + (row.revision || '')] = row.invoice_no; // later rows (by date) win
  });
  return invoiceNoMap;
}

async function saveInvoiceLines(jobNo, revision, lineItems, paymentStatus) {
  for (var i = 0; i < lineItems.length; i++) {
    var item = lineItems[i];
    if (item.id) {
      var update = { description: item.desc, amount: item.amt };
      if (i === 0) update.payment_status = paymentStatus;
      var { error } = await sb.from('invoice_data').update(update).eq('id', item.id);
      if (error) throw error;
    } else {
      var { error } = await sb.from('invoice_data').insert({
        job_no: jobNo, revision, line_no: i + 1,
        description: item.desc, amount: item.amt,
        payment_status: i === 0 ? paymentStatus : null
      });
      if (error) throw error;
    }
  }
}

async function getNextInvoiceNo(clientCode) {
  var yy = String(new Date().getFullYear()).slice(-2);
  var prefix = 'INV ' + yy + '-' + clientCode + '-';
  var { data } = await sb.from('invoice_log').select('invoice_no').ilike('invoice_no', prefix + '%');
  var last = 0;
  (data || []).forEach(function(r) {
    var seq = parseInt(r.invoice_no.slice(prefix.length), 10);
    if (!isNaN(seq) && seq > last) last = seq;
  });
  return prefix + String(last + 1).padStart(4, '0');
}

// Finds the client record + parent job row for an invoicing entry (invoice_data doesn't
// reliably carry client_name/address, so we cross-reference the jobs table by job_no+revision).
function resolveInvoiceClient(invJob) {
  var jobRecord = jobsLite.find(function(j){ return j.job_no === invJob.job_no && (j.revision||'') === (invJob.revision||''); });
  var clientName = jobRecord ? jobRecord.client_name : null;
  var client = findClientByName(clients, clientName) || clients.find(function(c){ return c.client_id === invJob.client_id; });
  return { jobRecord: jobRecord, client: client };
}

// ════════════════════════════════════════════════
//  INVOICING PAGE
// ════════════════════════════════════════════════
function loadInvoicingPage() {
  document.getElementById('inv-container').innerHTML = '<div class="empty"><span class="empty-ico">&#8987;</span><p class="empty-title">Loading…</p></div>';
  // loadInvoiceJobs() merges in Invoicing-stage jobs from jobsLite and invoice
  // numbers from invoiceNoMap, so both have to be loaded first rather than in
  // parallel with it.
  Promise.all([loadJobsLite(), loadClients(), loadInvoiceLog()]).then(function(results) {
    clients = results[1];
    return loadInvoiceJobs();
  }).then(function() {
    updateInvStats(); renderInvoicing();
  }).catch(function(err){ toast('Failed to load invoicing: ' + err.message, 'err'); });
}

function updateInvStats() {
  var pending  = invJobs.filter(function(j){ return !j.lineItems.length || !j.lineItems[0].desc; }).length;
  var ready    = invJobs.filter(function(j){ return j.lineItems.length && j.payment_status === 'Unpaid'; }).length;
  var sent     = invJobs.filter(function(j){ return j.payment_status === 'Invoiced'; }).length;
  var total    = invJobs.reduce(function(s,j){ return s + j.lineItems.reduce(function(a,i){ return a + (parseFloat(i.amt)||0); }, 0); }, 0);
  document.getElementById('si-pending').textContent    = pending;
  document.getElementById('si-ready').textContent      = ready;
  document.getElementById('si-sent').textContent       = sent;
  document.getElementById('si-outstanding').textContent= 'A$ ' + total.toFixed(2);
}

function setInvFilter(f, el) {
  invFilter = f;
  document.querySelectorAll('#page-invoicing .filter-chip').forEach(function(b){ b.classList.remove('active'); });
  el.classList.add('active'); renderInvoicing();
}

function buildInvoiceCard(job) {
  var pc    = {'Unpaid':'pill-unpaid','Invoiced':'pill-invoiced','Paid':'pill-paid'}[job.payment_status] || 'pill-unpaid';
  var isPaid= job.payment_status === 'Paid', isInv = job.payment_status === 'Invoiced';
  var total = job.lineItems.reduce(function(s,i){ return s + (parseFloat(i.amt)||0); }, 0);
  var card  = document.createElement('div');
  card.id = 'icard-' + job.key;
  card.style.cssText = 'background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px 18px';
  var hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px';
  hdr.innerHTML = '<span class="sel-check"><input type="checkbox" data-sel-key="'+esc(job.key)+'"'+(selectedKeys.has(job.key)?' checked':'')+'></span>' +
    '<span style="font-family:DM Mono,monospace;font-size:13px;font-weight:700">'+esc(job.job_no)+'</span>' +
    (job.revision ? '<span style="font-family:DM Mono,monospace;font-size:10px;color:var(--text-soft);background:var(--rule);padding:1px 6px;border-radius:3px">'+esc(job.revision)+'</span>' : '') +
    '<span style="font-size:11px;color:var(--text-soft)">'+esc(job.job_type||'')+'</span>' +
    (job.invoiceNo ? '<span style="font-family:DM Mono,monospace;font-size:11px;color:var(--invoicing-txt)">'+esc(job.invoiceNo)+'</span>' : '') +
    '<span style="margin-left:auto"><span class="stage-pill '+pc+'">'+esc(job.payment_status)+'</span></span>';
  card.appendChild(hdr);

  // Any other jobs sharing this same invoice number were billed together as
  // a consolidated invoice — surfaced here so it's visible without having to
  // go looking elsewhere (the shared invoice_no is the only thing tying them
  // together under the hood).
  if (job.invoiceNo) {
    var siblings = invJobs.filter(function(j){ return j.key !== job.key && j.invoiceNo === job.invoiceNo; });
    if (siblings.length) {
      var note = document.createElement('div');
      note.style.cssText = 'font-size:11px;color:var(--text-soft);margin:-8px 0 12px';
      note.textContent = 'Also on this invoice: ' + siblings.map(function(s){ return s.job_no; }).join(', ');
      card.appendChild(note);
    }
  }

  var tbl = document.createElement('table'); tbl.style.cssText = 'width:100%;border-collapse:collapse;margin-bottom:6px';
  tbl.innerHTML = '<thead><tr><th style="text-align:left;font-size:10px;font-family:DM Mono,monospace;text-transform:uppercase;color:var(--text-soft);padding:0 0 6px;font-weight:600">Description</th><th style="width:120px;text-align:left;font-size:10px;font-family:DM Mono,monospace;text-transform:uppercase;color:var(--text-soft);padding:0 0 6px 8px;font-weight:600">Amount</th><th style="width:30px"></th></tr></thead>';
  var tbody = document.createElement('tbody'); tbody.id = 'ilines-' + job.key;
  job.lineItems.forEach(function(item){ tbody.appendChild(makeInvRow(job.key, item.desc, item.amt, item.id, isPaid)); });
  tbl.appendChild(tbody); card.appendChild(tbl);
  var totRow = document.createElement('div'); totRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-top:6px;border-top:1px solid var(--rule)';
  var addBtn = document.createElement('button'); addBtn.className = 'btn btn-ghost btn-sm'; addBtn.textContent = '+ Add Item'; addBtn.disabled = isPaid;
  addBtn.addEventListener('click', (function(jid){ return function(){ document.getElementById('ilines-'+jid).appendChild(makeInvRow(jid,'',0,null,false)); updateInvTotal(jid); }; })(job.key));
  var totSpan = document.createElement('span'); totSpan.style.cssText = 'font-family:DM Mono,monospace;font-size:13px;font-weight:700';
  totSpan.innerHTML = 'Total &nbsp;<span id="itotal-'+job.key+'" style="color:var(--invoicing-txt)">A$ '+total.toFixed(2)+'</span>';
  totRow.appendChild(addBtn); totRow.appendChild(totSpan); card.appendChild(totRow);
  var act = document.createElement('div'); act.style.cssText = 'display:flex;gap:7px;align-items:center';
  var saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-ghost btn-sm'; saveBtn.innerHTML = '&#128190; Save'; saveBtn.disabled = isPaid;
  saveBtn.onclick = (function(j){ return function(){ doSaveInv(j); }; })(job);
  var genBtn = document.createElement('button'); genBtn.className = 'btn btn-primary btn-sm'; genBtn.innerHTML = '&#128196; Generate'; genBtn.disabled = isInv || isPaid;
  genBtn.onclick = (function(j){ return function(){ doGenerateInv(j); }; })(job);
  var sendBtn = document.createElement('button'); sendBtn.className = 'btn btn-accent btn-sm'; sendBtn.innerHTML = '&#9993; Send'; sendBtn.disabled = isPaid;
  sendBtn.onclick = (function(j,btn){ return function(){ doSendInv(j, btn); }; })(job, sendBtn);
  var spacer = document.createElement('div'); spacer.style.flex = '1';
  var paidBtn = document.createElement('button'); paidBtn.className = 'btn btn-green btn-sm'; paidBtn.innerHTML = '&#10003; Mark Paid'; paidBtn.disabled = !isInv || isPaid;
  paidBtn.onclick = (function(j){ return function(){ doMarkPaid(j); }; })(job);
  act.appendChild(saveBtn); act.appendChild(genBtn); act.appendChild(sendBtn); act.appendChild(spacer); act.appendChild(paidBtn);
  card.appendChild(act);
  return card;
}

function renderInvoicing() {
  var q = (document.getElementById('inv-search').value || '').toLowerCase();
  var filtered = invJobs.slice();
  if (invFilter !== 'all') filtered = filtered.filter(function(j){ return j.payment_status === invFilter; });
  if (q) filtered = filtered.filter(function(j){ return (j.job_no||'').toLowerCase().indexOf(q) > -1; });
  var c = document.getElementById('inv-container');
  if (!filtered.length) { c.innerHTML = '<div class="empty"><span class="empty-ico">&#10003;</span><p class="empty-title">No invoicing jobs</p></div>'; return; }
  c.innerHTML = '';
  var wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  filtered.forEach(function(job){ wrap.appendChild(buildInvoiceCard(job)); });
  c.appendChild(wrap);
  updateConsolidateBar();
}

// ════════════════════════════════════════════════
//  CONSOLIDATED INVOICING
//  Selecting several jobs for the same client bundles them into one
//  invoice (one PDF, one email, one shared invoice_no) via
//  sendConsolidatedInvoice() — see buildInvoiceCard()'s "sel-check"
//  checkboxes and the bulk bar in index.html.
// ════════════════════════════════════════════════
function setInvSelectMode(on) {
  selectMode = on;
  document.getElementById('page-invoicing').classList.toggle('select-on', on);
  document.getElementById('btn-inv-select-mode').classList.toggle('active', on);
  if (!on) { selectedKeys.clear(); pendingConsolidated = null; }
  renderInvoicing();
}

function toggleInvSelection(key) {
  if (selectedKeys.has(key)) selectedKeys.delete(key); else selectedKeys.add(key);
  pendingConsolidated = null; // selection changed — any previously-generated consolidated invoice no longer matches it
  updateConsolidateBar();
}

function updateConsolidateBar() {
  var bar = document.getElementById('inv-bulk-bar');
  var n = selectedKeys.size;
  if (!selectMode || n < 2) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  var jobs = invJobs.filter(function(j){ return selectedKeys.has(j.key); });
  var resolvedClients = jobs.map(function(j){ return resolveInvoiceClient(j).client; });
  var allResolved = resolvedClients.every(function(c){ return !!c; });
  var sameClient  = allResolved && new Set(resolvedClients.map(function(c){ return c.client_id; })).size === 1;

  document.getElementById('inv-bulk-count').textContent = n + ' selected';
  document.getElementById('inv-bulk-warning').textContent = sameClient ? '' : 'Selected jobs must all be for the same client to consolidate';
  document.getElementById('inv-bulk-generate').disabled = !sameClient;
  document.getElementById('inv-bulk-send').disabled = !pendingConsolidated;
}

async function doConsolidateGenerate() {
  var jobs = invJobs.filter(function(j){ return selectedKeys.has(j.key); });
  var jobGroups = [];
  for (var i = 0; i < jobs.length; i++) {
    var items = getInvLines(jobs[i].key);
    if (!items.length || !items[0].desc) { toast('Every selected job needs at least one line item — check ' + jobs[i].job_no, 'err'); return; }
    jobGroups.push({ job: jobs[i], items: items });
  }
  var resolved = resolveInvoiceClient(jobs[0]);
  if (!resolved.client) { toast('Could not match these jobs to a client record', 'err'); return; }
  if (!resolved.client.email_to) { toast('Client "' + resolved.client.name + '" has no Email To set', 'err'); return; }

  var btn = document.getElementById('inv-bulk-generate');
  btn.disabled = true;
  var previewWin = window.open('', '_blank'); // opened synchronously — see showPdfInTab()
  try {
    for (var i = 0; i < jobGroups.length; i++) {
      await saveInvoiceLines(jobGroups[i].job.job_no, jobGroups[i].job.revision, jobGroups[i].items, 'Unpaid');
    }
    var invNo   = await getNextInvoiceNo(resolved.client.code || '00');
    var invDate = new Date();
    var dueDate = new Date(invDate.getTime() + 30 * 86400000);
    var total   = jobGroups.reduce(function(s,g){ return s + g.items.reduce(function(a,i){ return a + (i.amt||0); }, 0); }, 0);
    var pdfBase64 = await generateInvoicePdf(jobGroups, resolved.client, invNo, total, invDate, dueDate);
    pendingConsolidated = { jobGroups: jobGroups, client: resolved.client, invNo: invNo, invDate: invDate, pdfBase64: pdfBase64 };
    showPdfInTab(previewWin, pdfBase64);
    toast('Invoice ' + invNo + ' ready for ' + jobGroups.length + ' jobs — review the preview, then click Send', 'ok');
  } catch (err) {
    if (previewWin && !previewWin.closed) previewWin.close();
    toast('Error: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    updateConsolidateBar();
  }
}

async function doConsolidateSend() {
  if (!pendingConsolidated) { toast('Click Generate first', 'err'); return; }
  var p = pendingConsolidated;
  if (!confirm('Send consolidated invoice ' + p.invNo + ' (' + p.jobGroups.length + ' jobs) to ' + p.client.email_to + '?')) return;

  var btn = document.getElementById('inv-bulk-send');
  btn.disabled = true;
  try {
    await sendConsolidatedInvoice(p.jobGroups, p.client, p.invNo, p.invDate, p.pdfBase64);
    pendingConsolidated = null;
    selectedKeys.clear();
    for (var i = 0; i < p.jobGroups.length; i++) {
      await refreshOneInvoiceJob(p.jobGroups[i].job.job_no, p.jobGroups[i].job.revision);
    }
  } catch (err) {
    toast('Send failed: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    updateConsolidateBar();
  }
}

// Re-fetches just this one job's invoice_data rows and swaps only its card's
// DOM node in place — a full loadInvoicingPage() reload was wiping whatever
// anyone was mid-typing into every OTHER card's line items on the page.
// Returns the updated job object (callers that need to keep working with it,
// like doGenerateInv setting its pending-send state, use this instead of the
// stale object they were passed).
async function refreshOneInvoiceJob(jobNo, revision) {
  var key = jobNo + '||' + (revision || '');
  var { data, error } = await sb.from('invoice_data').select('*')
    .eq('job_no', jobNo).eq('revision', revision || '').order('line_no');
  if (error) throw error;

  var updated;
  if (data && data.length) {
    var firstLine = data.find(function(r){ return r.line_no === 1; }) || data[0];
    updated = {
      key: key, job_no: jobNo, revision: revision,
      client_id: firstLine.client_id, job_type: firstLine.job_type,
      payment_status: firstLine.payment_status || 'Unpaid',
      lineItems: data.map(function(row){ return { line_no: row.line_no, desc: row.description, amt: row.amount, id: row.id }; })
    };
  } else {
    var jr = jobsLite.find(function(j){ return j.job_no === jobNo && (j.revision||'') === (revision||''); });
    updated = { key: key, job_no: jobNo, revision: revision, client_id: null, job_type: jr ? jr.job_type : null, payment_status: 'Unpaid', lineItems: [] };
  }
  updated.invoiceNo = invoiceNoMap[key] || null;

  var idx = invJobs.findIndex(function(j){ return j.key === key; });
  if (idx > -1) invJobs[idx] = updated; else invJobs.push(updated);

  updateInvStats();
  var oldCard = document.getElementById('icard-' + key);
  if (oldCard && oldCard.parentNode) oldCard.parentNode.replaceChild(buildInvoiceCard(updated), oldCard);
  else renderInvoicing(); // card isn't in the current filter/search view — fall back to a full re-render

  return updated;
}

function makeInvRow(jobId, desc, amt, lineId, disabled) {
  var tr = document.createElement('tr');
  var di = document.createElement('input'); di.type = 'text'; di.value = desc || ''; di.placeholder = 'Description…'; di.disabled = disabled;
  di.style.cssText = 'width:100%;padding:5px 8px;border:1px solid var(--rule);border-radius:4px;background:var(--surface2);color:var(--text);font-family:Inter,sans-serif;font-size:13px';
  if (lineId) di.dataset.lineId = lineId;
  var ai = document.createElement('input'); ai.type = 'number'; ai.value = amt || ''; ai.step = '0.01'; ai.placeholder = '0.00'; ai.disabled = disabled;
  ai.style.cssText = 'width:100%;padding:5px 8px;border:1px solid var(--rule);border-radius:4px;background:var(--surface2);color:var(--text);font-family:DM Mono,monospace;font-size:13px';
  ai.addEventListener('input', function(){ updateInvTotal(jobId); });
  var rb = document.createElement('button'); rb.innerHTML = '&#x2715;'; rb.disabled = disabled; rb.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-soft);font-size:14px;padding:4px';
  rb.addEventListener('click', function(){ tr.remove(); updateInvTotal(jobId); });
  var td1 = document.createElement('td'); td1.style.padding = '3px 0'; td1.appendChild(di);
  var td2 = document.createElement('td'); td2.style.cssText = 'padding:3px 0 3px 8px;width:120px'; td2.appendChild(ai);
  var td3 = document.createElement('td'); td3.style.cssText = 'width:30px;text-align:center'; td3.appendChild(rb);
  tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); return tr;
}

function updateInvTotal(jobId) {
  var tbody = document.getElementById('ilines-' + jobId); if (!tbody) return;
  var total = 0; tbody.querySelectorAll('input[type=number]').forEach(function(i){ total += parseFloat(i.value) || 0; });
  var el = document.getElementById('itotal-' + jobId); if (el) el.textContent = 'A$ ' + total.toFixed(2);
}

function getInvLines(jobId) {
  var tbody = document.getElementById('ilines-' + jobId); if (!tbody) return [];
  var items = [];
  tbody.querySelectorAll('tr').forEach(function(tr) {
    var inputs = tr.querySelectorAll('input');
    if (inputs.length >= 2 && inputs[0].value.trim()) {
      items.push({ desc: inputs[0].value.trim(), amt: parseFloat(inputs[1].value) || 0, id: inputs[0].dataset.lineId ? parseInt(inputs[0].dataset.lineId) : null });
    }
  });
  return items;
}

function doSaveInv(job) {
  var items = getInvLines(job.key);
  toast('Saving…', 'ok');
  saveInvoiceLines(job.job_no, job.revision, items, 'Unpaid').then(function() {
    toast('Saved', 'ok');
    // Only this card's DOM gets swapped — a brand-new line item was just
    // inserted with a real row id, and the DOM's dataset.lineId needs to pick
    // that up (or the next Save would insert duplicates), but a full page
    // reload was also wiping whatever anyone was mid-typing into every other
    // card on the page.
    return refreshOneInvoiceJob(job.job_no, job.revision);
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); });
}

// Points an already-open tab at the rendered PDF. The tab must be opened
// synchronously by the caller, before any await — opening it here (after
// Generate's several awaited steps) would make the browser treat it as an
// unrequested popup and block it.
function showPdfInTab(win, pdfBase64) {
  var url = URL.createObjectURL(base64ToBlob(pdfBase64, 'application/pdf'));
  if (win && !win.closed) win.location.href = url; else window.open(url, '_blank');
}

async function doGenerateInv(job) {
  var items = getInvLines(job.key);
  if (!items.length || !items[0].desc) { toast('Add at least one line item', 'err'); return; }
  var resolved = resolveInvoiceClient(job);
  if (!resolved.client) { toast('Could not match this job to a client record', 'err'); return; }
  if (!resolved.client.email_to) { toast('Client "' + resolved.client.name + '" has no Email To set', 'err'); return; }
  var previewWin = window.open('', '_blank'); // opened synchronously — see showPdfInTab()
  try {
    // A job just promoted from the Invoicing stage (loadInvoiceJobs) has no
    // invoice_data row yet — persist first, since Send only ever UPDATEs that
    // row's payment_status and would otherwise silently match nothing.
    await saveInvoiceLines(job.job_no, job.revision, items, 'Unpaid');
    var updatedJob = await refreshOneInvoiceJob(job.job_no, job.revision);
    var invNo   = await getNextInvoiceNo(resolved.client.code || '00');
    var invDate = new Date();
    var dueDate = new Date(invDate.getTime() + 30 * 86400000);
    var total   = items.reduce(function(s,i){ return s + (i.amt||0); }, 0);
    // Rendered now rather than at Send time, so there's something to actually
    // preview before committing to emailing it — Send just reuses this PDF.
    var pdfBase64 = await generateInvoicePdf([{ job: updatedJob, items: items }], resolved.client, invNo, total, invDate, dueDate);

    updatedJob._pendingInvNo   = invNo;
    updatedJob._pendingItems   = items;
    updatedJob._pendingClient  = resolved.client;
    updatedJob._pendingInvDate = invDate;
    updatedJob._pendingPdf     = pdfBase64;
    showPdfInTab(previewWin, pdfBase64);
    toast('Invoice ' + invNo + ' ready — review the preview, then click Send', 'ok');
  } catch (err) {
    if (previewWin && !previewWin.closed) previewWin.close();
    toast('Error: ' + err.message, 'err');
  }
}

// Shared by a single-job Send and a consolidated Send covering several jobs
// for the same client. jobGroups is [{ job, items }, ...]. One combined PDF
// and one email go out, but each job still gets its own invoice_log row (all
// sharing invNo — that shared number is what makes a consolidated invoice
// traceable later), its own invoice_data update, and its own copy of the PDF
// saved into its own OneDrive invoice folder, so every job keeps its own
// paper trail even though they were billed together.
// pdfBase64 is optional — Generate already renders it for the preview, so
// Send normally just reuses that instead of rendering it a second time.
async function sendConsolidatedInvoice(jobGroups, client, invNo, invDate, pdfBase64) {
  var token   = await getGraphToken();
  var dueDate = new Date(invDate.getTime() + 30 * 86400000);
  var total   = jobGroups.reduce(function(s,g){ return s + g.items.reduce(function(a,i){ return a + (i.amt||0); }, 0); }, 0);

  if (!pdfBase64) {
    toast('Generating PDF…', 'ok');
    pdfBase64 = await generateInvoicePdf(jobGroups, client, invNo, total, invDate, dueDate);
  }

  toast('Sending email…', 'ok');
  await sendInvoiceEmail(token, jobGroups, client, invNo, pdfBase64, total);

  for (var i = 0; i < jobGroups.length; i++) {
    var job = jobGroups[i].job;
    var jobTotal = jobGroups[i].items.reduce(function(s,it){ return s + (it.amt||0); }, 0);

    // The invoice folder gets created (see onedrive.js) but nothing was ever
    // actually putting the PDF in it — it only ever went out as an email
    // attachment, never saved to Steven's own records.
    try {
      var invoiceFolderPath = await createInvoiceFolder(token, client.code, client.name, job.job_no, job.revision);
      var pdfFile = new File([base64ToBlob(pdfBase64, 'application/pdf')], invNo + '.pdf', { type: 'application/pdf' });
      await uploadFileToOneDrive(token, invoiceFolderPath, pdfFile);
    } catch (pdfSaveErr) {
      // The email already went out — don't fail the whole send over a save-copy
      // problem, just surface it so Steven knows to save it manually.
      toast('Invoice sent, but saving a copy to OneDrive failed for ' + job.job_no + ': ' + pdfSaveErr.message, 'err');
    }

    var { error: logErr } = await sb.from('invoice_log').insert({
      invoice_no: invNo, job_no: job.job_no, revision: job.revision,
      client_id: client.client_id, client_name: client.name,
      date: invDate.toISOString().slice(0,10), total_amount: jobTotal,
      status: 'Sent', payment_status: 'Invoiced'
    });
    if (logErr) { toast('Failed to log invoice for ' + job.job_no + ': ' + logErr.message, 'err'); continue; }

    var { error: updErr } = await sb.from('invoice_data').update({ payment_status: 'Invoiced' })
      .eq('job_no', job.job_no).eq('revision', job.revision || '').eq('line_no', 1);
    if (updErr) toast('Failed to update invoice_data for ' + job.job_no + ': ' + updErr.message, 'err');

    invoiceNoMap[job.key] = invNo;
  }

  toast('Invoice ' + invNo + ' sent to ' + client.email_to +
    (jobGroups.length > 1 ? ' (' + jobGroups.length + ' jobs)' : ''), 'ok');
}

async function doSendInv(job, btnEl) {
  if (!job._pendingInvNo) { toast('Click Generate first', 'err'); return; }
  if (!confirm('Send invoice ' + job._pendingInvNo + ' to ' + job._pendingClient.email_to + '?')) return;

  var origLabel = btnEl ? btnEl.innerHTML : null;
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spin"></span> Sending…'; }
  toast('Signing in to Outlook…', 'ok');
  try {
    await sendConsolidatedInvoice([{ job: job, items: job._pendingItems }], job._pendingClient, job._pendingInvNo, job._pendingInvDate || new Date(), job._pendingPdf);
    delete job._pendingInvNo; delete job._pendingItems; delete job._pendingClient; delete job._pendingInvDate; delete job._pendingPdf;
    // Only this card's DOM gets swapped (rebuilds the button, so no need to
    // restore origLabel) — same reasoning as Save: a full re-render would
    // wipe anything mid-typing in every other card.
    await refreshOneInvoiceJob(job.job_no, job.revision);
  } catch (err) {
    toast('Send failed: ' + err.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origLabel; }
  }
}

async function doMarkPaid(job) {
  // Jobs sharing this job's invoice number were billed together on a
  // consolidated invoice — Mark Paid applies to the whole thing at once,
  // since it was sent and gets paid as one unit, not job by job.
  var group = job.invoiceNo
    ? invJobs.filter(function(j){ return j.invoiceNo === job.invoiceNo; })
    : [job];
  var jobList = group.map(function(j){ return j.job_no; }).join(', ');
  var confirmMsg = group.length > 1
    ? 'Mark as Paid — this invoice covers ' + group.length + ' jobs (' + jobList + ')?'
    : 'Mark as Paid?';
  if (!confirm(confirmMsg)) return;

  try {
    for (var i = 0; i < group.length; i++) {
      var g = group[i];
      var { error: dataErr } = await sb.from('invoice_data').update({ payment_status: 'Paid' })
        .eq('job_no', g.job_no).eq('revision', g.revision || '').eq('line_no', 1);
      if (dataErr) throw dataErr;

      var { error: logErr } = await sb.from('invoice_log').update({ status: 'Paid', payment_status: 'Paid' })
        .eq('job_no', g.job_no).eq('revision', g.revision || '');
      if (logErr) throw logErr;
    }

    toast('Marked as Paid' + (group.length > 1 ? ' (' + group.length + ' jobs)' : ''), 'ok');
    for (var i = 0; i < group.length; i++) await refreshOneInvoiceJob(group[i].job_no, group[i].revision);

    var completeMsg = group.length > 1
      ? 'Also mark all ' + group.length + ' jobs as Completed?'
      : 'Also mark this job as Completed?';
    if (confirm(completeMsg)) {
      for (var i = 0; i < group.length; i++) await completeJobAndCreatePayouts(group[i].job_no, group[i].revision);
    }
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  }
}

// Flips the job to Completed, then auto-creates blank engineer_payout rows for
// whoever's assigned (CN as eng, LM as sv_drafting) — fee/rate left for Steven to fill in.
async function completeJobAndCreatePayouts(jobNo, revision) {
  var { data: jobRow, error: findErr } = await sb.from('jobs').select('*')
    .eq('job_no', jobNo).eq('revision', revision || '').single();
  if (findErr || !jobRow) { toast('Could not find job to complete: ' + (findErr ? findErr.message : 'not found'), 'err'); return; }

  var { error: updErr } = await sb.from('jobs').update({ job_progress: 'Completed' }).eq('id', jobRow.id);
  if (updErr) { toast('Error completing job: ' + updErr.message, 'err'); return; }
  toast('Job marked Completed', 'ok');

  await createPayoutRowsForJob(jobRow);
}

// CN and LM are the only roles actually paid per-job through this table —
// SL is salaried, not paid this way. One row per person per job, even if
// that person holds both the Engineer and SV Drafting roles on it — the
// Payout page's amount modal shows both fee fields on that single row
// (fee/conv for Engineer, sv_fee for SV Drafting) rather than splitting
// into two rows, which made the table too cluttered to scan.
async function createPayoutRowsForJob(jobRow) {
  var payablePersons = ['CN', 'LM'];
  var peopleSet = {};
  if (payablePersons.indexOf(jobRow.eng) > -1)         peopleSet[jobRow.eng] = true;
  if (payablePersons.indexOf(jobRow.sv_drafting) > -1) peopleSet[jobRow.sv_drafting] = true;
  var people = Object.keys(peopleSet);
  if (!people.length) return;

  for (var i = 0; i < people.length; i++) {
    var person = people[i];
    var { data: existing, error: checkErr } = await sb.from('engineer_payout').select('id')
      .eq('job_no', jobRow.job_no).eq('revision', jobRow.revision || '').eq('person', person);
    if (checkErr) { toast('Payout check failed for ' + person + ': ' + checkErr.message, 'err'); continue; }
    if (existing && existing.length) continue; // already has a payout row for this job — don't duplicate

    var { error: insErr } = await sb.from('engineer_payout').insert({
      person: person,
      job_no: jobRow.job_no,
      revision: jobRow.revision,
      client_name: jobRow.client_name,
      job_type: jobRow.job_type,
      sv_draft: jobRow.sv_drafting,
      note: null,
      fee: null,
      rate: null,
      conv: null,
      sv_fee: null,
      paid: 'Nope'
    });
    if (insErr) { toast('Failed to create ' + person + ' payout row: ' + insErr.message, 'err'); continue; }
    toast(person + ' payout row created', 'ok');
  }
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('invoicing');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('btn-refresh-inv').addEventListener('click', loadInvoicingPage);
  document.getElementById('if-all').addEventListener('click',      function(){ setInvFilter('all',this); });
  document.getElementById('if-unpaid').addEventListener('click',   function(){ setInvFilter('Unpaid',this); });
  document.getElementById('if-invoiced').addEventListener('click', function(){ setInvFilter('Invoiced',this); });
  document.getElementById('inv-search').addEventListener('input',  renderInvoicing);

  document.getElementById('btn-inv-select-mode').addEventListener('click', function(){ setInvSelectMode(!selectMode); });
  document.getElementById('inv-container').addEventListener('change', function(e){
    if (e.target.matches('input[data-sel-key]')) toggleInvSelection(e.target.getAttribute('data-sel-key'));
  });
  document.getElementById('inv-bulk-generate').addEventListener('click', doConsolidateGenerate);
  document.getElementById('inv-bulk-send').addEventListener('click', doConsolidateSend);
  document.getElementById('inv-bulk-clear').addEventListener('click', function(){ selectedKeys.clear(); pendingConsolidated = null; renderInvoicing(); });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadInvoicingPage();
}());
