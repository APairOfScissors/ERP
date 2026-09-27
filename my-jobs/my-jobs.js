// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var myJobs = [];

// ════════════════════════════════════════════════
//  DATA
//  No client-side filtering here — RLS (sql/restrict-assigned-users.sql)
//  already limits what a restricted account's session can even see, so this
//  is the same "get everything" query the Job Board uses, just narrower
//  results for a CN/LM-mapped account.
// ════════════════════════════════════════════════
async function loadMyJobs() {
  var { data, error } = await sb.from('jobs').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  myJobs = data || [];
  return myJobs;
}

async function updateJobProgress(id, job_progress) {
  var { error } = await sb.from('jobs').update({ job_progress: job_progress }).eq('id', id);
  if (error) throw error;
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function loadMyJobsPage() {
  document.getElementById('myjobs-sub').textContent = 'Loading…';
  loadMyJobs().then(renderMyJobs).catch(function(err){ toast('Failed to load: ' + err.message, 'err'); });
}

function renderMyJobs() {
  document.getElementById('myjobs-sub').textContent = myJobs.length + ' job' + (myJobs.length === 1 ? '' : 's') + ' assigned to you';
  var tbody = document.getElementById('myjobs-tbody');
  if (!myJobs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--text-soft)">No jobs assigned to you</td></tr>';
    return;
  }
  var today = new Date(); today.setHours(0,0,0,0);
  tbody.innerHTML = '';
  myJobs.forEach(function(job) {
    var due     = job.due_date ? new Date(job.due_date) : null;
    var overdue = due && due < today && job.job_progress !== 'Completed' && job.job_progress !== 'Cancelled';
    var dueStr  = due ? due.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="td-mono" style="font-weight:700">'+esc(job.job_no)+'</td>' +
      '<td class="td-mono">'+esc(job.revision||'—')+'</td>' +
      '<td style="font-weight:500">'+esc(shortClient(job.client_name||''))+'</td>' +
      '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-mid)">'+esc(job.address||'—')+'</td>' +
      '<td style="font-size:12px">'+esc(job.job_type||'—')+'</td>' +
      '<td class="td-mono" style="'+(overdue?'color:var(--overdue-txt);font-weight:600':'color:var(--text-soft)')+'">'+dueStr+'</td>' +
      '<td></td>';

    var progressCell = tr.lastElementChild;
    var sel = document.createElement('select');
    sel.style.cssText = 'padding:6px 9px;border:1px solid var(--rule);border-radius:5px;background:var(--surface2);color:var(--text);font-family:Inter,sans-serif;font-size:12.5px';
    JOB_STAGES.forEach(function(stage) {
      var o = document.createElement('option'); o.value = stage; o.textContent = stage;
      if (stage === job.job_progress) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function(){ handleProgressChange(job, sel); });
    progressCell.appendChild(sel);

    tbody.appendChild(tr);
  });
}

function handleProgressChange(job, selEl) {
  var newValue = selEl.value;
  var prevValue = job.job_progress;
  selEl.disabled = true;
  updateJobProgress(job.id, newValue).then(function() {
    job.job_progress = newValue;
    selEl.disabled = false;
    toast(job.job_no + ' updated to ' + newValue, 'ok');
  }).catch(function(err) {
    selEl.disabled = false;
    selEl.value = prevValue; // revert the dropdown since the write didn't actually go through
    toast('Error: ' + err.message, 'err');
  });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('myjobs', { restricted: true });
  var user = await requireAuth({ allowRestricted: true });
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  loadMyJobsPage();
}());
