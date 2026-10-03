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
    league: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M3 12h18"/></svg>',
  };

  var OFFICE = [
    { href: '/hub.html',          label: 'Dashboard',  icon: I.home },
    { href: '/checklist.html',    label: 'Checklist',  icon: I.check },
    { href: '/cash-summary.html', label: 'Cash',       icon: I.cash },
    { href: '/schedule.html',     label: 'Shift Schedule', icon: I.cal },
    { href: '/timesheet.html',    label: 'Timesheets', icon: I.clock },
    { href: '/comms.html',        label: 'Comms',      icon: I.chat },
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

  // Management browsing in pro mode already has edit rights — send them straight to
  // the real Lesson Schedule editor instead of the public no-login quick-reference
  // page the plain PRO nav points to for actual teaching pros. Shared by buildHTML
  // and mount()'s "own tab" fallback so both agree on where each mode's links go.
  function effectiveItems(me) {
    var mode = getMode(me);
    var items = (mode === 'pro' ? PRO : OFFICE);
    if (mode === 'pro' && me && me.is_management) {
      items = items.map(function (l) {
        return l.href === '/pro-schedule-view.html'
          ? { href: '/pro-schedule.html', label: 'Lesson Schedule', icon: l.icon }
          : l;
      });
    }
    return items;
  }

  // Returns { navHtml, modeHtml } separately — the mode toggle belongs with the user
  // cluster (name/avatar/sign-out), top-right, not mixed into the section links on the
  // left. Kept apart here so mount() can place each piece where it actually belongs.
  function buildHTML(me) {
    var items = effectiveItems(me);
    var here = norm(location.pathname);
    var navHtml = items.map(function (l) {
      var active = norm(l.href) === here;
      if (active) return '<span class="qnav qnav-active" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></span>';
      return '<a href="' + l.href + '" class="qnav" title="' + l.label + '">' + l.icon + '<span>' + l.label + '</span></a>';
    }).join('');
    var modeHtml = '';
    // Management can flip modes on the Timesheets pages, but that flag then
    // silently follows them everywhere (getMode() reads it on every page) with
    // no indicator anywhere else — so a click on "Pro" while checking a
    // timesheet leaves the whole site's nav in pro mode, with the office links
    // simply gone, and no visible sign why. One small always-on toggle, glued
    // to the user cluster, so the current mode is never invisible.
    if (me && me.is_management) {
      var mode = getMode(me);
      modeHtml = '<span class="topnav-mode" title="Office/Pro nav mode — carries across every page until switched back">' +
        '<button type="button" class="topnav-mode-btn' + (mode === 'office' ? ' on' : '') + '" onclick="window.__jctToggleHubMode(\'office\')">Office</button>' +
        '<button type="button" class="topnav-mode-btn' + (mode === 'pro' ? ' on' : '') + '" onclick="window.__jctToggleHubMode(\'pro\')">Pro</button>' +
      '</span>';
    }
    return { navHtml: navHtml, modeHtml: modeHtml };
  }

  // Every page's user cluster (clock/avatar/name/sign-out) uses one of two patterns —
  // .ts-right on most pages, .me-badge on a handful (Comms, Ideas, Academy, Staff
  // Management). Try both so the toggle always lands top-right next to identity,
  // never mixed into the left-hand section links (that was the bug: on pages with a
  // longer link row, like Comms, the extra pill crowded the left cluster and visibly
  // pushed things around instead of sitting with name/sign-out where it reads as one
  // control group).
  function placeModeToggle(modeHtml, navParent) {
    if (!modeHtml) return;
    var host = document.querySelector('.ts-right');
    if (host) { host.insertAdjacentHTML('afterbegin', modeHtml); return; }
    var badge = document.querySelector('.me-badge');
    if (badge && badge.parentNode) { badge.insertAdjacentHTML('beforebegin', modeHtml); return; }
    // Last resort: no known user-cluster hook on this page — keep the old behaviour
    // (glued to the nav links) rather than dropping the toggle silently.
    if (navParent) navParent.insertAdjacentHTML('beforeend', modeHtml);
  }

  // ── Shared mobile header ────────────────────────────────────────────────────
  // Every page used to hand-roll its own mobile header (or have none at all), so
  // the top of the screen looked different on each one and sign-out was only
  // reachable from Comms. This renders ONE header for every page: brand mark,
  // page title, date, avatar, sign-out. Page-specific headers are hidden on
  // mobile by the injected style so there's never two stacked bars.
  function pageTitle(me) {
    var here = norm(location.pathname);
    var all = OFFICE.concat(PRO, [
      { href: '/pro-schedule.html',   label: 'Lesson Schedule' },
      { href: '/checkins.html',       label: 'Member Check-Ins' },
      { href: '/members.html',        label: 'Member List' },
      { href: '/ideas.html',          label: 'Idea Board' },
      { href: '/waitlist.html',       label: 'Academy Openings' },
      { href: '/academy.html',        label: 'Wait Lists' },
      { href: '/proshop.html',        label: 'Pro Shop' },
      { href: '/staff-management.html', label: 'Staff Management' },
      { href: '/bubble.html',         label: 'Bubble Monitoring' },
      { href: '/house-league.html',   label: 'House League' },
    ]);
    for (var i = 0; i < all.length; i++) {
      if (norm(all[i].href) === here) return all[i].label;
    }
    // Fall back to the document title with the site suffix stripped.
    return (document.title || 'JCT').split(/[—·|]/)[0].replace(/JCT Staff Hub/i, '').trim() || 'JCT';
  }

  window.__jctSignOut = function () {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(function () { location.href = '/login.html'; })
      .catch(function () { location.href = '/login.html'; });
  };

  function mountMobileHeader(me) {
    if (document.querySelector('.jct-mhead')) return;
    var title = pageTitle(me);
    var dateStr = new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
    var head = document.createElement('header');
    head.className = 'jct-mhead';
    head.innerHTML =
      '<a class="jct-mhead-mark" href="/hub.html" aria-label="Dashboard">JCT</a>' +
      '<div class="jct-mhead-txt">' +
        '<div class="jct-mhead-title">' + title + '</div>' +
        '<div class="jct-mhead-date">' + dateStr + '</div>' +
      '</div>' +
      // Signed-out pages (the public pro-schedule quick reference) get the brand +
      // title only — no avatar, and no sign-out button for a session that isn't there.
      (me ? '<div class="jct-mhead-right">' +
        '<div class="jct-mhead-av" id="jct-mhead-av"></div>' +
        '<button type="button" class="jct-mhead-out" onclick="window.__jctSignOut()" aria-label="Sign out" title="Sign out">' +
          '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
        '</button>' +
      '</div>' : '');
    document.body.insertBefore(head, document.body.firstChild);
    if (me && typeof window.staffAvatar === 'function') {
      try { window.staffAvatar(document.getElementById('jct-mhead-av'), me.id, me.name, me.color); } catch (e) {}
    }
  }

  // "More" was reduced to a single duplicate link (Idea Board, already on the
  // dashboard), so the tab is dead weight on a 5-slot bottom bar. Remove the
  // trigger wherever a page hand-coded it; the sheet markup can stay harmlessly.
  function stripMoreTab() {
    document.querySelectorAll('.mnav-item').forEach(function (n) {
      var txt = (n.textContent || '').trim().toLowerCase();
      var oc = (n.getAttribute('onclick') || '');
      if (txt === 'more' || /mnavOpenMore|openMore/.test(oc)) n.remove();
    });
  }

  window.__jctToggleHubMode = function (mode) {
    try { localStorage.setItem('jct-hub-mode', mode === 'pro' ? 'pro' : 'office'); } catch (e) {}
    // Pages that force a mode by URL (pro-timesheet, pro-schedule-view) would
    // just re-show the same mode on reload — send management to the dashboard
    // instead so switching modes always lands somewhere that reflects it.
    var path = norm(location.pathname);
    if (path === '/pro-timesheet' || path === '/pro-schedule-view') location.href = '/hub.html';
    else location.reload();
  };

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
      '@media(max-width:640px){.topnav-bar .qnav span{display:none}}' +
      // Mode toggle pill — styled to work regardless of which page it lands on,
      // since it can be embedded into a page's own pre-existing nav cluster.
      '.topnav-mode{display:inline-flex;align-items:center;background:rgba(12,23,56,0.05);border:1px solid rgba(12,23,56,0.08);border-radius:100px;padding:3px;margin-left:6px;gap:1px}' +
      '.topnav-mode-btn{border:none;background:none;cursor:pointer;font-family:Inter,system-ui,sans-serif;font-size:11px;font-weight:700;color:#8fa0b8;padding:4px 11px;border-radius:100px;transition:all .15s}' +
      '.topnav-mode-btn.on{background:#fff;color:#0c1738;box-shadow:0 1px 3px rgba(12,23,56,0.10)}' +
      '@media(max-width:820px){.topnav-mode{display:none}}' +
      // ── Shared mobile header (one per page, replaces every hand-rolled one) ──
      '.jct-mhead{display:none}' +
      '@media(max-width:820px){' +
        '.jct-mhead{display:flex;align-items:center;gap:11px;position:sticky;top:0;z-index:150;' +
          'background:#fff;border-bottom:1px solid rgba(12,23,56,0.08);' +
          'padding:9px 14px calc(9px);font-family:Inter,system-ui,sans-serif;}' +
        '.jct-mhead-mark{display:flex;align-items:center;justify-content:center;width:34px;height:34px;' +
          'border-radius:10px;flex-shrink:0;background:#0c1738;color:#fff;font-weight:800;font-size:11px;' +
          'letter-spacing:0.02em;text-decoration:none;}' +
        '.jct-mhead-txt{flex:1;min-width:0;}' +
        '.jct-mhead-title{font-size:14px;font-weight:700;color:#0c1738;line-height:1.2;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.jct-mhead-date{font-size:11px;color:#8fa0b8;margin-top:1px;}' +
        '.jct-mhead-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}' +
        '.jct-mhead-av{width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;' +
          'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;background:#e8eef8;}' +
        '.jct-mhead-av img{width:100%;height:100%;object-fit:cover;}' +
        '.jct-mhead-out{display:flex;align-items:center;justify-content:center;width:32px;height:32px;' +
          'border-radius:9px;border:1px solid rgba(12,23,56,0.10);background:#fff;color:#8fa0b8;cursor:pointer;padding:0;}' +
        '.jct-mhead-out svg{width:16px;height:16px;}' +
        '.jct-mhead-out:active{color:#ef4444;border-color:rgba(239,68,68,0.35);}' +
        // Page-specific headers stand down on mobile so there's never two bars.
        // Pages use one of two patterns for their own desktop header (.topstrip or
        // .topbar) plus the injected .topnav-bar — all three defer to this one.
        '.topstrip,.topbar,.topnav-bar{display:none !important;}' +
      '}';
    document.head.appendChild(s);
  }

  // Lazy-loads the global "Messages from the Court" popup (court-alert.js) for any
  // non-pro signed-in viewer, on every page — a pro's quick ping needs to interrupt
  // whoever's at the desk regardless of which page they're on, not just the dashboard.
  function loadCourtAlert(me) {
    if (!me || me.role === 'pro') return;
    if (window.__jctCourtAlertBoot) { window.__jctCourtAlertBoot(me); return; }
    var sc = document.createElement('script');
    sc.src = '/court-alert.js';
    sc.onload = function () { if (window.__jctCourtAlertBoot) window.__jctCourtAlertBoot(me); };
    document.head.appendChild(sc);
  }

  function mount(me) {
    injectStyleOnce();
    mountMobileHeader(me);
    loadCourtAlert(me);
    stripMoreTab();
    var built = buildHTML(me);
    var html = built.navHtml;
    var existing = document.querySelectorAll('.qnav');
    if (existing.length) {
      // A page that isn't in the shared list (Waitlist, Knowledge Base, Idea Board…) keeps its own
      // highlighted tab at the end, so you can still see where you are.
      var here = norm(location.pathname);
      var inList = effectiveItems(me).some(function (l) { return norm(l.href) === here; });
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
      placeModeToggle(built.modeHtml, parent);
    } else if (document.querySelector('.sidenav')) {
      // The dashboard has its own left launcher, top strip AND its own Office/Pro
      // toggle on desktop, and is deliberately left alone there — it only needs
      // the shared MOBILE header (already mounted above). Injecting a second bar
      // or a second mode toggle here would duplicate what the page already has.
      return;
    } else {
      // No top nav on this page — inject a bar so it isn't stranded.
      injectStyleOnce();
      var bar = document.createElement('nav');
      bar.className = 'topnav-bar';
      bar.setAttribute('aria-label', 'Primary');
      bar.innerHTML = html;
      document.body.insertBefore(bar, document.body.firstChild);
      placeModeToggle(built.modeHtml, bar);
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
