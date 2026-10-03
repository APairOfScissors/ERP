// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var allRows = [];     // every engineer_payout row, tagged .person
var jobsLite = [];    // job_no/revision -> eng/drafter/sv_drafting, for the E/D/SV columns
var personFilter = 'all'; // 'all' | 'CN' | 'LM'

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadPayoutData() {
  var [payoutRes, jobsRes] = await Promise.all([
    sb.from('engineer_payout').select('*').order('id'),
    sb.from('jobs').select('job_no,revision,eng,drafter,sv_drafting')
  ]);
  if (payoutRes.error) throw payoutRes.error;
  if (jobsRes.error) throw jobsRes.error;
  allRows  = payoutRes.data || [];
  jobsLite = jobsRes.data || [];
}

async function updatePayoutRow(id, patch) {
  var { error } = await sb.from('engineer_payout').update(patch).eq('id', id);
  if (error) throw error;
}

// Which of this row's person's roles on the job it's actually paying for —
// a payout row only ever says "CN" or "LM", not which hat they wore, so this
// cross-references the job itself to show it at a glance instead of needing
// to go open the job to check.
function jobRoleFlags(row) {
  var j = jobsLite.find(function(x){ return x.job_no === row.job_no && (x.revision||'') === (row.revision||''); });
  if (!j) return { eng: false, drafter: false, sv: false };
  return { eng: j.eng === row.person, drafter: j.drafter === row.person, sv: j.sv_drafting === row.person };
}

// ════════════════════════════════════════════════
//  PAYOUT
// ════════════════════════════════════════════════
function loadPayoutPage() {
  loadPayoutData().then(function(){ renderPayout(); }).catch(function(err){ toast('Failed: ' + err.message, 'err'); });
}

function renderPayout() {
  var rows = personFilter === 'all' ? allRows : allRows.filter(function(r){ return r.person === personFilter; });
  var unpaid = rows.filter(function(r){ return r.paid !== 'Paid'; }).sort(function(a,b){ return (a.job_no||'').localeCompare(b.job_no||''); });
  var paid   = rows.filter(function(r){ return r.paid === 'Paid'; }).sort(function(a,b){ return (a.job_no||'').localeCompare(b.job_no||''); });

  renderRows('payout-unpaid-body', unpaid);
  renderRows('payout-paid-body', paid);
  document.getElementById('payout-paid-count').textContent = '(' + paid.length + ')';

  var cnUnpaidAud = allRows.filter(function(r){ return r.person === 'CN' && r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.fee||0); }, 0);
  var cnUnpaidRp  = allRows.filter(function(r){ return r.person === 'CN' && r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.conv||0); }, 0);
  var lmUnpaidRp  = allRows.filter(function(r){ return r.person === 'LM' && r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.conv||0); }, 0);
  document.getElementById('cn-unpaid-aud').textContent = 'A$ ' + cnUnpaidAud.toFixed(2);
  document.getElementById('cn-unpaid-rp').textContent  = 'Rp ' + Math.round(cnUnpaidRp).toLocaleString('id-ID');
  document.getElementById('lm-unpaid-rp').textContent  = 'Rp ' + Math.round(lmUnpaidRp).toLocaleString('id-ID');
  document.getElementById('lm-total-jobs').textContent = allRows.filter(function(r){ return r.person === 'LM'; }).length;
}

function roleCell(flag) {
  return flag ? '<span style="color:var(--invoicing-txt);font-weight:600">Yes</span>' : '<span style="color:var(--text-soft)">No</span>';
}

function renderRows(tbodyId, rows) {
  var tbody = document.getElementById(tbodyId); tbody.innerHTML = '';
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--text-soft);font-size:12px">— none —</td></tr>'; return; }
  rows.forEach(function(r, i) {
    var isPaid = r.paid === 'Paid';
    var roles  = jobRoleFlags(r);
    var amountHtml = r.person === 'CN'
      ? '<div style="font-family:DM Mono,monospace;font-size:11px;font-weight:600">A$ '+((r.fee||0).toFixed(2))+'</div><div style="font-family:DM Mono,monospace;font-size:10px;color:var(--text-soft)">Rp '+Math.round(r.conv||0).toLocaleString('id-ID')+'</div>'
      : '<div style="font-family:DM Mono,monospace;font-size:11px;font-weight:600">Rp '+Math.round(r.conv||0).toLocaleString('id-ID')+'</div>';
    var tr = document.createElement('tr');
    if (i % 2 === 0) tr.style.background = 'var(--surface2)';
    tr.innerHTML =
      '<td class="td-mono" style="font-weight:600">'+esc(r.job_no)+'</td>' +
      '<td class="td-mono">'+esc(r.revision||'—')+'</td>' +
      '<td style="font-size:11px">'+esc(shortClient(r.client_name||''))+' <span style="color:var(--text-soft);font-size:10px">'+esc(r.person)+'</span></td>' +
      '<td style="text-align:center;font-size:11px">'+roleCell(roles.eng)+'</td>' +
      '<td style="text-align:center;font-size:11px">'+roleCell(roles.drafter)+'</td>' +
      '<td style="text-align:center;font-size:11px">'+roleCell(roles.sv)+'</td>' +
      '<td class="hide-mobile" style="font-size:10px;color:var(--text-soft)">'+esc(r.note||'—')+'</td>' +
      '<td style="text-align:right">'+amountHtml+'</td>' +
      '<td style="text-align:center"><button class="paid-toggle-btn" style="border-color:'+(isPaid?'var(--invoicing-bdr)':'var(--booked-bdr)')+';background:'+(isPaid?'var(--invoicing-bg)':'var(--booked-bg)')+';color:'+(isPaid?'var(--invoicing-txt)':'var(--booked-txt)')+'" data-id="'+r.id+'">'+esc(r.paid)+'</button></td>';
    tbody.appendChild(tr);
  });
}

