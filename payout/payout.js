// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var cnRows = [], lmRows = [];

// ════════════════════════════════════════════════
//  DATA
// ════════════════════════════════════════════════
async function loadPayoutData() {
  var { data, error } = await sb.from('engineer_payout').select('*').order('id');
  if (error) throw error;
  cnRows = (data || []).filter(function(r){ return r.person === 'CN'; });
  lmRows = (data || []).filter(function(r){ return r.person === 'LM'; });
}

async function updatePayoutRow(id, patch) {
  var { error } = await sb.from('engineer_payout').update(patch).eq('id', id);
  if (error) throw error;
}

// ════════════════════════════════════════════════
//  PAYOUT
// ════════════════════════════════════════════════
function loadPayoutPage() {
  loadPayoutData().then(function(){ renderPayout(); }).catch(function(err){ toast('Failed: ' + err.message, 'err'); });
}

function renderPayout() {
  renderCN(); renderLM();
  var cnUnpaidAud = cnRows.filter(function(r){ return r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.fee||0); }, 0);
  var cnUnpaidRp  = cnRows.filter(function(r){ return r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.conv||0); }, 0);
  var lmUnpaidRp  = lmRows.filter(function(r){ return r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.conv||0); }, 0);
  document.getElementById('cn-unpaid-aud').textContent = 'A$ ' + cnUnpaidAud.toFixed(2);
  document.getElementById('cn-unpaid-rp').textContent  = 'Rp ' + Math.round(cnUnpaidRp).toLocaleString('id-ID');
  document.getElementById('lm-unpaid-rp').textContent  = 'Rp ' + Math.round(lmUnpaidRp).toLocaleString('id-ID');
  document.getElementById('lm-total-jobs').textContent = lmRows.length;
}

