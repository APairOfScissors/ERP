var clients = [];
var selectedFiles = []; // File objects queued to upload to OneDrive on booking

async function insertJob(data) {
  var { error } = await sb.from('jobs').insert(data);
  if (error) throw error;
}

// ════════════════════════════════════════════════
//  FILE DROPZONE
// ════════════════════════════════════════════════
function addFiles(fileList) {
  Array.prototype.forEach.call(fileList, function(f) { selectedFiles.push(f); });
  renderFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  var el = document.getElementById('nj-file-list');
  el.innerHTML = '';
  selectedFiles.forEach(function(f, i) {
    var chip = document.createElement('span'); chip.className = 'file-chip';
    var label = document.createElement('span'); label.textContent = f.name + ' (' + Math.round(f.size/1024) + ' KB)';
    var rm = document.createElement('button'); rm.innerHTML = '&#x2715;'; rm.type = 'button';
    rm.addEventListener('click', function(){ removeFile(i); });
    chip.appendChild(label); chip.appendChild(rm);
    el.appendChild(chip);
  });
}

function initDropzone() {
  var zone  = document.getElementById('nj-dropzone');
  var input = document.getElementById('nj-files');
  zone.addEventListener('click', function(){ input.click(); });
  input.addEventListener('change', function(){ addFiles(input.files); input.value = ''; });
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function(){ zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e){
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
}

function initNewJob(list) {
  clients = list;
  document.getElementById('nj-bookdate').value = new Date().toISOString().slice(0,10);
  var sel = document.getElementById('nj-client');
  sel.innerHTML = '<option value="">— Select client —</option>';
  clients.forEach(function(c) {
    var o = document.createElement('option');
    o.value = c.name; o.textContent = c.name;
    sel.appendChild(o);
  });
}

function submitNewJob() {
  var jobno   = document.getElementById('nj-jobno').value.trim();
  var rev     = document.getElementById('nj-rev').value.trim();
  var client  = document.getElementById('nj-client').value;
  var address = document.getElementById('nj-address').value.trim();
  var jobtype = document.getElementById('nj-jobtype').value.trim();
  if (!jobno)   { toast('Job No required','err'); return; }
  if (!rev)     { toast('Revision required','err'); return; }
  if (!client)  { toast('Select a client','err'); return; }
  if (!address) { toast('Address required','err'); return; }
  if (!jobtype) { toast('Job Type required','err'); return; }

  var btn = document.getElementById('nj-submit');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Booking…';

  var bookDate = document.getElementById('nj-bookdate').value || new Date().toISOString().slice(0,10);
  var clientObj = clients.find(function(c){ return c.name === client; });

  insertJob({
    booking_date:           bookDate,
    job_no:                 jobno,
    revision:               rev,
    client_name:            client,
    address:                address,
    eng:                    document.getElementById('nj-eng').value,
    drafter:                document.getElementById('nj-drafter').value,
    sv_drafting:            document.getElementById('nj-sv').value,
    checker:                document.getElementById('nj-checker').value,
    due_date:               document.getElementById('nj-duedate').value || null,
    internal_submission_date: document.getElementById('nj-intdate').value || null,
    job_type:               jobtype,
    job_status:             document.getElementById('nj-jobstatus').value,
    job_progress:           'Booked'
  }).then(function() {
    btn.disabled = false; btn.innerHTML = 'Book Job';
    toast('Job ' + jobno + ' booked!', 'ok');
    // Full reset — otherwise the next job booked right after silently
    // inherits the previous job's assignees/dates/status.
    ['nj-jobno','nj-rev','nj-address','nj-jobtype','nj-checker','nj-duedate','nj-intdate'].forEach(function(id){ document.getElementById(id).value = ''; });
    ['nj-client','nj-eng','nj-drafter','nj-sv','nj-jobstatus'].forEach(function(id){
      var el = document.getElementById(id);
      el.value = '';
      el.dispatchEvent(new Event('change'));
    });

    // Booking is confirmed immediately — folder creation (and any queued file
    // uploads) runs after, in the background, and just toasts its own
    // success/failure without blocking or reversing the booking.
    createOneDriveFoldersInBackground(clientObj, jobno, rev, address, bookDate, selectedFiles);
    selectedFiles = [];
    renderFileList();
  }).catch(function(err) {
    btn.disabled = false; btn.innerHTML = 'Book Job';
    toast('Error: ' + err.message, 'err');
  });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('newjob');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('nj-submit').addEventListener('click', submitNewJob);
  initDropzone();

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  loadClients().then(function(list) {
    initNewJob(list);
    // Enhanced after the client <select> is actually populated, so the
    // custom dropdown's option list isn't built from an empty placeholder.
    enhanceSelectsIn(document);
  }).catch(function(err){ toast('Failed to load clients: ' + err.message, 'err'); });
}());
