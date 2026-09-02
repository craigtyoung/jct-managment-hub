// Shared helper: load a staff photo into an element, fall back to colour initials.
// Usage: staffAvatar(el, staffId, name, color)
// Also overlays a small role badge (e.g. "M" for the maintenance contractor) on any
// staff who has one — fetched once from /api/staff/badges and cached.

// Cache the badge map as a promise so concurrent avatar renders share one request.
window.__staffBadges = window.__staffBadges || null;
function __loadBadges() {
  if (!window.__staffBadges) {
    window.__staffBadges = fetch('/api/staff/badges')
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
  }
  return window.__staffBadges;
}

function __applyBadge(el, staffId) {
  __loadBadges().then(map => {
    const letter = map && map[staffId];
    if (!letter) return;
    if (el.querySelector('.staff-badge')) return; // already applied
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const size = Math.max(11, Math.round((el.offsetWidth || 32) * 0.42));
    const b = document.createElement('span');
    b.className = 'staff-badge';
    b.textContent = letter;
    b.style.cssText =
      `position:absolute;bottom:-2px;right:-2px;width:${size}px;height:${size}px;` +
      `border-radius:50%;background:#0d9488;color:#fff;border:2px solid #fff;` +
      `display:flex;align-items:center;justify-content:center;` +
      `font-size:${Math.max(7, Math.round(size * 0.6))}px;font-weight:700;line-height:1;` +
      `font-family:'Inter',sans-serif;z-index:2;pointer-events:none;`;
    el.appendChild(b);
  });
}

window.staffAvatar = function(el, staffId, name, color, bust) {
  if (!el) return;
  const base = `/api/staff/${staffId}/photo`;
  // Show initials immediately so the slot is never empty (prevents the blank
  // flash during navigation / Railway cold-starts), then load the photo over it.
  el.textContent = (name || '?').slice(0, 2).toUpperCase();
  el.style.background = (color || '#666') + '28';
  el.style.color = color || '#666';
  let tries = 0;
  (function load(url) {
    const img = new Image();
    img.onload = function() {
      el.innerHTML = '';
      el.textContent = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;';
      el.style.padding = '0';
      el.appendChild(img);
      __applyBadge(el, staffId);
    };
    img.onerror = function() {
      // Transient failure (cold start / dropped request) — retry twice with backoff.
      // A genuine 404 just leaves the initials already showing.
      if (tries < 2) { tries++; setTimeout(function() { load(base + '?r=' + tries); }, 700 * tries); }
      else { __applyBadge(el, staffId); } // no photo → still badge the initials
    };
    img.src = url;
  })(bust ? base + '?t=' + Date.now() : base);
  __applyBadge(el, staffId); // apply immediately for the initials state too
};

// Hide management-only chrome (e.g. the Settings link) from non-management users.
// Runs once per page load; safe pre-auth (fetch 401 → no-op).
(function () {
  fetch('/api/me')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (me && !me.is_management) {
        document.querySelectorAll('.mgmt-only').forEach(function (el) { el.style.display = 'none'; });
      }
    })
    .catch(function () {});
})();

// ── TEMPORARY shared "View as" dev widget ───────────────────────────────────
// Injects a compact floating control on every page for allow-listed testers
// (Craig, Jaime, Victor — see db.js VIEW_AS_TESTER_IDS). Lets them view the hub
// as any staff member while testing. Skips comms.html, which has its own inline
// control. Remove this block + the db.js allowlist when testing wraps.
(function () {
  if (document.getElementById('viewas-wrap')) return; // comms page owns its control
  Promise.all([
    fetch('/api/me').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch('/api/auth/staff').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
  ]).then(function (arr) {
    var me = arr[0], staff = arr[1] || [];
    if (!me || !me.can_view_as) return;
    if (document.getElementById('global-viewas')) return;
    var active = !!me.viewing_as;

    var box = document.createElement('div');
    box.id = 'global-viewas';
    box.style.cssText =
      'position:fixed;top:8px;right:10px;z-index:9999;display:flex;align-items:center;gap:7px;' +
      'padding:5px 9px;border-radius:10px;font-family:Inter,system-ui,sans-serif;font-size:12px;' +
      'box-shadow:0 3px 12px rgba(0,0,0,0.14);' +
      (active ? 'background:#f59e0b;color:#241a00;border:1px solid #d98c07;'
              : 'background:#fff;color:#334155;border:1px solid #e2e8f0;');

    var label = document.createElement('span');
    label.textContent = active ? ('👁 Viewing as ' + (me.name || '')) : '👁 View as';
    label.style.cssText = 'font-weight:700;white-space:nowrap;';

    var sel = document.createElement('select');
    sel.style.cssText =
      'font-family:inherit;font-size:12px;padding:3px 6px;border-radius:7px;cursor:pointer;max-width:150px;' +
      'color:#1e293b;border:1px solid ' + (active ? '#b8790a' : '#cbd5e1') + ';' +
      'background:' + (active ? '#fff7e6' : '#f8fafc') + ';';
    var opts = '<option value="">Yourself (' + (me.real_name || 'me') + ')</option>';
    staff.filter(function (s) { return s.id !== me.real_id; }).forEach(function (s) {
      opts += '<option value="' + s.id + '">' + s.name + ' · ' + s.role + '</option>';
    });
    sel.innerHTML = opts;
    sel.value = active ? String(me.id) : '';
    function switchTo(v) {
      fetch('/api/auth/view-as', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: v === '' || v === null ? null : parseInt(v) })
      }).then(function (r) { if (r.ok) location.reload(); });
    }
    sel.onchange = function () { switchTo(this.value); };

    box.appendChild(label);
    box.appendChild(sel);
    if (active) {
      var exit = document.createElement('button');
      exit.textContent = 'Exit';
      exit.style.cssText =
        'font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;border:none;' +
        'border-radius:7px;padding:3px 10px;background:rgba(0,0,0,0.22);color:#241a00;';
      exit.onclick = function () { switchTo(null); };
      box.appendChild(exit);
    }
    document.body.appendChild(box);
  });
})();
