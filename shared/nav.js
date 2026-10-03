// ════════════════════════════════════════════════
//  SIDEBAR / NAV (built once here and injected into every page's #sidebar +
//  #mobile-topbar placeholders, so the markup only has one source of truth)
// ════════════════════════════════════════════════
var NAV_ITEMS = [
  { key: 'board',    label: 'Job Board',  href: 'board/',    section: 'Jobs',    badge: 'nb-board' },
  { key: 'newjob',   label: 'New Job',    href: 'new-job/',  section: null },
  { key: 'byeng',    label: 'By Engineer',href: 'my-jobs/',  section: null },
  { key: 'vault',    label: 'Job Vault',  href: 'job-vault/',section: null },
  { key: 'invoicing',label: 'Invoicing',  href: 'invoicing/',section: 'Finance', badge: 'nb-inv' },
  { key: 'reports',  label: 'Reports',    href: 'reports/',  section: 'Admin' },
  { key: 'payout',   label: 'Payout',     href: 'payout/',   section: 'Admin' },
  { key: 'clients',  label: 'Clients',    href: 'clients/',  section: null }
];

// Pass { restricted: true } only from /my-jobs/ — a CN/LM account only ever
// gets this one nav item instead of the full list, matching what requireAuth()
// already bounces them to everywhere else.
function initNav(activeKey, opts) {
  var restricted = !!(opts && opts.restricted);
  var root = appRoot();

  document.getElementById('mobile-topbar').innerHTML =
    '<button class="hamburger-btn" id="hamburger-btn" aria-label="Open menu">&#9776;</button>' +
    '<span class="mobile-topbar-title">Lionghardy <span class="brand-accent">DesignWorks</span></span>';

  var currentTheme = document.documentElement.getAttribute('data-theme') === 'p4' ? 'p4' : 'p3';
  var navHtml = '<div class="brand"><span class="brand-eye">LDW Engineering</span><span class="brand-name">Lionghardy<br><span class="brand-accent">DesignWorks</span></span></div><div class="nav">';
  if (restricted) {
    navHtml += '<a class="nav-item active" href="' + root + 'my-jobs/">My Jobs</a>';
  } else {
    var lastSection = null;
    NAV_ITEMS.forEach(function(item) {
      if (item.section && item.section !== lastSection) {
        navHtml += '<div class="nav-section">' + esc(item.section) + '</div>';
        lastSection = item.section;
      }
      navHtml += '<a class="nav-item' + (item.key === activeKey ? ' active' : '') + '" href="' + root + item.href + '">' +
        esc(item.label) + (item.badge ? ' <span class="nav-badge" id="' + item.badge + '">—</span>' : '') + '</a>';
    });
  }
  navHtml +=
    '</div>' +
    '<div class="theme-toggle" id="theme-btn"><span id="theme-emoji" style="font-size:16px">' + (currentTheme === 'p3' ? '🌙' : '📺') + '</span><span id="theme-label">' + (currentTheme === 'p3' ? 'P3 / Dark' : 'P4 / Light') + '</span></div>' +
    '<div class="user-info"><div class="user-name" id="user-name">—</div><div class="user-email" id="user-email">—</div><button class="signout-btn" id="signout-btn">Sign out</button></div>' +
    '<div class="sidebar-foot" id="foot-status">—</div>';
  document.getElementById('sidebar').innerHTML = navHtml;

  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('signout-btn').addEventListener('click', signOut);
  document.getElementById('hamburger-btn').addEventListener('click', toggleMobileSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileSidebar);
}

function renderUserInfo(user) {
  document.getElementById('user-name').textContent  = (user.user_metadata && user.user_metadata.full_name) || user.email;
  document.getElementById('user-email').textContent = user.email;
}

function setFootStatus(msg) {
  var el = document.getElementById('foot-status'); if (el) el.textContent = msg;
}

function setNavBadge(id, val) {
  var el = document.getElementById(id); if (el) el.textContent = val;
}

// ════════════════════════════════════════════════
//  MOBILE SIDEBAR (hamburger drawer)
// ════════════════════════════════════════════════
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}
