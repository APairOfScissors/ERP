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

// ════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════
function renderJob(job) {
  document.getElementById('job-title').innerHTML = esc(job.job_no) + (job.revision ? ' <span>Rev ' + esc(job.revision) + '</span>' : '');
  document.getElementById('job-sub').textContent = shortClient(job.client_name || '') + ' — ' + (job.job_type || '');

  var html =
    '<div class="detail-section"><div class="detail-section-title">Job Info</div><div class="detail-grid">' +
    di('Job No', '<span class="mono">'+esc(job.job_no)+'</span>') +
    di('Revision', '<span class="mono">'+esc(job.revision||'—')+'</span>') +
    di('Client', esc(job.client_name||'')) +
    di('Job Type', esc(job.job_type||'—')) +
    di('Address', esc(job.address||'—'), true) +
    '</div></div>' +
    '<div class="detail-section"><div class="detail-section-title">Progress &amp; Status</div><div class="form-grid">' +
    '<div class="field"><label>Job Progress</label><select id="ed-progress">' +
      JOB_STAGES.map(function(s){ return '<option'+(job.job_progress===s?' selected':'')+'>'+s+'</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>Job Status</label><select id="ed-jobstatus"><option value="">— None —</option>' +
      ['Preliminary Issue','For Construction','Issued For Report','Pre Engineering','ON HOLD'].map(function(s){ return '<option'+(job.job_status===s?' selected':'')+'>'+s+'</option>'; }).join('') +
    '</select></div>' +
    '</div></div>' +
    '<div class="detail-section"><div class="detail-section-title">Assignments</div><div class="form-grid">' +
    selF('ed-eng','Engineer (E)',['','CN','SL'],job.eng||'') +
    selF('ed-drafter','Drafter (D)',['','CN','SL'],job.drafter||'') +
    selF('ed-sv','SV Drafting',['','LM'],job.sv_drafting||'') +
    selF('ed-checker','Checker',['','CN','SL','LM','AR','AS','MV'],job.checker||'') +
    '</div></div>' +
    '<div class="detail-section"><div class="detail-section-title">Dates</div><div class="form-grid">' +
    dtF('ed-intdate','Internal Due Date', job.internal_submission_date||'') +
    dtF('ed-actdate','Actual Submission', job.actual_internal_submission_date||'') +
    dtF('ed-duedate','Due Date', job.due_date||'') +
    dtF('ed-issueddate','Issued Date', job.issued_date||'') +
    '</div></div>' +
    '<hr class="div">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<a class="btn btn-ghost" href="../board/">Cancel</a>' +
      '<button class="btn btn-primary" id="job-save">Save Changes</button>' +
    '</div>';
  document.getElementById('job-body').innerHTML = html;
  document.getElementById('job-save').addEventListener('click', saveJobDetail);
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
    var client = clientsList.find(function(c){ return c.name === currentJob.client_name; });
    var folderName = client && ONEDRIVE_CLIENT_FOLDERS[client.code];
    if (!folderName) throw new Error('No OneDrive folder mapping for "' + (client ? client.name : currentJob.client_name) + '"');
    var path = jobFolderPath(folderName, currentJob.job_no, currentJob.address);
    var token = await getGraphToken();
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
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('board'); // job detail hangs off the board section
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('job-onedrive').addEventListener('click', openOneDriveFolder);

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