// ════════════════════════════════════════════════
//  PAYOUT AMOUNT MODAL
//  Clicking a row's Paid/Nope button opens this instead of toggling
//  directly — Steven fills in (or corrects) the actual amount right
//  there, since the app has no other UI for setting fee/conv and it
//  previously had to be edited straight in Supabase.
// ════════════════════════════════════════════════
var editingRow = null;

function openPayoutAmountModal(id) {
  var r = allRows.find(function(x){ return x.id === id; }); if (!r) return;
  editingRow = r;

  var targetPaid = r.paid === 'Paid' ? 'Nope' : 'Paid';
  document.getElementById('pm-title').textContent = r.job_no + ' — ' + r.person;
  document.getElementById('pm-save').textContent  = 'Save & Mark ' + (targetPaid === 'Paid' ? 'Paid' : 'Unpaid');
  document.getElementById('pm-fee-field').style.display = r.person === 'CN' ? '' : 'none';
  document.getElementById('pm-fee').value = r.fee != null ? r.fee : '';
  document.getElementById('pm-rp').value  = r.conv != null ? r.conv : '';
  document.getElementById('modal-payout-amt').classList.add('open');
}

function savePayoutAmount() {
  if (!editingRow) return;
  var r = editingRow;
  var newPaid = r.paid === 'Paid' ? 'Nope' : 'Paid';
  var patch = { paid: newPaid, conv: parseFloat(document.getElementById('pm-rp').value) || 0 };
  if (r.person === 'CN') patch.fee = parseFloat(document.getElementById('pm-fee').value) || 0;

  var btn = document.getElementById('pm-save');
  btn.disabled = true;
  updatePayoutRow(r.id, patch).then(function() {
    Object.assign(r, patch);
    closeModal('modal-payout-amt');
    toast((newPaid === 'Paid' ? 'Marked Paid' : 'Marked Unpaid'), 'ok');
    renderPayout();
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); }).finally(function(){
    btn.disabled = false;
  });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('payout');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('btn-refresh-payout').addEventListener('click', loadPayoutPage);
  document.getElementById('cn-rate').addEventListener('change', function(){
    var rate = parseFloat(this.value) || 0;
    // Only unpaid rows — a row already marked Paid has a real, saved amount
    // that shouldn't be silently guessed at from whatever rate happens to be
    // in this field right now.
    allRows.forEach(function(r){ if (r.person === 'CN' && r.paid !== 'Paid') r.conv = Math.round((r.fee||0) * rate); });
    renderPayout();
  });

  document.getElementById('payout-person-toggle').addEventListener('click', function(e){
    var btn = e.target.closest('.vt-btn'); if (!btn) return;
    personFilter = btn.getAttribute('data-person');
    this.querySelectorAll('.vt-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    renderPayout();
  });

  document.getElementById('page-payout').addEventListener('click', function(e){
    var btn = e.target.closest('[data-id]');
    if (btn && btn.classList.contains('paid-toggle-btn')) openPayoutAmountModal(parseInt(btn.getAttribute('data-id')));
  });
  document.getElementById('pm-close').addEventListener('click',  function(){ closeModal('modal-payout-amt'); });
  document.getElementById('pm-cancel').addEventListener('click', function(){ closeModal('modal-payout-amt'); });
  document.getElementById('pm-save').addEventListener('click',   savePayoutAmount);
  document.getElementById('modal-payout-amt').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('open'); });

  makeCollapsible(document.getElementById('payout-paid-head'), document.getElementById('payout-paid-panel-body'), false);

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadPayoutPage();
}());
