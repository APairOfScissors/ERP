// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var jobs = [];
var curView = 'kanban', stageFilter = 'all';
var selectMode = false;
var selectedIds = new Set();
var lastFiltered = [];

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
// Completed/Cancelled jobs are done — they live in the Job Vault instead, so
// the Board's day-to-day query only ever has to scan jobs still in motion.
async function loadJobs() {
  var { data, error } = await sb.from('jobs').select('*')
    .not('job_progress', 'in', '("Completed","Cancelled")')
    .order('booking_date', { ascending: false });
  if (error) throw error;
  jobs = data || [];
  return jobs;
}

// ════════════════════════════════════════════════
//  BOARD
// ════════════════════════════════════════════════
function loadBoard() {
  document.getElementById('board-sub').textContent = 'Loading…';
  clearSelection();
  loadJobs().then(function() {
    renderBoard(); updateBoardStats();
    document.getElementById('board-sub').textContent = jobs.length + ' active jobs';
    setNavBadge('nb-board', jobs.length);
    setFootStatus('Updated ' + new Date().toLocaleTimeString());
  }).catch(function(err){ toast('Failed to load: ' + err.message, 'err'); });
}

function updateBoardStats() {
  var today  = new Date(); today.setHours(0,0,0,0);
  var overdue= jobs.filter(function(j){ return j.due_date && new Date(j.due_date) < today; });
  document.getElementById('st-total').textContent     = jobs.length;
  document.getElementById('st-inprog').textContent    = jobs.filter(function(j){ return j.job_progress === 'In Progress'; }).length;
  document.getElementById('st-overdue').textContent   = overdue.length;
  document.getElementById('st-invoicing').textContent = jobs.filter(function(j){ return j.job_progress === 'Invoicing'; }).length;
  setNavBadge('nb-inv', jobs.filter(function(j){ return j.job_progress === 'Invoicing'; }).length);
}

// ════════════════════════════════════════════════
//  BULK SELECT
// ════════════════════════════════════════════════
function setSelectMode(on) {
  selectMode = on;
  document.getElementById('page-board').classList.toggle('select-on', on);
  document.getElementById('btn-select-mode').classList.toggle('active', on);
  if (!on) clearSelection(); else renderBoard();
}

function toggleJobSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  renderBoard();
}

function clearSelection() {
  selectedIds.clear();
  updateBulkBar();
}

function selectAllVisible(checked) {
  lastFiltered.forEach(function(j){ if (checked) selectedIds.add(j.id); else selectedIds.delete(j.id); });
  renderBoard();
}

function updateBulkBar() {
  var bar = document.getElementById('bulk-bar');
  var n = selectedIds.size;
  bar.style.display = n ? 'flex' : 'none';
  document.getElementById('bulk-count').textContent = n + ' selected';
}

function applyBulkStage() {
  var stage = document.getElementById('bulk-stage-select').value;
  var ids = Array.from(selectedIds);
  if (!ids.length) return;
  if (!confirm('Set ' + ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' to "' + stage + '"?')) return;
  var btn = document.getElementById('bulk-apply');
  btn.disabled = true;
  sb.from('jobs').update({ job_progress: stage }).in('id', ids).then(function(res) {
    btn.disabled = false;
    if (res.error) { toast('Error: ' + res.error.message, 'err'); return; }
    toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' set to "' + stage + '"', 'ok');
    loadBoard();
  });
}

function setView(v) {
  curView = v;
  document.getElementById('vt-kanban').classList.toggle('active', v === 'kanban');
  document.getElementById('vt-table').classList.toggle('active',  v === 'table');
  document.getElementById('view-kanban').style.display = v === 'kanban' ? '' : 'none';
  document.getElementById('view-table').style.display  = v === 'table'  ? '' : 'none';
  renderBoard();
}

function setStageFilter(f, el) {
  stageFilter = f;
  document.querySelectorAll('#page-board .filter-chip').forEach(function(b){ b.classList.remove('active'); });
  el.classList.add('active'); renderBoard();
}

function renderBoard() {
  var q = (document.getElementById('board-search').value || '').toLowerCase();
  var filtered = jobs.slice();
  if (stageFilter !== 'all') filtered = filtered.filter(function(j){ return j.job_progress === stageFilter; });
  if (q) filtered = filtered.filter(function(j){
    return (j.job_no||'').toLowerCase().indexOf(q) > -1 ||
           (j.client_name||'').toLowerCase().indexOf(q) > -1 ||
           (j.address||'').toLowerCase().indexOf(q) > -1;
  });
  lastFiltered = filtered;
  if (curView === 'kanban') renderKanban(filtered); else renderTable(filtered);
  updateBulkBar();
}

