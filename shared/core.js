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
//  An account with a person_code in its metadata (CN/LM — restricted to only
//  their own assigned jobs, enforced for real via RLS, see sql/restrict-assigned-users.sql)
//  gets bounced to /my-jobs/ from every other page automatically — pass
//  { allowRestricted: true } only from my-jobs itself to opt out of that bounce.
// ════════════════════════════════════════════════
function personCodeOf(user) {
  return (user && user.user_metadata && user.user_metadata.person_code) || null;
}

async function requireAuth(opts) {
  var { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace(appRoot()); return null; }
  sb.auth.onAuthStateChange(function(event) {
    if (event === 'SIGNED_OUT') location.replace(appRoot());
  });
  if (personCodeOf(session.user) && !(opts && opts.allowRestricted)) {
    location.replace(appRoot() + 'my-jobs/');
    return null;
  }
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
var JOB_STAGES = ['Booked','In Progress','Int Checking','Ext Checking','Invoicing','Completed','Cancelled'];
// Internal staff who actually do SV Drafting work (matches the real data — sv_drafting
// is only ever CN/SL/LM, never AR/AS/MV). AR/AS/MV are client-side reviewer names, not
// LDW staff, so Checker is a free-text field instead of a fixed dropdown — see job.js/new-job.js.
var ASSIGNEE_CODES = ['','CN','SL','LM'];
function stagePill(p){ var m={'Booked':'pill-booked','In Progress':'pill-inprog','Int Checking':'pill-intcheck','Ext Checking':'pill-extcheck','Invoicing':'pill-invoicing','Completed':'pill-complete','Cancelled':'pill-cancelled'}; return '<span class="stage-pill '+(m[p]||'pill-booked')+'">'+esc(p)+'</span>'; }
function di(label, val, full){ return '<div class="detail-item'+(full?' style="grid-column:span 2"':'')+'"><label>'+label+'</label><span>'+val+'</span></div>'; }
function selF(id, label, opts, val){ return '<div class="field"><label>'+label+'</label><select id="'+id+'">'+opts.map(function(o){ return '<option'+(o===val?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'; }
function dtF(id, label, val){ return '<div class="field"><label>'+label+'</label><input type="date" id="'+id+'" value="'+(val||'')+'"></div>'; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// clients.name stores full legal names ("Arax Consulting Pty Ltd"), but jobs.client_name
// is free text and often uses a shorter form ("Arax Consulting") — an exact-string match
// only works for clients whose short/long forms happen to coincide (Dexcon). Strip the
// corporate suffix and all non-alphanumerics before comparing so both forms match.
function normalizeClientName(n) {
  return String(n||'').toLowerCase().replace(/\bpty\.?\s*ltd\.?\b/g,'').replace(/[^a-z0-9]/g,'');
}
function findClientByName(clientsList, name) {
  var target = normalizeClientName(name);
  if (!target) return null;
  return (clientsList || []).find(function(c){ return normalizeClientName(c.name) === target; }) || null;
}
