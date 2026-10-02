/*
 * status-strip.js — the thin "state of the club right now" bar.
 *
 * One slim row under the top nav: who's in, how many courts are busy, spots
 * waiting to be filled, unread notes. Read-only glance value — every item
 * links to the page that owns it. Injects itself; include the script and it
 * appears. Items the signed-in user isn't allowed to see are simply omitted
 * (a pro never sees check-in numbers), so it degrades instead of erroring.
 *
 * Refreshes on the same SSE 'checkin-update' the rest of the hub listens to,
 * plus a slow poll so counts don't go stale on a screen left open all shift.
 */
(function () {
  var COURTS = 6;
  var state = { mounted: false };

  function el(id) { return document.getElementById(id); }

  function injectStyle() {
    if (el('status-strip-style')) return;
    var s = document.createElement('style');
    s.id = 'status-strip-style';
    s.textContent =
      '.status-strip{display:flex;align-items:center;gap:0;flex-wrap:wrap;background:#fff;' +
        'border-bottom:1px solid rgba(12,23,56,0.08);padding:0 18px;font-family:Inter,system-ui,sans-serif;}' +
      '.ss-item{display:inline-flex;align-items:center;gap:8px;padding:9px 16px 9px 0;margin-right:16px;' +
        'text-decoration:none;color:inherit;border-right:1px solid rgba(12,23,56,0.07);}' +
      '.ss-item:last-child{border-right:none;margin-right:0;}' +
      '.ss-item:hover .ss-val{color:#2c5c9c;}' +
      '.ss-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;position:relative;}' +
      '.ss-dot.pulse::after{content:"";position:absolute;inset:-3px;border-radius:50%;' +
        'background:inherit;opacity:0.35;animation:ssPulse 2.4s ease-out infinite;}' +
      '@keyframes ssPulse{0%{transform:scale(0.7);opacity:0.45;}70%{transform:scale(1.9);opacity:0;}100%{opacity:0;}}' +
      '.ss-val{font-size:14px;font-weight:700;color:#0c1738;line-height:1;transition:color .15s;font-variant-numeric:tabular-nums;}' +
      '.ss-label{font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#8fa0b8;}' +
      '.ss-item.quiet .ss-val{color:#8fa0b8;}' +
      '@media(max-width:760px){.status-strip{overflow-x:auto;flex-wrap:nowrap;}.ss-item{flex-shrink:0;}}';
    document.head.appendChild(s);
  }

  // Count up to the new value — a number that lands feels live, one that just
  // appears feels static. Skips the animation on first paint of a zero.
  function setVal(node, next) {
    if (!node) return;
    var prev = parseInt(node.getAttribute('data-v') || '0', 10);
    node.setAttribute('data-v', String(next));
    if (prev === next) { node.textContent = String(next); return; }
    var steps = Math.min(Math.abs(next - prev), 12);
    if (steps <= 1) { node.textContent = String(next); return; }
    var i = 0;
    var timer = setInterval(function () {
      i++;
      node.textContent = String(Math.round(prev + (next - prev) * (i / steps)));
      if (i >= steps) { clearInterval(timer); node.textContent = String(next); }
    }, 38);
  }

  function mount(items) {
    injectStyle();
    var bar = el('status-strip');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'status-strip';
      bar.className = 'status-strip';
      // Sits directly under whatever top nav the page has. The shared mobile
      // header comes first so the strip lands under it on a phone.
      var topnav = document.querySelector('.jct-mhead, .topnav-bar, .topbar, .topstrip');
      if (topnav && topnav.parentNode) topnav.parentNode.insertBefore(bar, topnav.nextSibling);
      else document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.innerHTML = items.map(function (it) {
      return '<a class="ss-item' + (it.value ? '' : ' quiet') + '" href="' + it.href + '" title="' + it.title + '">' +
        '<span class="ss-dot' + (it.value ? ' pulse' : '') + '" style="background:' + it.color + '"></span>' +
        '<span class="ss-val" id="ss-' + it.key + '" data-v="0">0</span>' +
        '<span class="ss-label">' + it.label + '</span>' +
      '</a>';
    }).join('');
    items.forEach(function (it) {
      if (it.text != null) { var n = el('ss-' + it.key); if (n) n.textContent = it.text; }
      else setVal(el('ss-' + it.key), it.value);
    });
    bindDragGuard(bar);
    state.mounted = true;
  }

  // The strip scrolls horizontally on a phone, but every item is a link — so a
  // drag to scroll it was landing as a tap and navigating away mid-swipe. Track
  // how far the finger moved and swallow the click if it was a scroll, not a tap.
  function bindDragGuard(bar) {
    if (bar.__dragGuard) return;
    bar.__dragGuard = true;
    var x0 = 0, y0 = 0, moved = false;
    bar.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return;
      x0 = t.clientX; y0 = t.clientY; moved = false;
    }, { passive: true });
    bar.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return;
      if (Math.abs(t.clientX - x0) > 8 || Math.abs(t.clientY - y0) > 8) moved = true;
    }, { passive: true });
    bar.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
  }

  // Earliest class today that hasn't finished yet. Mirrors the dashboard's own
  // "Next on Court" maths so the two never disagree.
  function nextClass(slots) {
    var CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var now = new Date();
    var dayCode = CODES[now.getDay()];
    var nowMin = now.getHours() * 60 + now.getMinutes();
    function toMin(t) {
      var p = String(t || '0:0').split(':');
      return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
    }
    var todays = (slots || []).filter(function (s) {
      return s.day === dayCode && (s.season || 'indoor') === 'indoor' && toMin(s.end) > nowMin;
    }).sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
    if (!todays.length) return null;
    var s = todays[0];
    var startMin = toMin(s.start);
    if (startMin <= nowMin) return { label: 'On now', title: (s.program || 'Class') + ' is on court now' };
    var h = Math.floor(startMin / 60), m = startMin % 60, ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    var lbl = m ? h + ':' + String(m).padStart(2, '0') : String(h);
    return { label: lbl + ' ' + ap, title: (s.program || 'Class') + ' starts at ' + lbl + ' ' + ap };
  }

  function refresh() {
    var me = null;
    fetch('/api/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      me = m;
      if (!me) return Promise.reject();
      var jobs = [];
      var data = { inToday: 0, courts: 0, unassigned: 0, spots: 0, unread: 0, temp: null, next: null };
      if (me.can_view_checkins) {
        jobs.push(fetch('/api/checkin/feed').then(function (r) { return r.ok ? r.json() : { logs: [] }; })
          .then(function (d) {
            var logs = (d.logs || []).filter(function (l) { return !l.duplicate; });
            data.inToday = logs.length;
            var busy = {};
            logs.forEach(function (l) { if (l.court) busy[l.court] = 1; });
            data.courts = Object.keys(busy).length;
            // Signed in but not yet put on a court — the desk's actual to-do.
            data.unassigned = logs.filter(function (l) { return !l.court; }).length;
          }).catch(function () {}));
        jobs.push(fetch('/api/waitlist').then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) { data.spots = (rows || []).filter(function (s) { return s.status !== 'filled'; }).length; })
          .catch(function () {}));
      }
      var audience = (me.role === 'pro' || me.is_pro) && !me.is_management ? '?audience=pro' : '';
      jobs.push(fetch('/api/messages/unread-count' + audience).then(function (r) { return r.ok ? r.json() : { count: 0 }; })
        .then(function (d) { data.unread = d.count || 0; }).catch(function () {}));

      // Bubble temperature — a read-only glance for everyone, including pros. They
      // don't get the Bubble Monitoring page itself (deliberately trimmed from the
      // pro nav), but knowing how cold the bubble is before walking on court is
      // useful, so the number travels even where the page doesn't.
      jobs.push(fetch('/api/bubble?limit=1').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { data.temp = rows && rows[0] ? rows[0].temperature : null; })
        .catch(function () {}));

      // Next class on the courts today — the one piece of schedule a teaching pro
      // actually wants at a glance.
      jobs.push(fetch('/api/pro-schedule/slots').then(function (r) { return r.ok ? r.json() : []; })
        .then(function (slots) { data.next = nextClass(slots); }).catch(function () {}));

      return Promise.all(jobs).then(function () {
        var items = [];
        if (me.can_view_checkins) {
          items.push({ key: 'in', value: data.inToday, label: 'In Today', color: '#16a34a',
            href: '/checkins.html', title: 'Members and guests checked in today' });
          items.push({ key: 'courts', value: data.courts, label: 'Courts Busy', color: '#2c5c9c',
            href: '/checkins.html', title: data.courts + ' of ' + COURTS + ' courts have someone assigned' });
          items.push({ key: 'unassigned', value: data.unassigned, label: 'No Court Yet', color: '#dc2626',
            href: '/checkins.html', title: 'Checked in but not yet assigned to a court' });
          items.push({ key: 'spots', value: data.spots, label: 'Spots to Fill', color: '#d97706',
            href: '/waitlist.html', title: 'Academy openings still needing to be filled' });
        }
        items.push({ key: 'unread', value: data.unread, label: 'Unread Notes', color: '#6366f1',
          href: (me.role === 'pro' || me.is_pro) && !me.is_management ? '/comms.html?audience=pro' : '/comms.html',
          title: 'Unread notes in the Comm Log' });
        if (data.temp != null) {
          items.push({ key: 'temp', value: 1, text: data.temp + '°', label: 'Bubble', color: '#0ea5e9',
            href: me.can_view_checkins ? '/bubble.html' : '#', title: 'Latest logged bubble temperature' });
        }
        if (data.next) {
          items.push({ key: 'next', value: 1, text: data.next.label, label: 'Next Class', color: '#16a34a',
            href: '/pro-schedule-view.html', title: data.next.title });
        }
        mount(items);
      });
    }).catch(function () {});
  }

  function boot() {
    refresh();
    setInterval(refresh, 120000);
    try {
      var es = new EventSource('/api/events');
      es.onmessage = function () { refresh(); };
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
