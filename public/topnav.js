/*
 * topnav.js — single source of truth for the desktop top navigation.
 *
 * Every page's top menu was hand-coded with office links, so "mode" (office vs pro)
 * only worked on the dashboard. This renders ONE mode-aware top nav in place of a
 * page's hard-coded .qnav (or injects one if the page has none), so mode travels.
 *
 * Mode (which link set to show):
 *   - The page you're ON wins: a pro page always shows the pro nav.
 *   - Otherwise: pros → pro; office staff → office; management → localStorage
 *     ['jct-hub-mode'] (set by the dashboard's Office⇄Pro toggle), default office.
 *
 * No per-page mode toggle — management flips mode on the dashboard and it carries.
 * Side menus are untouched — this only owns the top row.
 * Include on every page: <script src="/topnav.js"></script>
 */
(function () {
  var I = {
    home: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
    check: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    cash: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
    cal: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    chat: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    bag: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    lessons: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 4V2.6h6V4"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>',
  };

  var OFFICE = [
    { href: '/hub.html',          label: 'Dashboard',  icon: I.home },
    { href: '/checklist.html',    label: 'Checklist',  icon: I.check },
    { href: '/cash-summary.html', label: 'Cash',       icon: I.cash },
    { href: '/schedule.html',     label: 'Schedule',   icon: I.cal },
    { href: '/timesheet.html',    label: 'Timesheets', icon: I.clock },
    { href: '/comms.html',        label: 'Comms',      icon: I.chat },
    { href: '/lesson-waitlist.html', label: 'Lessons',  icon: I.lessons },
    { href: '/proshop.html',      label: 'Pro Shop',   icon: I.bag },
  ];
  // Pro nav is deliberately lean.
  var PRO = [
    { href: '/hub.html',                label: 'Dashboard',    icon: I.home },
    { href: '/pro-schedule-view.html',  label: 'Pro Schedule', icon: I.cal },
    { href: '/pro-timesheet.html',      label: 'Timesheets',   icon: I.clock },
    { href: '/lesson-waitlist.html',    label: 'Lessons',      icon: I.lessons },
    { href: '/comms.html?audience=pro', label: 'Pro Comms',    icon: I.chat },
  ];

  function norm(p) { return (p || '').split('?')[0].replace(/\/+$/, ''); }

  function getMode(me) {
    // The page you're ON wins — a pro page always shows the pro nav, so office/pro
    // can never appear mixed on one screen (the bug this fixes).
    var path = norm(location.pathname);
    if (path === '/pro-timesheet' || path === '/pro-schedule-view') return 'pro';
    if (/audience=pro/.test(location.search)) return 'pro';
    if (me && me.is_management) {
      try { return localStorage.getItem('jct-hub-mode') === 'pro' ? 'pro' : 'office'; } catch (e) { return 'office'; }
    }
    if (me && me.is_pro) return 'pro';
    return 'office';
  }

  function buildHTML(me) {
    var items = (getMode(me) === 'pro' ? PRO : OFFICE);
    var here = norm(location.pathname);
    return items.map(function (l) {
      var active = norm(l.href) === here;
      if (active) return '<span class="qnav qnav-active" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></span>';
      return '<a href="' + l.href + '" class="qnav" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></a>';
    }).join('');
  }

  function injectStyleOnce() {
    if (document.getElementById('topnav-style')) return;
    var s = document.createElement('style');
    s.id = 'topnav-style';
    // Styles scoped to the injected bar only, so pages that already style .qnav are untouched.
    s.textContent =
      '.topnav-bar{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:2px;flex-wrap:wrap;background:#fff;border-bottom:1px solid rgba(12,23,56,0.08);padding:10px 20px}' +
      '.topnav-bar .qnav{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:9px;text-decoration:none;color:#4a6080;font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;border:1px solid transparent;transition:all .15s;cursor:pointer}' +
      '.topnav-bar .qnav svg{width:16px;height:16px}' +
      '.topnav-bar .qnav:hover{background:#eef2f8;color:#0c1738}' +
      '.topnav-bar .qnav.qnav-active{background:rgba(44,92,156,0.10);color:#2c5c9c}' +
      '@media(max-width:640px){.topnav-bar .qnav span{display:none}}';
    document.head.appendChild(s);
  }

  function mount(me) {
    var html = buildHTML(me);
    var existing = document.querySelectorAll('.qnav');
    if (existing.length) {
      // A page that isn't in the shared list (Waitlist, Knowledge Base, Idea Board…) keeps its own
      // highlighted tab at the end, so you can still see where you are.
      var here = norm(location.pathname);
      var inList = (getMode(me) === 'pro' ? PRO : OFFICE).some(function (l) { return norm(l.href) === here; });
      if (!inList) {
        existing.forEach(function (n) { if (n.classList.contains('qnav-active')) html += n.outerHTML; });
      }
      // Replace the page's hard-coded qnav in place (keeps clock/user/signout siblings).
      var parent = existing[0].parentNode;
      var marker = document.createComment('topnav');
      parent.insertBefore(marker, existing[0]);
      existing.forEach(function (n) { n.remove(); });
      var wrap = document.createElement('span');
      wrap.style.display = 'contents';
      wrap.innerHTML = html;
      parent.insertBefore(wrap, marker);
      parent.removeChild(marker);
      // Comms' unread badge is a sibling of the links; keep it glued to the Comms link
      // (it used to drift to whichever link happened to be last).
      var pill = document.getElementById('unread-pill');
      var comms = wrap.querySelector('a[href^="/comms.html"], .qnav-active[title*="Comms"]');
      if (pill && comms) comms.parentNode.insertBefore(pill, comms.nextSibling);
    } else {
      // No top nav on this page — inject a bar so it isn't stranded.
      injectStyleOnce();
      var bar = document.createElement('nav');
      bar.className = 'topnav-bar';
      bar.setAttribute('aria-label', 'Primary');
      bar.innerHTML = html;
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  function boot() {
    fetch('/api/me').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { mount(me); })
      .catch(function () { mount(null); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
