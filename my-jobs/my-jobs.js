// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var allJobs = [];
var isRestricted = false;   // true for a CN/LM-mapped login
var myPersonCode = null;    // that login's own code, if restricted
var viewingCode = null;     // the code an admin has picked in the selector

// ════════════════════════════════════════════════
//  DATA
//  No client-side filtering for a restricted account — RLS
//  (sql/restrict-assigned-users.sql) already limits what its session can
//  even see. An admin's session sees every job, so viewingCode filters
//  client-side purely as a convenience lens, not a security boundary.
// ════════════════════════════════════════════════
async function loadAllJobs() {
  var { data, error } = await sb.from('jobs').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  allJobs = data || [];
  return allJobs;
}

async function updateJobProgress(id, job_progress) {
  var { error } = await sb.from('jobs').update({ job_progress: job_progress }).eq('id', id);
  if (error) throw error;
}

function jobsForCode(code) {
  return allJobs.filter(function(j) {
    return j.eng === code || j.drafter === code || j.sv_drafting === code || j.checker === code;
  });
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function loadMyJobsPage() {
  document.getElementById('myjobs-sub').textContent = 'Loading…';
  loadAllJobs().then(renderMyJobs).catch(function(err){ toast('Failed to load: ' + err.message, 'err'); });
}

function renderMyJobs() {
  var jobs = isRestricted ? allJobs : (viewingCode ? jobsForCode(viewingCode) : []);
  var container = document.getElementById('myjobs-groups');
  container.innerHTML = '';

  if (!isRestricted && !viewingCode) {
    document.getElementById('myjobs-sub').textContent = 'Pick an engineer above';
    container.innerHTML = '<div class="empty"><span class="empty-ico">&#128101;</span><p class="empty-title">Pick an engineer to view their jobs</p></div>';
    return;
  }

  document.getElementById('myjobs-sub').textContent = jobs.length + ' job' + (jobs.length === 1 ? '' : 's') + (isRestricted ? ' assigned to you' : ' assigned to ' + viewingCode);

  if (!jobs.length) {
    container.innerHTML = '<div class="empty"><span class="empty-ico">&#10003;</span><p class="empty-title">No jobs assigned</p></div>';
    return;
  }

  var today = new Date(); today.setHours(0,0,0,0);
  JOB_STAGES.forEach(function(stage) {
    var stageJobs = jobs.filter(function(j){ return j.job_progress === stage; });
    if (!stageJobs.length) return;
    var collapsedByDefault = (stage === 'Completed' || stage === 'Cancelled');
    container.appendChild(buildStageGroup(stage, stageJobs, collapsedByDefault, today));
  });
}

function buildStageGroup(stage, jobs, collapsed, today) {
  var wrap = document.createElement('div'); wrap.className = 'stage-group';

  var head = document.createElement('div'); head.className = 'stage-group-head';
  var chevron = document.createElement('span'); chevron.className = 'chevron'; chevron.textContent = '▾';
  var title = document.createElement('span'); title.className = 'stage-group-title'; title.textContent = stage;
  var count = document.createElement('span'); count.className = 'kanban-count'; count.textContent = jobs.length;
  head.appendChild(chevron); head.appendChild(title); head.appendChild(count);

  var body = document.createElement('div'); body.className = 'stage-group-body';

  var tw = document.createElement('div'); tw.className = 'table-wrap';
  var table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Job No</th><th>Rev</th><th>Client</th><th>Address</th><th>Job Type</th><th>Due</th><th>Progress</th></tr></thead>';
  var tbody = document.createElement('tbody');
  jobs.forEach(function(job){ tbody.appendChild(buildJobRow(job, today)); });
  table.appendChild(tbody);
  tw.appendChild(table);
  body.appendChild(tw);

  wrap.appendChild(head); wrap.appendChild(body);
  makeCollapsible(head, body, !collapsed);
  return wrap;
}

function buildJobRow(job, today) {
  var due     = job.due_date ? new Date(job.due_date) : null;
  var overdue = due && due < today && job.job_progress !== 'Completed' && job.job_progress !== 'Cancelled';
  var dueStr  = due ? due.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';

  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td class="td-mono" style="font-weight:700"><a href="../job/?id='+job.id+'" style="color:inherit;text-decoration:none">'+esc(job.job_no)+'</a></td>' +
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

  return tr;
}

function handleProgressChange(job, selEl) {
  var newValue = selEl.value;
  var prevValue = job.job_progress;
  selEl.disabled = true;
  updateJobProgress(job.id, newValue).then(function() {
    job.job_progress = newValue;
    toast(job.job_no + ' updated to ' + newValue, 'ok');
    renderMyJobs(); // re-render so the row moves into its new stage group
  }).catch(function(err) {
    selEl.disabled = false;
    selEl.value = prevValue;
    toast('Error: ' + err.message, 'err');
  });
}

// ════════════════════════════════════════════════
//  ADMIN ENGINEER SELECTOR
// ════════════════════════════════════════════════
function initEngineerToggle() {
  var btns = document.querySelectorAll('#myjobs-engineer-toggle .vt-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      viewingCode = btn.getAttribute('data-code');
      renderMyJobs();
    });
  });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  // Need to know up front whether this is a restricted login so the sidebar
  // renders the right nav mode — requireAuth() itself runs after, for the
  // actual session check / redirect guard.
  var { data: { session } } = await sb.auth.getSession();
  var restrictedGuess = !!(session && personCodeOf(session.user));
  initNav('myjobs', { restricted: restrictedGuess });

  var user = await requireAuth({ allowRestricted: true });
  if (!user) return;
  renderUserInfo(user);

  myPersonCode = personCodeOf(user);
  isRestricted = !!myPersonCode;

  if (isRestricted) {
    document.getElementById('myjobs-title').innerHTML = 'My <span>Jobs</span>';
  } else {
    document.getElementById('myjobs-title').innerHTML = 'Jobs <span>By Engineer</span>';
    document.getElementById('myjobs-admin-toolbar').style.display = 'flex';
    initEngineerToggle();
  }

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  loadMyJobsPage();
}());
