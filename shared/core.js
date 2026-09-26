// ════════════════════════════════════════════════
//  SUPABASE CONFIG
// ════════════════════════════════════════════════
var SUPABASE_URL = 'https://idakaomdpvvrsundufbp.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkYWthb21kcHZ2cnN1bmR1ZmJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDk1OTgsImV4cCI6MjEwMzY4NTU5OH0.Wvi3tHl5u7MiSx0LUsPA-s35czYVsQGlpu0vsZhZjX8';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════════════
//  ROUTING (this app is a folder-per-page static site: /board/, /invoicing/, etc.
//  Every page except the root login sits exactly one folder deep, so each page sets
//  window.APP_ROOT to './' (root) or '../' (everywhere else) before loading this file.)
// ════════════════════════════════════════════════
function appRoot() { return window.APP_ROOT || './'; }

// ════════════════════════════════════════════════
//  AUTH GUARD
//  Every page but the root login calls this first. No session -> bounce to login.
// ════════════════════════════════════════════════
async function requireAuth() {
  var { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace(appRoot()); return null; }
  sb.auth.onAuthStateChange(function(event) {
    if (event === 'SIGNED_OUT') location.replace(appRoot());
  });
  return session.user;
}

async function signOut() {
  await sb.auth.signOut();
  location.replace(appRoot());
}

// ════════════════════════════════════════════════
//  THEME (persisted — each nav click is a real page load now, not an in-memory
//  tab switch, so the choice has to survive a reload or every page would reset to P3)
// ════════════════════════════════════════════════
function toggleTheme() {
  var isP3 = document.documentElement.getAttribute('data-theme') !== 'p4';
  var next = isP3 ? 'p4' : 'p3';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ldw-theme', next); } catch (e) {}
  applyThemeLabel(next);
}

function applyThemeLabel(theme) {
  var label = document.getElementById('theme-label'); if (label) label.textContent = theme === 'p3' ? 'P3 / Dark' : 'P4 / Light';
  var emoji = document.getElementById('theme-emoji'); if (emoji) emoji.textContent  = theme === 'p3' ? '🌙' : '📺';
}

// ════════════════════════════════════════════════
//  SHARED DATA CALLS (used by 2+ pages)
// ════════════════════════════════════════════════
async function loadClients() {
  var { data, error } = await sb.from('clients').select('*').order('client_id');
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════
function toast(msg, type) {
  var c = document.getElementById('toasts'), t = document.createElement('div');
  t.className = 'toast ' + (type||''); t.textContent = msg; c.appendChild(t);
  setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
}
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function shortClient(n){ return (n||'').replace(' Pty Ltd','').replace(' Consulting Engineers','').replace(' Engineering Group',' Group'); }
function stagePill(p){ var m={'Booked':'pill-booked','In Progress':'pill-inprog','Invoicing':'pill-invoicing','Completed':'pill-complete','Ext Checking':'pill-inprog'}; return '<span class="stage-pill '+(m[p]||'pill-booked')+'">'+esc(p)+'</span>'; }
function di(label, val, full){ return '<div class="detail-item'+(full?' style="grid-column:span 2"':'')+'"><label>'+label+'</label><span>'+val+'</span></div>'; }
function selF(id, label, opts, val){ return '<div class="field"><label>'+label+'</label><select id="'+id+'">'+opts.map(function(o){ return '<option'+(o===val?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'; }
function dtF(id, label, val){ return '<div class="field"><label>'+label+'</label><input type="date" id="'+id+'" value="'+(val||'')+'"></div>'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
