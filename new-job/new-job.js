var clients = [];

async function insertJob(data) {
  var { error } = await sb.from('jobs').insert(data);
  if (error) throw error;
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
    ['nj-jobno','nj-rev','nj-address','nj-jobtype'].forEach(function(id){ document.getElementById(id).value = ''; });
    document.getElementById('nj-client').value = '';

    // Booking is confirmed immediately — folder creation runs after, in the background,
    // and just toasts its own success/failure without blocking or reversing the booking.
    createOneDriveFoldersInBackground(clientObj, jobno, rev, address, bookDate);
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

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  loadClients().then(initNewJob).catch(function(err){ toast('Failed to load clients: ' + err.message, 'err'); });
}());
