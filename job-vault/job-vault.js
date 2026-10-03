// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var allJobs = [];
var completedDateMap = {}; // job.id -> 'YYYY-MM-DD', derived from job_history

// ════════════════════════════════════════════════
//  DATA
//  Unlike the Board, this page's whole point is to hold every job ever
//  booked — including every Completed/Cancelled one the Board no longer
//  shows — so the heavier full-table queries and date-range filtering live
//  here instead of slowing down the page people have open all day.
// ════════════════════════════════════════════════
async function loadAllJobs() {
  var { data, error } = await sb.from('jobs').select('*').order('booking_date', { ascending: false });
  if (error) throw error;
  allJobs = data || [];
  return allJobs;
}

// job_history only exists from when sql/job-activity-trail.sql was run, and
// only records a job_progress change when it actually happens through the
// app — so a job completed before that, or seeded directly in the database,
// simply has no completed date here. That's a real gap in the data, not a
// bug, and the UI leaves that date blank rather than guessing.
async function loadCompletedDates() {
  completedDateMap = {};
  var { data, error } = await sb.from('job_history').select('job_id,changed_at')
    .eq('field_name', 'job_progress').eq('new_value', 'Completed').order('changed_at');
  if (error) return; // admin-only table; degrade quietly if it's missing or inaccessible
  (data || []).forEach(function(row){ completedDateMap[row.job_id] = row.changed_at.slice(0,10); }); // later rows win = most recent completion
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function loadVaultPage() {
  document.getElementById('vault-sub').textContent = 'Loading…';
  Promise.all([loadAllJobs(), loadCompletedDates()]).then(function() {
    populateFilterOptions();
    renderVault();
    document.getElementById('vault-sub').textContent = allJobs.length + ' jobs total';
  }).catch(function(err){ toast('Failed to load: ' + err.message, 'err'); });
}

function populateFilterOptions() {
  var stageSel = document.getElementById('vf-stage');
  var curStage = stageSel.value;
  stageSel.innerHTML = '<option value="all">All stages</option>' +
    JOB_STAGES.map(function(s){ return '<option value="'+esc(s)+'">'+esc(s)+'</option>'; }).join('');
  stageSel.value = curStage || 'all';

  var clientSel = document.getElementById('vf-client');
  var curClient = clientSel.value;
  var names = Array.from(new Set(allJobs.map(function(j){ return j.client_name; }).filter(Boolean))).sort();
  clientSel.innerHTML = '<option value="all">All clients</option>' +
    names.map(function(n){ return '<option value="'+esc(n)+'">'+esc(shortClient(n))+'</option>'; }).join('');
  clientSel.value = curClient || 'all';
}

function renderVault() {
  var q        = (document.getElementById('vault-search').value || '').toLowerCase();
  var stage    = document.getElementById('vf-stage').value;
  var client   = document.getElementById('vf-client').value;
  var bookFrom = document.getElementById('vf-book-from').value;
  var bookTo   = document.getElementById('vf-book-to').value;
  var compFrom = document.getElementById('vf-comp-from').value;
  var compTo   = document.getElementById('vf-comp-to').value;

  var filtered = allJobs.filter(function(j) {
    if (stage !== 'all' && j.job_progress !== stage) return false;
    if (client !== 'all' && j.client_name !== client) return false;
    if (bookFrom && (!j.booking_date || j.booking_date < bookFrom)) return false;
    if (bookTo   && (!j.booking_date || j.booking_date > bookTo))   return false;
    var comp = completedDateMap[j.id];
    if (compFrom && (!comp || comp < compFrom)) return false;
    if (compTo   && (!comp || comp > compTo))   return false;
    if (q) {
      var hay = (j.job_no||'') + ' ' + (j.client_name||'') + ' ' + (j.address||'');
      if (hay.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });

  var tbody = document.getElementById('vault-body');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--text-soft)">No jobs match these filters</td></tr>'; return; }

  tbody.innerHTML = filtered.map(function(job) {
    var due = job.due_date ? new Date(job.due_date).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
    var booked = job.booking_date ? new Date(job.booking_date).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
    var comp = completedDateMap[job.id];
    var compStr = comp ? new Date(comp).toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
    return '<tr class="job-row" data-id="'+job.id+'">' +
      '<td class="td-mono" style="font-weight:700">'+esc(job.job_no)+'</td>' +
      '<td class="td-mono">'+esc(job.revision||'—')+'</td>' +
      '<td style="font-weight:500">'+esc(shortClient(job.client_name||''))+'</td>' +
      '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-mid)">'+esc(job.address||'—')+'</td>' +
      '<td style="font-size:12px">'+esc(job.job_type||'—')+'</td>' +
      '<td>'+stagePill(job.job_progress)+'</td>' +
      '<td class="td-mono" style="color:var(--text-soft)">'+booked+'</td>' +
      '<td class="td-mono" style="color:var(--text-soft)">'+compStr+'</td>' +
      '<td class="td-mono" style="color:var(--text-soft)">'+due+'</td>' +
    '</tr>';
  }).join('');
}

function clearVaultFilters() {
  document.getElementById('vault-search').value = '';
  document.getElementById('vf-stage').value = 'all';
  document.getElementById('vf-client').value = 'all';
  document.getElementById('vf-book-from').value = '';
  document.getElementById('vf-book-to').value = '';
  document.getElementById('vf-comp-from').value = '';
  document.getElementById('vf-comp-to').value = '';
  renderVault();
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('vault');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('btn-refresh-vault').addEventListener('click', loadVaultPage);
  document.getElementById('vault-search').addEventListener('input', renderVault);
  ['vf-stage','vf-client','vf-book-from','vf-book-to','vf-comp-from','vf-comp-to'].forEach(function(id){
    document.getElementById(id).addEventListener('change', renderVault);
  });
  document.getElementById('vf-clear').addEventListener('click', clearVaultFilters);
  document.getElementById('vault-body').addEventListener('click', function(e){
    var row = e.target.closest('[data-id]');
    if (row) location.href = '../job/?id=' + row.getAttribute('data-id');
  });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadVaultPage();
}());
