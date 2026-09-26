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

async function updatePayoutPaid(id, paid) {
  var { error } = await sb.from('engineer_payout').update({ paid }).eq('id', id);
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
  var lmUnpaidRp  = lmRows.filter(function(r){ return r.paid !== 'Paid'; }).reduce(function(s,r){ return s + (r.fee||0); }, 0);
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
      '<td style="text-align:center;font-size:10px">'+esc(r.sv_draft||'—')+'</td>' +
      '<td style="font-size:10px;color:var(--text-soft)">'+esc(r.note||'—')+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px;font-weight:600">'+((r.fee||0).toFixed(2))+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px">'+Math.round(r.conv||0).toLocaleString('id-ID')+'</td>' +
      '<td style="text-align:center"><button style="font-size:10px;font-family:DM Mono,monospace;padding:3px 8px;border-radius:3px;cursor:pointer;border:1px solid '+(isPaid?'var(--invoicing-bdr)':'var(--booked-bdr)')+';background:'+(isPaid?'var(--invoicing-bg)':'var(--booked-bg)')+';color:'+(isPaid?'var(--invoicing-txt)':'var(--booked-txt)')+'" data-person="cn" data-id="'+r.id+'">'+r.paid+'</button></td>';
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
    if (!isPaid) totalRp += r.fee || 0;
    var tr = document.createElement('tr');
    if (i % 2 === 0) tr.style.background = 'var(--surface2)';
    tr.innerHTML =
      '<td class="td-mono" style="font-weight:600">'+esc(r.job_no)+'</td>' +
      '<td class="td-mono">'+esc(r.revision||'—')+'</td>' +
      '<td style="font-size:11px">'+esc(shortClient(r.client_name||''))+'</td>' +
      '<td style="font-size:10px;color:var(--text-soft)">'+esc(r.note||'—')+'</td>' +
      '<td style="text-align:right;font-family:DM Mono,monospace;font-size:11px;font-weight:600">'+Math.round(r.fee||0).toLocaleString('id-ID')+'</td>' +
      '<td style="text-align:center"><button style="font-size:10px;font-family:DM Mono,monospace;padding:3px 8px;border-radius:3px;cursor:pointer;border:1px solid '+(isPaid?'var(--invoicing-bdr)':'var(--booked-bdr)')+';background:'+(isPaid?'var(--invoicing-bg)':'var(--booked-bg)')+';color:'+(isPaid?'var(--invoicing-txt)':'var(--booked-txt)')+'" data-person="lm" data-id="'+r.id+'">'+r.paid+'</button></td>';
    tbody.appendChild(tr);
  });
  document.getElementById('lm-total-rp').textContent  = Math.round(totalRp).toLocaleString('id-ID');
  document.getElementById('lm-unpaid-rp').textContent = 'Rp ' + Math.round(totalRp).toLocaleString('id-ID');
  document.getElementById('lm-total-jobs').textContent= lmRows.length;
}

function togglePayoutPaid(person, id) {
  var arr = person === 'cn' ? cnRows : lmRows;
  var r   = arr.find(function(x){ return x.id === id; }); if (!r) return;
  var newPaid = r.paid === 'Paid' ? 'Nope' : 'Paid';
  updatePayoutPaid(id, newPaid).then(function() {
    r.paid = newPaid;
    toast((newPaid === 'Paid' ? 'Marked Paid' : 'Marked Unpaid'), 'ok');
    renderPayout();
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); });
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
    cnRows.forEach(function(r){ r.conv = Math.round((r.fee||0) * rate); });
    renderCN();
  });
  document.getElementById('page-payout').addEventListener('click', function(e){
    var btn = e.target.closest('[data-person]');
    if (btn) togglePayoutPaid(btn.getAttribute('data-person'), parseInt(btn.getAttribute('data-id')));
  });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadPayoutPage();
}());
