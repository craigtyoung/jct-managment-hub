/*
 * notif-bell.js — one notifications bell, in the same spot on every page.
 *
 * Push notifications (a ping for new notes) used to have a bell on the Communications page
 * only. This puts a single shared bell in the top-right cluster of any page that has one
 * (.ts-right, or the .me-badge cluster on Comms / Idea Board / Academy). Green = on.
 * Hidden entirely on browsers that can't do web push.
 * Include on any page: <script src="/notif-bell.js"></script>
 */
(function () {
  if (window.__jctBell) return;
  window.__jctBell = true;

  var ICON = '<svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var btn;

  function injectStyle() {
    if (document.getElementById('jct-bell-style')) return;
    var s = document.createElement('style');
    s.id = 'jct-bell-style';
    s.textContent =
      '.jct-bell{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;padding:0;background:transparent;border:1px solid rgba(12,23,56,0.10);border-radius:9px;color:#94a3b8;cursor:pointer;transition:color .15s,border-color .15s}' +
      '.jct-bell:hover{color:#475569;border-color:rgba(44,92,156,0.35)}' +
      '.jct-bell.on{color:#10b981;border-color:rgba(16,185,129,0.4)}' +
      '.jct-bell-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:90vw;background:#0c1738;color:#fff;font:600 13px Inter,system-ui,sans-serif;padding:10px 18px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25)}';
    document.head.appendChild(s);
  }

  function say(msg) {
    var t = document.createElement('div');
    t.className = 'jct-bell-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  async function refresh() {
    if (!btn || !window.jctPush) return;
    var st = await window.jctPush.status();
    if (st === 'unsupported') { btn.style.display = 'none'; return; }
    btn.classList.toggle('on', st === 'on');
    btn.title = st === 'on' ? 'Notifications on' : 'Turn on notifications for new notes';
    btn.setAttribute('aria-label', btn.title);
  }

  async function toggle() {
    if (!window.jctPush) return;
    var st = await window.jctPush.status();
    if (st === 'on') { await window.jctPush.disable(); say('Notifications turned off'); return refresh(); }
    if (st === 'ios-install') return say('On iPhone: Share → Add to Home Screen, open it from there, then enable.');
    if (st === 'denied') return say('Notifications are blocked in your browser settings.');
    var r = await window.jctPush.enable();
    if (r.ok) say('Notifications on. You\'ll get a ping for new notes.');
    else if (r.reason === 'ios-install') say('On iPhone: Add to Home Screen first, then enable.');
    else if (r.reason === 'denied') say('Notifications blocked. Enable them in browser settings.');
    else if (r.reason === 'unsupported') say('Not supported on this device.');
    refresh();
  }

  // Right-hand cluster of whichever top bar this page has. Sits just before the avatar / name.
  function mount() {
    var right = document.querySelector('.ts-right');
    var before = null, pushRight = false;
    if (right) {
      before = right.querySelector('.sidenav-avatar, #nav-avatar, .ts-signout');
      // The avatar can be nested (Schedule wraps it); insert before the direct child that holds it.
      while (before && before.parentNode !== right) before = before.parentNode;
    } else {
      var me = document.querySelector('.me-badge');
      if (!me) return false;
      right = me.parentNode; before = me;
      // Some bars push the name right with an auto margin; hand that to the bell so they stay together.
      me.style.marginLeft = '0';
      pushRight = true;
    }
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jct-bell';
    btn.id = 'jct-bell';
    btn.innerHTML = ICON;
    btn.title = 'Turn on notifications for new notes';
    if (pushRight) btn.style.marginLeft = 'auto';
    btn.addEventListener('click', toggle);
    right.insertBefore(btn, before);
    injectStyle();
    return true;
  }

  function boot() {
    if (!mount()) return;
    if (window.jctPush) return refresh();
    var s = document.createElement('script');
    s.src = '/push-client.js';
    s.onload = refresh;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
