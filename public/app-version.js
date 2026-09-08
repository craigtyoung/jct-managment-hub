/* Soft update prompt.
   Every deploy restarts the server and changes its boot id (/api/version). Any open
   page polls that id; when it changes, we show a non-blocking banner offering
   "Update now" (reload) or "Later" — we NEVER reload on our own, so a staff member
   is never yanked out of a task mid-edit. */
(function () {
  var knownBoot = null;      // the build this page loaded with
  var snoozedUntil = 0;      // epoch ms; while in the future the banner stays hidden
  var banner = null;

  function getVersion() {
    return fetch('/api/version', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });   // server mid-restart — ignore, retry next tick
  }

  function buildBanner() {
    if (banner) return banner;
    var b = document.createElement('div');
    b.id = 'app-update-banner';
    b.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px', 'z-index:9999',
      'max-width:520px', 'margin:0 auto', 'display:none', 'align-items:center', 'gap:12px',
      'background:#0c1738', 'color:#fff', 'border-radius:14px', 'padding:13px 16px',
      'box-shadow:0 8px 30px rgba(12,23,56,0.35)', 'font-family:Inter,system-ui,sans-serif',
      'font-size:14px', 'line-height:1.35'
    ].join(';');
    b.innerHTML =
      '<div style="flex:1">A new version of the Hub is available.' +
      '<div style="font-size:12px;opacity:0.8;margin-top:1px">Update when you\'re ready — your current work won\'t be interrupted.</div></div>' +
      '<button id="aub-later" style="background:transparent;border:1px solid rgba(255,255,255,0.35);color:#fff;font-weight:600;font-size:13px;border-radius:9px;padding:7px 12px;cursor:pointer">Later</button>' +
      '<button id="aub-now" style="background:#2c5c9c;border:none;color:#fff;font-weight:700;font-size:13px;border-radius:9px;padding:7px 14px;cursor:pointer">Update now</button>';
    document.body.appendChild(b);
    b.querySelector('#aub-now').onclick = function () { window.location.reload(); };
    b.querySelector('#aub-later').onclick = function () {
      b.style.display = 'none';
      snoozedUntil = Date.now() + 8 * 60 * 1000;   // remind again in ~8 minutes
    };
    banner = b;
    return b;
  }

  function show() {
    if (Date.now() < snoozedUntil) return;
    buildBanner().style.display = 'flex';
  }

  function check() {
    getVersion().then(function (v) {
      if (!v || typeof v.boot === 'undefined') return;
      if (knownBoot === null) { knownBoot = v.boot; return; }   // first read = our baseline
      if (v.boot !== knownBoot) show();                          // a newer build is live
    });
  }

  // Prime the baseline, then poll. Also check when the tab regains focus.
  check();
  setInterval(check, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
