// ════════════════════════════════════════════════
//  CUSTOM SELECT (progressive enhancement)
//  Wraps a native <select> with a styled dropdown UI, but the native
//  element stays in the DOM (just visually hidden) and remains the real
//  source of truth for .value — so every existing page's read/write code
//  (getElementById(id).value, change listeners) keeps working completely
//  unchanged. Re-running this on a page whose selects get rebuilt (e.g.
//  Job Detail's innerHTML re-render) just re-wraps the fresh elements.
// ════════════════════════════════════════════════
var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>';

function enhanceSelect(selectEl) {
  if (selectEl.dataset.enhanced) return;
  selectEl.dataset.enhanced = '1';
  selectEl.style.display = 'none';

  var wrap = document.createElement('div'); wrap.className = 'rselect';
  var trigger = document.createElement('div'); trigger.className = 'rselect-trigger'; trigger.tabIndex = 0;
  var labelSpan = document.createElement('span'); labelSpan.className = 'rselect-label';
  trigger.appendChild(labelSpan);
  trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG);
  var panel = document.createElement('div'); panel.className = 'rselect-panel';
  var activeIndex = -1;

  function syncLabel() {
    var opt = selectEl.options[selectEl.selectedIndex];
    var text = opt ? opt.textContent : '';
    labelSpan.textContent = text || ' ';
    labelSpan.classList.toggle('placeholder', !selectEl.value);
  }
  function selectIndex(idx) {
    var opt = selectEl.options[idx]; if (!opt) return;
    if (selectEl.value !== opt.value) {
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncLabel();
    wrap.classList.remove('open');
    buildOptions();
  }
  function setActive(idx) {
    var rows = panel.children;
    if (!rows.length) return;
    idx = Math.max(0, Math.min(rows.length - 1, idx));
    Array.prototype.forEach.call(rows, function(row){ row.classList.remove('active'); });
    rows[idx].classList.add('active');
    rows[idx].scrollIntoView({ block: 'nearest' });
    activeIndex = idx;
  }
  function buildOptions() {
    panel.innerHTML = '';
    Array.prototype.forEach.call(selectEl.options, function(opt, idx) {
      var row = document.createElement('div'); row.className = 'ropt' + (opt.value === selectEl.value ? ' selected' : '');
      row.textContent = opt.textContent || ' ';
      row.addEventListener('mousedown', function(e){ e.preventDefault(); }); // keeps focus (and keyboard nav) on the trigger
      row.addEventListener('click', function(e) { e.stopPropagation(); selectIndex(idx); });
      panel.appendChild(row);
    });
  }

  function openPanel() {
    document.querySelectorAll('.rselect.open').forEach(function(o){ if (o !== wrap) o.classList.remove('open'); });
    wrap.classList.add('open');
    setActive(selectEl.selectedIndex >= 0 ? selectEl.selectedIndex : 0);
  }
  function closePanel() { wrap.classList.remove('open'); }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    if (wrap.classList.contains('open')) closePanel(); else openPanel();
  });
  trigger.addEventListener('keydown', function(e) {
    var isOpen = wrap.classList.contains('open');
    if (e.key === 'ArrowDown') { e.preventDefault(); isOpen ? setActive(activeIndex + 1) : openPanel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); isOpen ? setActive(activeIndex - 1) : openPanel(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) openPanel();
      else if (activeIndex >= 0) selectIndex(activeIndex);
    }
    else if (e.key === 'Escape') { closePanel(); }
    else if (e.key === 'Tab') { closePanel(); }
  });
  // Covers Tab-away and any other focus loss the click-outside listener below doesn't catch;
  // delayed so an in-progress row click still lands first.
  trigger.addEventListener('blur', function(){ setTimeout(closePanel, 120); });

  // Keeps the custom UI in sync with the native select regardless of what
  // changed it — our own option clicks (below) dispatch this same event,
  // but so should any external code that sets .value programmatically.
  selectEl.addEventListener('change', function(){ syncLabel(); buildOptions(); });

  syncLabel(); buildOptions();
  wrap.appendChild(trigger); wrap.appendChild(panel);
  selectEl.insertAdjacentElement('afterend', wrap);
}

function enhanceSelectsIn(root) {
  (root || document).querySelectorAll('select').forEach(enhanceSelect);
}

document.addEventListener('click', function() {
  document.querySelectorAll('.rselect.open').forEach(function(o){ o.classList.remove('open'); });
});

// ════════════════════════════════════════════════
//  SMOOTH COLLAPSIBLE SECTION
//  Wraps bodyEl in the .collapsible/.collapsible-inner structure (see
//  shared/app.css) and wires headEl to toggle it, with a chevron that
//  rotates instead of swapping glyphs.
// ════════════════════════════════════════════════
function makeCollapsible(headEl, bodyEl, startExpanded) {
  var inner = document.createElement('div'); inner.className = 'collapsible-inner';
  bodyEl.classList.add('collapsible');
  while (bodyEl.firstChild) inner.appendChild(bodyEl.firstChild);
  bodyEl.appendChild(inner);
  if (startExpanded) bodyEl.classList.add('expanded');

  var chevron = headEl.querySelector('.chevron');
  if (chevron) chevron.style.transform = startExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';

  headEl.addEventListener('click', function() {
    var expanded = bodyEl.classList.toggle('expanded');
    if (chevron) chevron.style.transform = expanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  });
}