function renderCN() {
  var tbody = document.getElementById('cn-tbody'); tbody.innerHTML = '';
  var totalAud = 0, totalRp = 0;
  cnRows.forEach(function(r, i) {
    var isPaid = r.paid === 'Paid';
    if (!isPaid) { totalAud += r.fee || 0; totalRp += r.conv || 0; }
    var tr = document.createElement('tr');
    if (i % 2 === 0) tr.style.background = 'var(--surface2)';
    tr.innerHTML =
      '<td class="td-mono" style="font-weight:600">'+esc(r.job_no)+'</td>' +
      '<td class="td-mono">'+esc(r.revision||'—')+'</td>' +
      '<td style="font-size:11px">'+esc(shortClient(r.client_name||''))+'</td>' +
      '<td class="hide-mobile" style="text-align:center;font-size:10px">'+esc(r.sv_draft||'—')+'</td>' +
      '<td class="hide-mobile" style="font-size:10px;color:var(--text-soft)">'+esc(r.note||'—')+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px;font-weight:600">'+((r.fee||0).toFixed(2))+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px">'+Math.round(r.conv||0).toLocaleString('id-ID')+'</td>' +
      '<td style="text-align:center"><button class="paid-toggle-btn" style="border-color:'+(isPaid?'var(--invoicing-bdr)':'var(--booked-bdr)')+';background:'+(isPaid?'var(--invoicing-bg)':'var(--booked-bg)')+';color:'+(isPaid?'var(--invoicing-txt)':'var(--booked-txt)')+'" data-person="cn" data-id="'+r.id+'">'+esc(r.paid)+'</button></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('cn-total-aud').textContent = totalAud.toFixed(2);
  document.getElementById('cn-total-rp').textContent  = Math.round(totalRp).toLocaleString('id-ID');
  document.getElementById('cn-unpaid-aud').textContent= 'A$ ' + totalAud.toFixed(2);
  document.getElementById('cn-unpaid-rp').textContent = 'Rp ' + Math.round(totalRp).toLocaleString('id-ID');
}

function renderLM() {
  var tbody = document.getElementById('lm-tbody'); tbody.innerHTML = '';
  var totalRp = 0;
  lmRows.forEach(function(r, i) {
    var isPaid = r.paid === 'Paid';
    if (!isPaid) totalRp += r.conv || 0;
    var tr = document.createElement('tr');
    if (i % 2 === 0) tr.style.background = 'var(--surface2)';
    tr.innerHTML =
      '<td class="td-mono" style="font-weight:600">'+esc(r.job_no)+'</td>' +
      '<td class="td-mono">'+esc(r.revision||'—')+'</td>' +
      '<td style="font-size:11px">'+esc(shortClient(r.client_name||''))+'</td>' +
      '<td class="hide-mobile" style="font-size:10px;color:var(--text-soft)">'+esc(r.note||'—')+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px;font-weight:600">'+Math.round(r.conv||0).toLocaleString('id-ID')+'</td>' +
      '<td style="text-align:center"><button class="paid-toggle-btn" style="border-color:'+(isPaid?'var(--invoicing-bdr)':'var(--booked-bdr)')+';background:'+(isPaid?'var(--invoicing-bg)':'var(--booked-bg)')+';color:'+(isPaid?'var(--invoicing-txt)':'var(--booked-txt)')+'" data-person="lm" data-id="'+r.id+'">'+esc(r.paid)+'</button></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('lm-total-rp').textContent  = Math.round(totalRp).toLocaleString('id-ID');
  document.getElementById('lm-unpaid-rp').textContent = 'Rp ' + Math.round(totalRp).toLocaleString('id-ID');
  document.getElementById('lm-total-jobs').textContent= lmRows.length;
}

// ════════════════════════════════════════════════
//  PAYOUT AMOUNT MODAL
//  Clicking a row's Paid/Nope button opens this instead of toggling
//  directly — Steven fills in (or corrects) the actual amount right
//  there, since the app has no other UI for setting fee/conv and it
//  previously had to be edited straight in Supabase.
// ════════════════════════════════════════════════
var editingRow = null; // { person: 'cn'|'lm', row }

function openPayoutAmountModal(person, id) {
  var arr = person === 'cn' ? cnRows : lmRows;
  var r   = arr.find(function(x){ return x.id === id; }); if (!r) return;
  editingRow = { person: person, row: r };

  var targetPaid = r.paid === 'Paid' ? 'Nope' : 'Paid';
  document.getElementById('pm-title').textContent = r.job_no + ' — ' + (person === 'cn' ? 'CN' : 'LM');
  document.getElementById('pm-save').textContent  = 'Save & Mark ' + (targetPaid === 'Paid' ? 'Paid' : 'Unpaid');
  document.getElementById('pm-fee-field').style.display = person === 'cn' ? '' : 'none';
  document.getElementById('pm-fee').value = r.fee != null ? r.fee : '';
  document.getElementById('pm-rp').value  = r.conv != null ? r.conv : '';
  document.getElementById('modal-payout-amt').classList.add('open');
}

function savePayoutAmount() {
  if (!editingRow) return;
  var person = editingRow.person, r = editingRow.row;
  var newPaid = r.paid === 'Paid' ? 'Nope' : 'Paid';
  var patch = { paid: newPaid, conv: parseFloat(document.getElementById('pm-rp').value) || 0 };
  if (person === 'cn') patch.fee = parseFloat(document.getElementById('pm-fee').value) || 0;

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
    cnRows.forEach(function(r){ if (r.paid !== 'Paid') r.conv = Math.round((r.fee||0) * rate); });
    renderCN();
  });
  document.getElementById('page-payout').addEventListener('click', function(e){
    var btn = e.target.closest('[data-person]');
    if (btn) openPayoutAmountModal(btn.getAttribute('data-person'), parseInt(btn.getAttribute('data-id')));
  });
  document.getElementById('pm-close').addEventListener('click',  function(){ closeModal('modal-payout-amt'); });
  document.getElementById('pm-cancel').addEventListener('click', function(){ closeModal('modal-payout-amt'); });
  document.getElementById('pm-save').addEventListener('click',   savePayoutAmount);
  document.getElementById('modal-payout-amt').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('open'); });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadPayoutPage();
}());
