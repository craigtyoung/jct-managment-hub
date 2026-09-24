/*
 * waitlist-nav.js — the ONE Wait Lists side menu, shared by every page in the
 * section (academy.html, waitlist.html, lesson-waitlist.html).
 *
 * Why this file exists: the sub-menu had been hand-rolled differently on each
 * page, so every page in the section looked like its own little product. This
 * renders one component, styled to match the Comms sidebar (the pattern the
 * platform already uses for page-local sub-navigation), with live counts.
 *
 * Usage: put <div id="wl-sidebar"></div> as the first child of .shell, and
 * include <script src="/waitlist-nav.js"></script>. Nothing else.
 *
 * Pages own their main content; this owns the rail. Global nav stays in the
 * top bar (topnav.js) — top bar = platform sections, rail = within a section.
 */
(function () {
  var ITEMS = [
    { key: 'openings', label: 'Academy Openings', href: '/waitlist.html',        dot: '#dc2626' },
    { key: 'waitlist', label: 'Student Waitlists', href: '/academy.html#waitlist', dot: '#d97706' },
    { key: 'changes',  label: 'Change Requests',  href: '/academy.html#changes',  dot: '#2c5c9c' },
    { key: 'lessons',  label: 'Private Lessons',  href: '/lesson-waitlist.html',  dot: '#16a34a' },
  ];

  function norm(p) { return (p || '').split('?')[0].replace(/\/+$/, ''); }

  // Which item is "here"? On academy.html the hash decides, since two of the
  // four areas live on that page as in-place views.
  function activeKey() {
    var path = norm(location.pathname);
    if (path === '/waitlist.html') return 'openings';
    if (path === '/lesson-waitlist.html') return 'lessons';
    if (path === '/academy.html' || path === '' || path === '/') {
      return location.hash === '#changes' ? 'changes' : 'waitlist';
    }
    return '';
  }

  function render(counts) {
    var host = document.getElementById('wl-sidebar');
    if (!host) return;
    var active = activeKey();
    var onAcademy = norm(location.pathname) === '/academy.html';
    host.className = 'sidebar';
    host.innerHTML =
      '<div class="sidebar-section">' +
        '<div class="sidebar-label">Wait Lists</div>' +
        ITEMS.map(function (it) {
          var isActive = it.key === active ? ' active' : '';
          var n = counts && counts[it.key];
          var pill = (n === 0 || n) ? '<span class="wl-count">' + n + '</span>' : '';
          // On academy.html the two in-page views switch without a reload.
          var inPage = onAcademy && (it.key === 'waitlist' || it.key === 'changes');
          var onclick = inPage ? ' onclick="return window.__wlNavInPage(\'' + it.key + '\', event)"' : '';
          return '<a class="sidebar-btn' + isActive + '" href="' + it.href + '"' + onclick + '>' +
            '<span class="shift-dot" style="background:' + it.dot + '"></span>' + it.label + pill +
            '</a>';
        }).join('') +
      '</div>';
  }

  function loadCounts() {
    var out = {};
    var jobs = [
      fetch('/api/waitlist').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { out.openings = (rows || []).filter(function (s) { return s.status !== 'filled'; }).length; })
        .catch(function () {}),
      fetch('/api/academy/waitlist').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { out.waitlist = (rows || []).filter(function (w) { return w.status !== 'Enrolled' && w.status !== 'Withdrawn'; }).length; })
        .catch(function () {}),
      fetch('/api/academy/changes').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { out.changes = (rows || []).filter(function (c) { return c.status !== 'Done' && c.status !== 'Cancelled'; }).length; })
        .catch(function () {}),
      fetch('/api/lesson-waitlist').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { out.lessons = (rows || []).filter(function (i) { return i.status !== 'closed'; }).length; })
        .catch(function () {}),
    ];
    return Promise.all(jobs).then(function () { return out; });
  }

  function boot() {
    render(null);
    loadCounts().then(render);
    // Keep the active marker honest when academy.html switches view in place.
    window.addEventListener('hashchange', function () { loadCounts().then(render); });
    // Let the host page refresh counts after it mutates a list.
    window.__wlNavRefresh = function () { loadCounts().then(render); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
