// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var invJobs = [], jobsLite = [], clients = [];
var invFilter = 'all';

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadInvoiceJobs() {
  var { data, error } = await sb.from('invoice_data').select('*').order('job_no');
  if (error) throw error;
  // Group by job_no + revision
  var jobMap = {};
  (data || []).forEach(function(row) {
    var key = row.job_no + '||' + (row.revision || '');
    if (!jobMap[key]) {
      jobMap[key] = {
        id: row.id, job_no: row.job_no, revision: row.revision,
        client_id: row.client_id, job_type: row.job_type,
        payment_status: row.payment_status || 'Unpaid',
        lineItems: []
      };
    }
    if (row.payment_status) jobMap[key].payment_status = row.payment_status;
    jobMap[key].lineItems.push({ line_no: row.line_no, desc: row.description, amt: row.amount, id: row.id });
  });
  invJobs = Object.values(jobMap).map(function(j) {
    j.lineItems.sort(function(a,b){ return a.line_no - b.line_no; });
    return j;
  });
  return invJobs;
}

async function loadJobsLite() {
  var { data, error } = await sb.from('jobs').select('job_no,revision,client_name');
  if (error) throw error;
  jobsLite = data || [];
  return jobsLite;
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
  Promise.all([loadInvoiceJobs(), loadJobsLite(), loadClients()]).then(function(results) {
    clients = results[2];
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

function renderInvoicing() {
  var q = (document.getElementById('inv-search').value || '').toLowerCase();
  var filtered = invJobs.slice();
  if (invFilter !== 'all') filtered = filtered.filter(function(j){ return j.payment_status === invFilter; });
  if (q) filtered = filtered.filter(function(j){ return (j.job_no||'').toLowerCase().indexOf(q) > -1; });
  var c = document.getElementById('inv-container');
  if (!filtered.length) { c.innerHTML = '<div class="empty"><span class="empty-ico">&#10003;</span><p class="empty-title">No invoicing jobs</p></div>'; return; }
  c.innerHTML = '';
  var wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  filtered.forEach(function(job) {
    var pc    = {'Unpaid':'pill-unpaid','Invoiced':'pill-invoiced','Paid':'pill-paid'}[job.payment_status] || 'pill-unpaid';
    var isPaid= job.payment_status === 'Paid', isInv = job.payment_status === 'Invoiced';
    var total = job.lineItems.reduce(function(s,i){ return s + (parseFloat(i.amt)||0); }, 0);
    var card  = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px 18px';
    var hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px';
    hdr.innerHTML = '<span style="font-family:DM Mono,monospace;font-size:13px;font-weight:700">'+esc(job.job_no)+'</span>' +
      (job.revision ? '<span style="font-family:DM Mono,monospace;font-size:10px;color:var(--text-soft);background:var(--rule);padding:1px 6px;border-radius:3px">'+esc(job.revision)+'</span>' : '') +
      '<span style="font-size:11px;color:var(--text-soft)">'+esc(job.job_type||'')+'</span>' +
      '<span style="margin-left:auto"><span class="stage-pill '+pc+'">'+esc(job.payment_status)+'</span></span>';
    card.appendChild(hdr);
    var tbl = document.createElement('table'); tbl.style.cssText = 'width:100%;border-collapse:collapse;margin-bottom:6px';
    tbl.innerHTML = '<thead><tr><th style="text-align:left;font-size:10px;font-family:DM Mono,monospace;text-transform:uppercase;color:var(--text-soft);padding:0 0 6px;font-weight:600">Description</th><th style="width:120px;text-align:left;font-size:10px;font-family:DM Mono,monospace;text-transform:uppercase;color:var(--text-soft);padding:0 0 6px 8px;font-weight:600">Amount</th><th style="width:30px"></th></tr></thead>';
    var tbody = document.createElement('tbody'); tbody.id = 'ilines-' + job.id;
    job.lineItems.forEach(function(item){ tbody.appendChild(makeInvRow(job.id, item.desc, item.amt, item.id, isPaid)); });
    tbl.appendChild(tbody); card.appendChild(tbl);
    var totRow = document.createElement('div'); totRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-top:6px;border-top:1px solid var(--rule)';
    var addBtn = document.createElement('button'); addBtn.className = 'btn btn-ghost btn-sm'; addBtn.textContent = '+ Add Item'; addBtn.disabled = isPaid;
    addBtn.addEventListener('click', (function(jid){ return function(){ document.getElementById('ilines-'+jid).appendChild(makeInvRow(jid,'',0,null,false)); updateInvTotal(jid); }; })(job.id));
    var totSpan = document.createElement('span'); totSpan.style.cssText = 'font-family:DM Mono,monospace;font-size:13px;font-weight:700';
    totSpan.innerHTML = 'Total &nbsp;<span id="itotal-'+job.id+'" style="color:var(--invoicing-txt)">A$ '+total.toFixed(2)+'</span>';
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
    card.appendChild(act); wrap.appendChild(card);
  });
  c.appendChild(wrap);
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
  var items = getInvLines(job.id);
  toast('Saving…', 'ok');
  saveInvoiceLines(job.job_no, job.revision, items, 'Unpaid').then(function() {
    toast('Saved', 'ok');
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); });
}

function doGenerateInv(job) {
  var items = getInvLines(job.id);
  if (!items.length || !items[0].desc) { toast('Add at least one line item', 'err'); return; }
  var resolved = resolveInvoiceClient(job);
  if (!resolved.client) { toast('Could not match this job to a client record', 'err'); return; }
  if (!resolved.client.email_to) { toast('Client "' + resolved.client.name + '" has no Email To set', 'err'); return; }
  getNextInvoiceNo(resolved.client.code || '00').then(function(invNo) {
    job._pendingInvNo   = invNo;
    job._pendingItems   = items;
    job._pendingClient  = resolved.client;
    job._pendingInvDate = new Date();
    toast('Invoice ' + invNo + ' ready — click Send to email', 'ok');
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); });
}

async function doSendInv(job, btnEl) {
  if (!job._pendingInvNo) { toast('Click Generate first', 'err'); return; }
  if (!confirm('Send invoice ' + job._pendingInvNo + ' to ' + job._pendingClient.email_to + '?')) return;

  var origLabel = btnEl ? btnEl.innerHTML : null;
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="spin"></span> Sending…'; }
  toast('Signing in to Outlook…', 'ok');
  try {
    var token = await getGraphToken();

    var items    = job._pendingItems;
    var client   = job._pendingClient;
    var invNo    = job._pendingInvNo;
    var invDate  = job._pendingInvDate || new Date();
    var dueDate  = new Date(invDate.getTime() + 30 * 86400000);
    var total    = items.reduce(function(s,i){ return s + (i.amt||0); }, 0);

    toast('Generating PDF…', 'ok');
    var pdfBase64 = await generateInvoicePdf(job, client, invNo, items, total, invDate, dueDate);

    toast('Sending email…', 'ok');
    await sendInvoiceEmail(token, job, client, invNo, pdfBase64, total);

    var { error: logErr } = await sb.from('invoice_log').insert({
      invoice_no: invNo, job_no: job.job_no, revision: job.revision,
      client_id: client.client_id, client_name: client.name,
      date: invDate.toISOString().slice(0,10), total_amount: total,
      status: 'Sent', payment_status: 'Invoiced'
    });
    if (logErr) throw logErr;

    var { error: updErr } = await sb.from('invoice_data').update({ payment_status: 'Invoiced' })
      .eq('job_no', job.job_no).eq('revision', job.revision || '').eq('line_no', 1);
    if (updErr) throw updErr;

    job.payment_status = 'Invoiced';
    delete job._pendingInvNo; delete job._pendingItems; delete job._pendingClient; delete job._pendingInvDate;
    toast('Invoice ' + invNo + ' sent to ' + client.email_to, 'ok');
    updateInvStats(); renderInvoicing(); // re-render rebuilds the button, so no need to restore origLabel
  } catch (err) {
    toast('Send failed: ' + err.message, 'err');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = origLabel; }
  }
}

async function doMarkPaid(job) {
  if (!confirm('Mark as Paid?')) return;
  try {
    var { error: dataErr } = await sb.from('invoice_data').update({ payment_status: 'Paid' })
      .eq('job_no', job.job_no).eq('revision', job.revision || '').eq('line_no', 1);
    if (dataErr) throw dataErr;

    var { error: logErr } = await sb.from('invoice_log').update({ status: 'Paid', payment_status: 'Paid' })
      .eq('job_no', job.job_no).eq('revision', job.revision || '');
    if (logErr) throw logErr;

    job.payment_status = 'Paid';
    toast('Marked as Paid', 'ok');
    renderInvoicing();

    if (confirm('Also mark this job as Completed?')) {
      await completeJobAndCreatePayouts(job.job_no, job.revision);
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

async function createPayoutRowsForJob(jobRow) {
  var people = [];
  if (jobRow.eng === 'CN') people.push('CN');
  if (jobRow.sv_drafting === 'LM') people.push('LM');
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

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadInvoicingPage();
}());
