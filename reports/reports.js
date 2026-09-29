// ════════════════════════════════════════════════
//  Fixed client -> color mapping (identity, never rank — a client always
//  gets the same color no matter how the revenue bars happen to sort).
// ════════════════════════════════════════════════
var CLIENT_COLOR_MAP = {
  'dexconengineeringgroup': 'var(--client-1)',
  'araxconsulting': 'var(--client-2)',
  'forenxconsultingengineers': 'var(--client-3)'
};
function clientColor(name) {
  return CLIENT_COLOR_MAP[normalizeClientName(name)] || 'var(--text-soft)';
}

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadReportData() {
  var [invoiceLogRes, payoutRes, jobsRes, historyRes] = await Promise.all([
    sb.from('invoice_log').select('date,total_amount,payment_status,client_name'),
    sb.from('engineer_payout').select('person,fee,paid'),
    sb.from('jobs').select('job_progress'),
    sb.from('job_history').select('changed_at,new_value').eq('field_name', 'job_progress').eq('new_value', 'Completed')
  ]);
  if (invoiceLogRes.error) throw invoiceLogRes.error;
  if (payoutRes.error) throw payoutRes.error;
  if (jobsRes.error) throw jobsRes.error;
  // job_history may not exist yet if sql/job-activity-trail.sql hasn't been run —
  // degrade gracefully rather than breaking the whole report.
  var history = historyRes.error ? [] : (historyRes.data || []);
  return {
    invoiceLog: invoiceLogRes.data || [],
    payout: payoutRes.data || [],
    jobs: jobsRes.data || [],
    history: history
  };
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function renderReports(d) {
  var totalInvoiced = d.invoiceLog.reduce(function(s,r){ return s + (parseFloat(r.total_amount)||0); }, 0);
  var outstanding   = d.invoiceLog.filter(function(r){ return r.payment_status !== 'Paid'; })
                                   .reduce(function(s,r){ return s + (parseFloat(r.total_amount)||0); }, 0);
  var cnUnpaid = d.payout.filter(function(r){ return r.person === 'CN' && r.paid !== 'Paid'; })
                          .reduce(function(s,r){ return s + (r.fee||0); }, 0);
  var lmUnpaid = d.payout.filter(function(r){ return r.person === 'LM' && r.paid !== 'Paid'; })
                          .reduce(function(s,r){ return s + (r.fee||0); }, 0);
  var activeJobs = d.jobs.filter(function(j){ return j.job_progress !== 'Completed' && j.job_progress !== 'Cancelled'; }).length;

  var now = new Date();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var completedThisMonth = d.history.filter(function(h){ return new Date(h.changed_at) >= monthStart; }).length;

  document.getElementById('rp-total-invoiced').textContent   = 'A$ ' + totalInvoiced.toLocaleString('en-AU', {minimumFractionDigits:0, maximumFractionDigits:0});
  document.getElementById('rp-outstanding').textContent      = 'A$ ' + outstanding.toLocaleString('en-AU', {minimumFractionDigits:0, maximumFractionDigits:0});
  document.getElementById('rp-cn-unpaid').textContent        = 'A$ ' + cnUnpaid.toFixed(2);
  document.getElementById('rp-lm-unpaid').textContent        = 'Rp ' + Math.round(lmUnpaid).toLocaleString('id-ID');
  document.getElementById('rp-completed-month').textContent  = completedThisMonth;
  document.getElementById('rp-active-jobs').textContent      = activeJobs;

  renderMonthlyBars(d.invoiceLog);
  renderClientBars(d.invoiceLog);
}

function renderMonthlyBars(invoiceLog) {
  var byMonth = {};
  invoiceLog.forEach(function(r) {
    if (!r.date) return;
    var key = r.date.slice(0,7); // "YYYY-MM"
    byMonth[key] = (byMonth[key] || 0) + (parseFloat(r.total_amount) || 0);
  });
  var months = Object.keys(byMonth).sort().slice(-6); // last 6 months that actually have data
  var el = document.getElementById('rp-monthly-bars');
  if (!months.length) { el.innerHTML = '<div class="empty" style="padding:20px"><p class="empty-title">No invoice data yet</p></div>'; return; }

  var max = Math.max.apply(null, months.map(function(m){ return byMonth[m]; }));
  el.innerHTML = '';
  months.forEach(function(m) {
    var val = byMonth[m];
    var pct = max > 0 ? Math.max((val / max) * 100, 2) : 2;
    var d = new Date(m + '-01T00:00:00');
    var label = d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    var col = document.createElement('div'); col.className = 'bar-col';
    col.innerHTML =
      '<span class="bar-val">A$'+Math.round(val).toLocaleString('en-AU')+'</span>' +
      '<div class="bar-rect" style="height:'+pct+'%"></div>' +
      '<span class="bar-lbl">'+label+'</span>';
    el.appendChild(col);
  });
}

function renderClientBars(invoiceLog) {
  var byClient = {};
  invoiceLog.forEach(function(r) {
    var name = r.client_name || 'Unknown';
    byClient[name] = (byClient[name] || 0) + (parseFloat(r.total_amount) || 0);
  });
  var entries = Object.keys(byClient).map(function(name){ return { name: name, total: byClient[name] }; })
    .sort(function(a,b){ return b.total - a.total; });

  var el = document.getElementById('rp-client-bars');
  if (!entries.length) { el.innerHTML = '<div class="empty" style="padding:20px"><p class="empty-title">No invoice data yet</p></div>'; return; }

  var max = Math.max.apply(null, entries.map(function(e){ return e.total; }));
  el.innerHTML = entries.map(function(e) {
    var pct = max > 0 ? Math.max((e.total / max) * 100, 3) : 3;
    var color = clientColor(e.name);
    return '<div class="hbar-row">' +
      '<span class="hbar-name"><span class="legend-dot" style="background:'+color+'"></span>'+esc(shortClient(e.name))+'</span>' +
      '<div class="hbar-track"><div class="hbar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>' +
      '<span class="hbar-val">A$ '+e.total.toLocaleString('en-AU',{minimumFractionDigits:0,maximumFractionDigits:0})+'</span>' +
    '</div>';
  }).join('');
}

function loadReportsPage() {
  loadReportData().then(renderReports).catch(function(err){ toast('Failed to load reports: ' + err.message, 'err'); });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('reports');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('btn-refresh-reports').addEventListener('click', loadReportsPage);

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  loadReportsPage();
}());
