/*
 * topnav.js — single source of truth for the desktop top navigation.
 *
 * Every page's top menu was hand-coded with office links, so "mode" (office vs pro)
 * only ever worked on the dashboard — clicking Schedule/Timesheets/Comms elsewhere
 * dropped you back into office context. This renders ONE mode-aware top nav in place
 * of whatever .qnav a page hard-coded, so mode travels across the whole platform.
 *
 * Mode:
 *   - Pros (is_pro, not management) → pro nav, always.
 *   - Office staff → office nav.
 *   - Management → whichever mode is stored in localStorage['jct-hub-mode']
 *     (set by the Office⇄Pro toggle here and on the dashboard), default office.
 *
 * Side menus are untouched — this only owns the top row.
 * Include on every page: <script src="/topnav.js"></script>
 */
(function () {
  var I = {
    home: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
    check: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    cash: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
    cal: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    grid: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
    clock: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    chat: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    bulb: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
  };

  var OFFICE = [
    { href: '/hub.html',          label: 'Dashboard',  icon: I.home },
    { href: '/checklist.html',    label: 'Checklist',  icon: I.check },
    { href: '/cash-summary.html', label: 'Cash',       icon: I.cash },
    { href: '/schedule.html',     label: 'Schedule',   icon: I.cal },
    { href: '/timesheet.html',    label: 'Timesheets', icon: I.clock },
    { href: '/comms.html',        label: 'Comms',      icon: I.chat },
    { href: '/ideas.html',        label: 'Idea Board', icon: I.bulb },
  ];
  var PRO = [
    { href: '/hub.html',                label: 'Dashboard',    icon: I.home },
    { href: '/pro-schedule-view.html',  label: 'Pro Schedule', icon: I.cal },
    { href: '/pro-timesheet.html',      label: 'Timesheets',   icon: I.clock },
    { href: '/comms.html?audience=pro', label: 'Pro Comms',    icon: I.chat },
    { href: '/ideas.html',              label: 'Idea Board',   icon: I.bulb },
  ];
  // Toggling mode keeps you in the same tool where an equivalent exists.
  var EQUIV = {
    '/schedule.html': '/pro-schedule-view.html', '/pro-schedule-view.html': '/schedule.html',
    '/timesheet.html': '/pro-timesheet.html',    '/pro-timesheet.html': '/timesheet.html',
  };

  function norm(p) { return (p || '').split('?')[0].replace(/\/+$/, ''); }

  function getMode(me) {
    // The page you're ON wins — a pro page always shows the pro nav, so office/pro
    // can never get mixed on screen (the bug this fixes).
    var path = norm(location.pathname);
    if (path === '/pro-timesheet' || path === '/pro-schedule-view') return 'pro';
    if (/audience=pro/.test(location.search)) return 'pro';
    if (me && me.is_management) {
      try { return localStorage.getItem('jct-hub-mode') === 'pro' ? 'pro' : 'office'; } catch (e) { return 'office'; }
    }
    if (me && me.is_pro) return 'pro';
    return 'office';
  }

  // Exposed so the toggle (inline onclick) can flip mode + jump to the equivalent page.
  window.__jctSetMode = function (mode) {
    try { localStorage.setItem('jct-hub-mode', mode === 'pro' ? 'pro' : 'admin'); } catch (e) {}
    var here = norm(location.pathname);
    var target = null;
    Object.keys(EQUIV).forEach(function (k) {
      if (norm(k) === here) {
        var dest = EQUIV[k];
        var destIsPro = dest.indexOf('pro-') !== -1;
        if ((mode === 'pro') === destIsPro) target = dest;
      }
    });
    location.href = target || location.pathname;
  };

  function buildHTML(me) {
    var mode = getMode(me);
    var items = (mode === 'pro' ? PRO : OFFICE);
    var here = norm(location.pathname);
    var links = items.map(function (l) {
      var active = norm(l.href) === here;
      if (active) return '<span class="qnav qnav-active" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></span>';
      return '<a href="' + l.href + '" class="qnav" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></a>';
    }).join('');
    // Management gets an Office⇄Pro toggle
    if (me && me.is_management) {
      links += '<span class="qnav-mode-toggle" role="group" aria-label="Mode">' +
        '<button type="button" class="qnav-mode-btn' + (mode === 'office' ? ' on' : '') + '" onclick="__jctSetMode(\'office\')">Office</button>' +
        '<button type="button" class="qnav-mode-btn' + (mode === 'pro' ? ' on' : '') + '" onclick="__jctSetMode(\'pro\')">Pro</button>' +
        '</span>';
    }
    return links;
  }

  function injectStyleOnce() {
    if (document.getElementById('topnav-style')) return;
    var s = document.createElement('style');
    s.id = 'topnav-style';
    s.textContent =
      '.qnav-mode-toggle{display:inline-flex;gap:2px;margin-left:6px;background:rgba(12,23,56,0.05);border-radius:8px;padding:3px}' +
      '.qnav-mode-btn{padding:5px 10px;border:none;background:transparent;color:#8fa0b8;font-family:Inter,sans-serif;font-size:12px;font-weight:700;border-radius:6px;cursor:pointer}' +
      '.qnav-mode-btn.on{background:#fff;color:#2c5c9c;box-shadow:0 1px 2px rgba(12,23,56,0.10)}' +
      '@media(max-width:820px){.qnav-mode-toggle{display:none}}';
    document.head.appendChild(s);
  }

  function mount(me) {
    injectStyleOnce();
    var existing = document.querySelectorAll('.qnav');
    if (!existing.length) return;   // page has no top nav row to own (orphan) — handled separately
    var parent = existing[0].parentNode;
    var marker = document.createComment('topnav');
    parent.insertBefore(marker, existing[0]);
    existing.forEach(function (n) { n.remove(); });
    var wrap = document.createElement('span');
    wrap.style.display = 'contents';
    wrap.innerHTML = buildHTML(me);
    parent.insertBefore(wrap, marker);
    parent.removeChild(marker);
  }

  function boot() {
    fetch('/api/me').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { mount(me); })
      .catch(function () { mount(null); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
