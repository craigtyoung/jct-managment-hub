/*
 * court-alert.js — a pro's "quick ping" interrupts whatever the office is doing,
 * on whatever page they're on. The dashboard's "Messages from the Court" card only
 * helps if someone happens to be looking at the dashboard; this is the same data
 * (court_ping messages, unread for the viewer) surfaced as a full-screen popup
 * instead, so an urgent on-court request can't be missed just because the front
 * desk is on Cash Summary or Check-ins at the time.
 *
 * Loaded dynamically by topnav.js for any non-pro signed-in viewer (never for pros
 * — they're the senders here, not the receivers). Self-contained: injects its own
 * styles, escapes its own text, lazy-loads staff-avatar.js if a page doesn't
 * already have it.
 *
 * Deliberately separate from the Comm Log in every way — own data flag
 * (court_ping), own surfacing (popup, not a feed), own reply path
 * (court_reply_to), on purpose. See routes/messages.js for the server side.
 */
(function () {
  if (window.__jctCourtAlert) return;
  window.__jctCourtAlert = true;

  var shownIds = {};  // ids already popped THIS page load — stops the safety poll re-queuing one already on screen
  var queue = [];
  var modalEl = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function injectStyle() {
    if (document.getElementById('jct-court-alert-style')) return;
    var s = document.createElement('style');
    s.id = 'jct-court-alert-style';
    s.textContent =
      '.jct-ca-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(12,23,56,0.55);' +
        'display:flex;align-items:center;justify-content:center;padding:20px;' +
        'font-family:Inter,system-ui,sans-serif;animation:jctCaFadeIn .15s ease}' +
      '@keyframes jctCaFadeIn{from{opacity:0}to{opacity:1}}' +
      '.jct-ca-card{background:#fff;border-radius:18px;max-width:380px;width:100%;' +
        'box-shadow:0 20px 60px rgba(12,23,56,0.35);overflow:hidden;' +
        'border:2px solid #f59e0b;animation:jctCaPulse 1.6s ease-in-out infinite}' +
      '@keyframes jctCaPulse{0%,100%{box-shadow:0 20px 60px rgba(12,23,56,0.35),0 0 0 0 rgba(245,158,11,0)}' +
        '50%{box-shadow:0 20px 60px rgba(12,23,56,0.35),0 0 0 7px rgba(245,158,11,0.22)}}' +
      '.jct-ca-head{background:#fff7ed;padding:12px 18px;display:flex;align-items:center;gap:8px;' +
        'border-bottom:1px solid rgba(217,119,6,0.25)}' +
      '.jct-ca-tag{font-size:12px;font-weight:800;letter-spacing:0.02em;color:#b45309}' +
      '.jct-ca-meta{margin-left:auto;font-size:11px;color:#8fa0b8}' +
      '.jct-ca-body{padding:16px 18px;display:flex;gap:12px;align-items:flex-start}' +
      '.jct-ca-av{width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;' +
        'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:#e8eef8}' +
      '.jct-ca-av img{width:100%;height:100%;object-fit:cover}' +
      '.jct-ca-text{flex:1;font-size:15px;color:#0c1738;line-height:1.5}' +
      '.jct-ca-name{font-weight:700}' +
      '.jct-ca-foot{padding:0 18px 16px}' +
      '.jct-ca-form{display:flex;gap:7px;margin-bottom:9px}' +
      '.jct-ca-input{flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid rgba(12,23,56,0.15);' +
        'font-family:Inter,system-ui,sans-serif;font-size:13.5px;color:#0c1738}' +
      '.jct-ca-send{flex:0 0 auto;padding:9px 16px;border-radius:9px;border:none;background:#2c5c9c;color:#fff;' +
        'font-weight:700;font-size:13px;cursor:pointer}' +
      '.jct-ca-send:disabled{opacity:0.6;cursor:default}' +
      '.jct-ca-dismiss{display:block;width:100%;text-align:center;padding:8px;background:none;border:none;' +
        'color:#8fa0b8;font-size:12px;cursor:pointer;text-decoration:underline;font-family:Inter,system-ui,sans-serif}' +
      '.jct-ca-dismiss:hover{color:#475569}';
    document.head.appendChild(s);
  }

  function ensureAvatarHelper() {
    if (window.staffAvatar) return Promise.resolve();
    return new Promise(function (resolve) {
      var sc = document.createElement('script');
      sc.src = '/staff-avatar.js';
      sc.onload = resolve; sc.onerror = resolve;
      document.head.appendChild(sc);
    });
  }

  function relTime(iso) {
    var diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return diff + 'm ago';
    return Math.round(diff / 60) + 'h ago';
  }

  function playPing() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach(function (freq, i) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        osc.connect(gain); gain.connect(ctx.destination);
        var start = ctx.currentTime + i * 0.14;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.start(start); osc.stop(start + 0.24);
      });
    } catch (e) {}
  }

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    tryShowNext();
  }

  function tryShowNext() {
    if (modalEl || !queue.length) return;
    showModal(queue.shift());
  }

  function showModal(m) {
    injectStyle();
    playPing();
    modalEl = document.createElement('div');
    modalEl.className = 'jct-ca-backdrop';
    modalEl.innerHTML =
      '<div class="jct-ca-card">' +
        '<div class="jct-ca-head"><span class="jct-ca-tag">📍 Message from the Court</span>' +
          '<span class="jct-ca-meta">' + esc(relTime(m.created_at)) + '</span></div>' +
        '<div class="jct-ca-body">' +
          '<div class="jct-ca-av" id="jct-ca-av"></div>' +
          '<div class="jct-ca-text"><span class="jct-ca-name">' + esc(m.author_name) + ':</span> ' + esc(m.content) + '</div>' +
        '</div>' +
        '<div class="jct-ca-foot">' +
          '<form class="jct-ca-form" id="jct-ca-form">' +
            '<input class="jct-ca-input" id="jct-ca-input" maxlength="200" placeholder="Got it 👍 (or type a quick reply)">' +
            '<button type="submit" class="jct-ca-send">Send</button>' +
          '</form>' +
          '<button type="button" class="jct-ca-dismiss" id="jct-ca-dismiss-btn">Dismiss without replying</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);
    ensureAvatarHelper().then(function () {
      if (window.staffAvatar) window.staffAvatar(document.getElementById('jct-ca-av'), m.author_id, m.author_name, m.author_color || '#2c5c9c');
    });
    document.getElementById('jct-ca-input').focus();
    document.getElementById('jct-ca-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('jct-ca-input');
      var content = (input.value || '').trim() || 'Got it 👍';
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, court_reply_to: m.id }),
      }).catch(function () {}).then(closeModal);
    });
    document.getElementById('jct-ca-dismiss-btn').addEventListener('click', function () {
      fetch('/api/messages/' + m.id + '/read', { method: 'POST' }).catch(function () {}).then(closeModal);
    });
  }

  async function check() {
    try {
      var r = await fetch('/api/messages?unread=true');
      if (!r.ok) return;
      var unread = await r.json();
      var pings = (Array.isArray(unread) ? unread : [])
        .filter(function (m) { return m.court_ping && !shownIds[m.id]; })
        .sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
      if (!pings.length) return;
      pings.forEach(function (p) { shownIds[p.id] = true; queue.push(p); });
      tryShowNext();
    } catch (e) {}
  }

  function boot(me) {
    if (!me || me.role === 'pro') return;  // pros send these, they don't receive them
    check();
    setInterval(check, 45000);  // safety net if an SSE 'update' is missed
    try {
      var es = new EventSource('/api/events');
      es.onmessage = function (e) { if (e.data === 'update') check(); };
    } catch (e) {}
  }

  window.__jctCourtAlertBoot = boot;
})();