function renderKanban(filtered) {
  var stages = ['Booked','In Progress','Int Checking','Ext Checking','Invoicing'];
  var ids    = ['booked','inprog','intcheck','extcheck','invoicing'];
  stages.forEach(function(stage, si) {
    var col = filtered.filter(function(j){ return j.job_progress === stage; });
    document.getElementById('kc-' + ids[si]).textContent = col.length;
    var body = document.getElementById('kb-' + ids[si]);
    if (!col.length) { body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:var(--text-soft);font-family:DM Mono,monospace">— empty —</div>'; return; }
    body.innerHTML = col.map(jobCardHTML).join('');
  });
}

function jobCardHTML(job) {
  var today   = new Date(); today.setHours(0,0,0,0);
  var due     = job.due_date ? new Date(job.due_date) : null;
  var overdue = due && due < today && job.job_progress !== 'Completed';
  var dueStr  = due ? due.toLocaleDateString('en-AU',{day:'2-digit',month:'short'}) : '—';
  var persons = [[job.eng,'E'],[job.drafter,'D'],[job.sv_drafting,'SVD'],[job.checker,'C']].filter(function(p){ return p[0]; });
  var badges  = persons.map(function(p){ return '<span class="role-badge"><span class="role-tag">'+p[1]+'</span> '+esc(p[0])+'</span>'; }).join('');
  var selected = selectedIds.has(job.id);
  return '<a class="jcard'+(selectMode && selected ? ' selected' : '')+'" href="../job/?id='+job.id+'" data-id="'+job.id+'">' +
    '<span class="sel-check"><input type="checkbox" tabindex="-1"'+(selected?' checked':'')+'></span>' +
    '<div class="jcard-top"><span class="jcard-jobno">'+esc(job.job_no)+'</span>'+(job.revision?'<span class="jcard-rev">'+esc(job.revision)+'</span>':'')+'</div>'+
    '<div class="jcard-client">'+esc(shortClient(job.client_name||''))+'</div>'+
    '<div class="jcard-type">'+esc(job.job_type||'—')+'</div>'+
    '<div class="jcard-footer">'+badges+'<span class="jcard-due'+(overdue?' overdue':'')+'">'+dueStr+'</span></div>'+
  '</a>';
}

function renderTable(filtered) {
  var tbody = document.getElementById('table-body');
  if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="10" style="padding:40px;text-align:center;color:var(--text-soft)">No jobs</td></tr>'; return; }
  var today = new Date(); today.setHours(0,0,0,0);
  tbody.innerHTML = filtered.map(function(job) {
    var due     = job.due_date ? new Date(job.due_date) : null;
    var overdue = due && due < today && job.job_progress !== 'Completed';
    var dueStr  = due ? due.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
    var persons = [[job.eng,'E'],[job.drafter,'D'],[job.sv_drafting,'SVD'],[job.checker,'C']].filter(function(p){ return p[0]; });
    var badges  = persons.map(function(p){ return '<span class="role-badge"><span class="role-tag">'+p[1]+'</span> '+esc(p[0])+'</span>'; }).join('');
    var selected = selectedIds.has(job.id);
    return '<tr class="job-row'+(selectMode && selected ? ' selected' : '')+'" data-id="'+job.id+'">' +
      '<td class="sel-check"><input type="checkbox" tabindex="-1"'+(selected?' checked':'')+'></td>' +
      '<td class="td-mono" style="font-weight:700">'+esc(job.job_no)+'</td>' +
      '<td class="td-mono">'+esc(job.revision||'—')+'</td>' +
      '<td style="font-weight:500">'+esc(shortClient(job.client_name||''))+'</td>' +
      '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-mid)">'+esc(job.address||'—')+'</td>' +
      '<td style="font-size:12px">'+esc(job.job_type||'—')+'</td>' +
      '<td><div style="display:flex;gap:3px;flex-wrap:wrap">'+badges+'</div></td>' +
      '<td>'+stagePill(job.job_progress)+'</td>' +
      '<td style="font-size:11px;color:var(--text-soft);font-family:DM Mono,monospace">'+esc(job.job_status||'—')+'</td>' +
      '<td class="td-mono" style="'+(overdue?'color:var(--overdue-txt);font-weight:600':'color:var(--text-soft)')+'">'+dueStr+'</td>' +
    '</tr>';
  }).join('');
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('board');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('vt-kanban').addEventListener('click', function(){ setView('kanban'); });
  document.getElementById('vt-table').addEventListener('click',  function(){ setView('table'); });
  document.getElementById('sf-all').addEventListener('click',       function(){ setStageFilter('all',this); });
  document.getElementById('sf-booked').addEventListener('click',    function(){ setStageFilter('Booked',this); });
  document.getElementById('sf-inprog').addEventListener('click',    function(){ setStageFilter('In Progress',this); });
  document.getElementById('sf-intcheck').addEventListener('click',  function(){ setStageFilter('Int Checking',this); });
  document.getElementById('sf-extcheck').addEventListener('click',  function(){ setStageFilter('Ext Checking',this); });
  document.getElementById('sf-invoicing').addEventListener('click', function(){ setStageFilter('Invoicing',this); });
  document.getElementById('btn-refresh-board').addEventListener('click', loadBoard);
  document.getElementById('board-search').addEventListener('input', renderBoard);

  document.getElementById('view-table').addEventListener('click', function(e){
    var row = e.target.closest('[data-id]');
    if (!row) return;
    if (selectMode) { toggleJobSelection(parseInt(row.getAttribute('data-id'))); return; }
    location.href = '../job/?id=' + row.getAttribute('data-id');
  });
  document.getElementById('view-kanban').addEventListener('click', function(e){
    if (!selectMode) return;
    var card = e.target.closest('.jcard');
    if (!card) return;
    e.preventDefault();
    toggleJobSelection(parseInt(card.getAttribute('data-id')));
  });

  document.getElementById('btn-select-mode').addEventListener('click', function(){ setSelectMode(!selectMode); });
  document.getElementById('th-select-all').addEventListener('change', function(){ selectAllVisible(this.checked); });
  document.getElementById('bulk-clear').addEventListener('click', function(){ clearSelection(); renderBoard(); });
  document.getElementById('bulk-apply').addEventListener('click', applyBulkStage);
  JOB_STAGES.forEach(function(s){
    var o = document.createElement('option'); o.value = s; o.textContent = s;
    document.getElementById('bulk-stage-select').appendChild(o);
  });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadBoard();
}());
