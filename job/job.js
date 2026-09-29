// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var currentJob = null;

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadJob(id) {
  var { data, error } = await sb.from('jobs').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function saveJobUpdate(id, updates) {
  var { error } = await sb.from('jobs').update(updates).eq('id', id);
  if (error) throw error;
}

// job_history is populated by a DB trigger (sql/job-activity-trail.sql) whenever
// job_progress changes — this only ever reads it, never writes.
async function loadJobHistory(jobId) {
  var { data, error } = await sb.from('job_history').select('*').eq('job_id', jobId).order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function renderJob(job) {
  document.getElementById('job-title').innerHTML = esc(job.job_no) + (job.revision ? ' <span>Rev ' + esc(job.revision) + '</span>' : '');
  document.getElementById('job-sub').textContent = shortClient(job.client_name || '') + ' — ' + (job.job_type || '');

  var html =
    '<div class="panel"><div class="panel-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>' +
      '<h2>Job Info</h2></div><div class="panel-body"><div class="detail-grid">' +
    di('Job No', '<span class="mono">'+esc(job.job_no)+'</span>') +
    di('Revision', '<span class="mono">'+esc(job.revision||'—')+'</span>') +
    di('Client', esc(job.client_name||'')) +
    di('Job Type', esc(job.job_type||'—')) +
    di('Address', esc(job.address||'—'), true) +
    '</div></div></div>' +

    '<div class="panel"><div class="panel-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<h2>Progress &amp; Status</h2></div><div class="panel-body"><div class="form-grid">' +
    '<div class="field"><label>Job Progress</label><select id="ed-progress">' +
      JOB_STAGES.map(function(s){ return '<option'+(job.job_progress===s?' selected':'')+'>'+s+'</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>Job Status</label><select id="ed-jobstatus"><option value="">— None —</option>' +
      ['Preliminary Issue','For Construction','Issued For Report','Pre Engineering','ON HOLD'].map(function(s){ return '<option'+(job.job_status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
    '</select></div>' +
    '</div></div></div>' +

    '<div class="panel"><div class="panel-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.4 6.5-6.4s6.5 2.8 6.5 6.4"/><circle cx="18" cy="8" r="2.4"/><path d="M15.8 13.8c2.6.3 4.7 2.6 4.7 5.4"/></svg>' +
      '<h2>Assignments</h2></div><div class="panel-body"><div class="form-grid">' +
    selF('ed-eng','Engineer (E)',['','CN','SL'],job.eng||'') +
    selF('ed-drafter','Drafter (D)',['','CN','SL'],job.drafter||'') +
    selF('ed-sv','SV Drafting',ASSIGNEE_CODES,job.sv_drafting||'') +
    '<div class="field"><label>Checker</label><input type="text" id="ed-checker" value="'+esc(job.checker||'')+'" placeholder="Client-side reviewer name"></div>' +
    '</div></div></div>' +

    '<div class="panel"><div class="panel-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>' +
      '<h2>Dates</h2></div><div class="panel-body"><div class="form-grid">' +
    dtF('ed-intdate','Internal Due Date', job.internal_submission_date||'') +
    dtF('ed-actdate','Actual Submission', job.actual_internal_submission_date||'') +
    dtF('ed-duedate','Due Date', job.due_date||'') +
    dtF('ed-issueddate','Issued Date', job.issued_date||'') +
    '</div></div></div>' +

    '<div class="panel"><div class="panel-head" id="job-history-head" style="cursor:pointer">' +
      '<span class="chevron" style="display:inline-block;font-size:11px;color:var(--text-soft)">&#9662;</span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>' +
      '<h2>History</h2></div><div class="panel-body" id="job-history-body">' +
      '<div id="job-history-list" style="font-size:12px;color:var(--text-soft)">Loading…</div>' +
    '</div></div>' +

    '<hr class="div">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<a class="btn btn-ghost" href="../board/">Cancel</a>' +
      '<button class="btn btn-primary" id="job-save">Save Changes</button>' +
    '</div>';
  document.getElementById('job-body').innerHTML = html;
  document.getElementById('job-save').addEventListener('click', saveJobDetail);
  document.getElementById('job-upload-section').style.display = 'block';

  enhanceSelectsIn(document.getElementById('job-body'));
  makeCollapsible(document.getElementById('job-history-head'), document.getElementById('job-history-body'), false);

  loadJobHistory(job.id).then(renderJobHistory).catch(function(err) {
    document.getElementById('job-history-list').textContent = 'Could not load history: ' + err.message;
  });
}

function renderJobHistory(entries) {
  var el = document.getElementById('job-history-list');
  if (!entries.length) { el.textContent = 'No changes recorded yet.'; return; }
  el.innerHTML = entries.map(function(h) {
    var when = new Date(h.changed_at).toLocaleString('en-AU', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    return '<div style="padding:8px 0;border-bottom:1px solid var(--rule)">' +
      '<span class="mono">'+esc(h.old_value||'—')+'</span> &rarr; <span class="mono" style="color:var(--accent)">'+esc(h.new_value||'—')+'</span>' +
      '<div style="font-size:11px;color:var(--text-soft);margin-top:2px">'+esc(h.changed_by_email||'Unknown')+' · '+when+'</div>' +
    '</div>';
  }).join('');
}

function renderJobNotFound() {
  document.getElementById('job-title').textContent = 'Job Not Found';
  document.getElementById('job-sub').textContent = '';
  document.getElementById('job-body').innerHTML =
    '<div class="empty"><span class="empty-ico">&#10060;</span><p class="empty-title">Couldn’t find that job</p></div>';
}

function saveJobDetail() {
  if (!currentJob) return;
  var btn = document.getElementById('job-save');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Saving…';
  var updates = {
    job_progress:                    document.getElementById('ed-progress').value,
    job_status:                      document.getElementById('ed-jobstatus').value,
    eng:                             document.getElementById('ed-eng').value,
    drafter:                         document.getElementById('ed-drafter').value,
    sv_drafting:                     document.getElementById('ed-sv').value,
    checker:                         document.getElementById('ed-checker').value,
    internal_submission_date:        document.getElementById('ed-intdate').value || null,
    actual_internal_submission_date: document.getElementById('ed-actdate').value || null,
    due_date:                        document.getElementById('ed-duedate').value || null,
    issued_date:                     document.getElementById('ed-issueddate').value || null,
  };
  saveJobUpdate(currentJob.id, updates).then(function() {
    btn.disabled = false; btn.innerHTML = 'Save Changes';
    Object.assign(currentJob, updates);
    toast('Job saved', 'ok');
  }).catch(function(err) {
    btn.disabled = false; btn.innerHTML = 'Save Changes';
    toast('Error: ' + err.message, 'err');
  });
}

// ════════════════════════════════════════════════
//  OPEN IN ONEDRIVE
// ════════════════════════════════════════════════
async function openOneDriveFolder() {
  if (!currentJob) { toast('No job loaded', 'err'); return; }

  // Open the tab synchronously, before any await, so browsers don't treat the
  // eventual navigation as an unrequested popup and block it.
  var win = window.open('', '_blank');
  var btn = document.getElementById('job-onedrive');
  var origLabel = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Opening…';
  try {
    var clientsList = await loadClients();
    var client = findClientByName(clientsList, currentJob.client_name);
    if (!client || !client.code) throw new Error('No client code found for "' + currentJob.client_name + '"');
    var token = await getGraphToken();
    var path = await resolveJobFolderPath(token, client.code, client.name, currentJob.job_no, currentJob.address);
    var url = await getFolderWebUrl(token, path);
    if (win) win.location.href = url; else window.open(url, '_blank');
  } catch (err) {
    if (win) win.close();
    toast('Could not open OneDrive: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = origLabel;
  }
}

// ════════════════════════════════════════════════
//  ADD FILES TO ONEDRIVE (auto-creates the job's folder tree if it doesn't
//  exist yet — the point being backlog jobs like 26-1021, booked before this
//  integration existed, get their folder created the first time anyone drops
//  a file on them here rather than needing a separate backfill step)
// ════════════════════════════════════════════════
function addUploadedChip(filename) {
  var el = document.getElementById('job-file-list');
  var chip = document.createElement('span'); chip.className = 'file-chip';
  chip.textContent = '✓ ' + filename;
  el.appendChild(chip);
}

async function handleJobFiles(fileList) {
  if (!currentJob) { toast('No job loaded', 'err'); return; }
  var files = Array.prototype.slice.call(fileList);
  if (!files.length) return;

  var zone = document.getElementById('job-dropzone');
  zone.style.pointerEvents = 'none'; zone.style.opacity = '0.6';
  try {
    var clientsList = await loadClients();
    var client = findClientByName(clientsList, currentJob.client_name);
    if (!client || !client.code) throw new Error('No client code found for "' + currentJob.client_name + '"');

    toast('Preparing OneDrive folder…', 'ok');
    var token = await getGraphToken();
    var todayStr = new Date().toISOString().slice(0,10);
    var paths = await createJobFolders(token, client.code, client.name, currentJob.job_no, currentJob.address, todayStr);
    await createInvoiceFolder(token, client.code, client.name, currentJob.job_no, currentJob.revision);
    await uploadFilesToOneDrive(token, paths.jobPath + '/01. Architecture/a. Working Docs', files);
    files.forEach(function(f){ addUploadedChip(f.name); });
    toast('Uploaded ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' to OneDrive', 'ok');
  } catch (err) {
    toast('OneDrive upload failed: ' + err.message, 'err');
  } finally {
    zone.style.pointerEvents = ''; zone.style.opacity = '';
  }
}

function initJobDropzone() {
  var zone  = document.getElementById('job-dropzone');
  var input = document.getElementById('job-files');
  zone.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){ handleJobFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function(){ zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e){
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) handleJobFiles(e.dataTransfer.files);
  });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('board'); // job detail hangs off the board section
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('job-onedrive').addEventListener('click', openOneDriveFolder);
  initJobDropzone();

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  var id = new URLSearchParams(location.search).get('id');
  if (!id) { renderJobNotFound(); return; }
  try {
    currentJob = await loadJob(id);
    renderJob(currentJob);
  } catch (err) {
    renderJobNotFound();
  }
}());
