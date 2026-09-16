/* Network resilience.
   During a deploy the server restarts for a few seconds; requests in that window can
   fail (network error) or return a gateway error (502/503/504). Without a retry, a
   page's first data calls fail and it sits on "Loading…" until the user manually
   refreshes. This wrapper retries SAME-ORIGIN, IDEMPOTENT GET requests a few times with
   a short backoff. POST/PUT/DELETE are never retried (they may not be idempotent), and
   cross-origin requests (e.g. the Tailwind CDN) are left untouched. */
(function () {
  if (window.__jctFetchPatched || typeof window.fetch !== 'function') return;
  window.__jctFetchPatched = true;
  var _fetch = window.fetch.bind(window);
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var DELAYS = [300, 700, 1300];
  window.fetch = function (input, init) {
    init = init || {};
    var method = (init.method || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var crossOrigin = /^https?:\/\//i.test(url) && url.indexOf(location.origin) !== 0;
    if (method !== 'GET' || crossOrigin) return _fetch(input, init);
    var attempt = function (i) {
      return _fetch(input, init).then(function (res) {
        if ((res.status === 502 || res.status === 503 || res.status === 504) && i < DELAYS.length) {
          return sleep(DELAYS[i]).then(function () { return attempt(i + 1); });
        }
        return res;
      }).catch(function (err) {
        if (i < DELAYS.length) return sleep(DELAYS[i]).then(function () { return attempt(i + 1); });
        throw err;
      });
    };
    return attempt(0);
  };
})();

/* Soft update prompt.
   Every deploy restarts the server and changes its boot id (/api/version). Any open
   page polls that id; when it changes, we show a non-blocking banner offering
   "Update now" (reload) or "Later" — we NEVER reload on our own, so a staff member
   is never yanked out of a task mid-edit. */
// Self-heal stale caches. An older build shipped a caching service worker that can
// get stuck serving old pages across deploys (nothing registers it anymore, so it
// never updates itself). Proactively unregister any non-push service worker and wipe
// all caches so users land on fresh code. push-sw.js is left alone (notifications only).
(function () {
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        var killedOne = false;
        regs.forEach(function (r) {
          var sw = r.active || r.waiting || r.installing;
          var url = (sw && sw.scriptURL) || '';
          if (url.indexOf('push-sw.js') === -1) { r.unregister(); killedOne = true; }
        });
        if (killedOne && window.caches && caches.keys) {
          caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
        }
      }).catch(function () {});
    }
  } catch (e) { /* best effort */ }
})();

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
    b.querySelector('#aub-now').onclick = function () {
      var btn = this;
      btn.textContent = 'Updating…';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      // Wait until the server actually responds before reloading, so we never land on
      // a mid-restart blank page. Falls back to a plain reload if it takes too long.
      var tries = 0;
      (function waitReady() {
        fetch('/api/version', { cache: 'no-store' })
          .then(function (r) { return (r && r.ok) ? r.json() : null; })
          .then(function (v) {
            if (v && typeof v.boot !== 'undefined') window.location.reload();
            else if (tries++ < 20) setTimeout(waitReady, 500);
            else window.location.reload();
          })
          .catch(function () { if (tries++ < 20) setTimeout(waitReady, 500); else window.location.reload(); });
      })();
    };
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
