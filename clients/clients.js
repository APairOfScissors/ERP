// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
var clients = [];

// ════════════════════════════════════════════════
//  CLIENTS
// ════════════════════════════════════════════════
function renderClients() {
  document.getElementById('clients-sub').textContent = clients.length + ' clients';
  var g = document.getElementById('clients-grid');
  if (!clients.length) { g.innerHTML = '<div class="empty"><span class="empty-ico">&#128101;</span><p class="empty-title">No clients</p></div>'; return; }
  g.innerHTML = clients.map(function(c) {
    return '<div class="client-card" data-clientid="'+c.client_id+'">' +
      '<div class="client-code">Client '+esc(c.code)+'</div>' +
      '<div class="client-name">'+esc(c.name)+'</div>' +
      (c.email_to ? '<div class="client-email">&#9993; '+esc(c.email_to)+'</div>' : '') +
      (c.email_cc ? '<div class="client-email" style="font-size:11px">CC: '+esc(c.email_cc)+'</div>' : '') +
      (c.address  ? '<div style="font-size:11px;color:var(--text-soft);margin-top:6px">'+esc(c.address)+'</div>' : '') +
    '</div>';
  }).join('');
}

function loadClientsPage() {
  loadClients().then(function(list){ clients = list; renderClients(); }).catch(function(err){ toast('Failed to load clients: ' + err.message, 'err'); });
}

function openClientModal(clientId) {
  var c = clientId ? clients.find(function(x){ return x.client_id === clientId; }) : null;
  document.getElementById('cm-title').textContent  = c ? 'Edit Client' : 'Add Client';
  document.getElementById('cm-id').value      = c ? c.client_id : '';
  document.getElementById('cm-code').value    = c ? c.code : '';
  document.getElementById('cm-name').value    = c ? c.name : '';
  document.getElementById('cm-address').value = c ? c.address : '';
  document.getElementById('cm-emailto').value = c ? c.email_to : '';
  document.getElementById('cm-emailcc').value = c ? c.email_cc : '';
  document.getElementById('modal-client').classList.add('open');
}

function saveClient() {
  var name = document.getElementById('cm-name').value.trim();
  var id   = document.getElementById('cm-id').value.trim();
  if (!name || !id) { toast('Name and ID required', 'err'); return; }
  var data = {
    client_id: id,
    code:      document.getElementById('cm-code').value.trim(),
    name,
    address:   document.getElementById('cm-address').value.trim(),
    email_to:  document.getElementById('cm-emailto').value.trim(),
    email_cc:  document.getElementById('cm-emailcc').value.trim(),
  };
  sb.from('clients').upsert(data, { onConflict: 'client_id' }).then(function() {
    toast('Client saved', 'ok');
    closeModal('modal-client');
    loadClientsPage();
  }).catch(function(err){ toast('Error: ' + err.message, 'err'); });
}

// ════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════
(async function() {
  initNav('clients');
  var user = await requireAuth();
  if (!user) return;
  renderUserInfo(user);

  document.getElementById('btn-add-client').addEventListener('click', function(){ openClientModal(); });
  document.getElementById('clients-grid').addEventListener('click', function(e){
    var card = e.target.closest('[data-clientid]');
    if (card) openClientModal(card.getAttribute('data-clientid'));
  });
  document.getElementById('cm-close').addEventListener('click',  function(){ closeModal('modal-client'); });
  document.getElementById('cm-cancel').addEventListener('click', function(){ closeModal('modal-client'); });
  document.getElementById('cm-save').addEventListener('click',   saveClient);
  document.querySelectorAll('.modal-bg').forEach(function(bg){
    bg.addEventListener('click', function(e){ if (e.target === bg) bg.classList.remove('open'); });
  });

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  loadClientsPage();
}());
