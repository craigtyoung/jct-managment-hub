/*
 * mobile-more.js — single source of truth for the mobile "More" sheet.
 *
 * The bottom bar (Home · Checklist · Comms · Schedule · More) is consistent across
 * pages and left as-is. The "More" sheet, however, was hand-coded separately on every
 * page and drifted out of sync (Timesheets was missing everywhere). This script
 * rewrites the .mnav-sheet contents to one curated list, so the mobile app surfaces
 * only the daily-driver tools. Curated OFF mobile: Cash Summary, Bubble Monitoring,
 * Waitlist, Weekly Court Schedule.
 *
 * Include on every staff page: <script src="/mobile-more.js"></script>
 */
(function () {
  var LINKS = [
    { href: '/pro-schedule-view.html', label: 'Pro Schedule',
      svg: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>' },
    { href: '/timesheet.html', label: 'Timesheets',
      svg: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { href: '/ideas.html', label: 'Idea Board',
      svg: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>' },
    { href: '/staff-management.html', label: 'Staff Management', mgmt: true,
      svg: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="9" y="2" width="6" height="4" rx="1"/><circle cx="12" cy="11" r="2"/><path d="M8.5 17.5c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5"/></svg>' },
  ];

  function norm(p) { return (p || '').replace(/\/+$/, ''); }

  function render(me) {
    var sheet = document.querySelector('.mnav-sheet');
    if (!sheet) return;
    var here = norm(location.pathname);
    var isMgmt = !!(me && me.is_management);
    var items = LINKS
      .filter(function (l) { return !l.mgmt || isMgmt; })
      .map(function (l) {
        var active = norm(l.href) === here ? ' active' : '';
        var cur = active ? ' aria-current="page"' : '';
        return '<a href="' + l.href + '" class="mnav-sheet-link' + active + '"' + cur + '>' + l.svg + l.label + '</a>';
      }).join('');
    sheet.innerHTML =
      '<div class="mnav-grip"></div>' +
      '<div class="mnav-sheet-title">More</div>' +
      items;
  }

  function boot() {
    // Render immediately with no management info (hides Staff Management until confirmed),
    // then refine once /api/me resolves.
    render(null);
    fetch('/api/me').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { if (me) render(me); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
