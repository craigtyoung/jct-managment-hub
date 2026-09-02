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
      if (!me) return;
      // First-login guard: no access to any page until a private password is set.
      if (me.must_set_password && location.pathname.indexOf('set-password') < 0) { location.href = '/set-password.html'; return; }
      if (!me.is_management) {
        document.querySelectorAll('.mgmt-only').forEach(function (el) { el.style.display = 'none'; });
      }
      // Reveal the tighter manager-only chrome (Staff Management / pay) for the allowlist.
      if (me.can_manage_staff) {
        document.querySelectorAll('.staffmgmt-only').forEach(function (el) { el.style.display = ''; });
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
      'position:fixed;top:60px;right:10px;z-index:9999;display:flex;align-items:center;gap:7px;' +
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

// ── Shared self-service Account panel ───────────────────────────────────────
// Any logged-in staff member can change their own photo and password. Entry is
// their avatar — bottom-left on desktop, top-left on mobile (clear of the bottom
// nav). Always acts on the REAL account, even while in dev "View as" mode.
(function () {
  if (document.getElementById('jct-acct-menu')) return;
  fetch('/api/me')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me) return; // not logged in (e.g. login page) → no account entry
      var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      var myId = me.real_id, myName = me.real_name, myRole = me.real_role, myColor = me.real_color || '#2c5c9c';

      // Styles (injected once; media query handles desktop vs mobile placement).
      var st = document.createElement('style');
      st.textContent =
        '#jct-acct-fab{position:fixed;left:12px;bottom:14px;z-index:9998;width:42px;height:42px;border-radius:50%;' +
        'border:2px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.22);cursor:pointer;overflow:hidden;padding:0;' +
        'background:' + myColor + ';color:#fff;font-family:Inter,sans-serif;font-weight:700;font-size:14px;' +
        'display:flex;align-items:center;justify-content:center;}' +
        '@media(max-width:820px){#jct-acct-fab{bottom:auto;top:8px;left:10px;width:36px;height:36px;font-size:12px;}}' +
        '#jct-acct-menu{display:none;position:fixed;z-index:10001;min-width:172px;background:#fff;border:1px solid #e2e8f0;' +
        'border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.18);overflow:hidden;font-family:Inter,system-ui,sans-serif;}' +
        '#jct-acct-menu.open{display:block;}' +
        '.jct-menu-hdr{padding:11px 14px;border-bottom:1px solid #eef2f7;}' +
        '.jct-menu-hdr .nm{font-size:13px;font-weight:700;color:#1e293b;}' +
        '.jct-menu-hdr .rl{font-size:11px;color:#64748b;text-transform:capitalize;}' +
        '.jct-menu-item{display:flex;align-items:center;gap:9px;width:100%;padding:10px 14px;background:transparent;border:none;' +
        'cursor:pointer;font-family:inherit;font-size:13.5px;color:#334155;text-align:left;}' +
        '.jct-menu-item:hover{background:#f1f5f9;}' +
        '.jct-menu-item.danger{color:#dc2626;border-top:1px solid #eef2f7;}' +
        '#jct-acct-overlay{display:none;position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.55);' +
        'align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;}' +
        '#jct-acct-overlay.open{display:flex;}' +
        '.jct-acct-card{width:100%;max-width:420px;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,0.35);' +
        'overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#1e293b;animation:jct-acct-in .16s ease-out;}' +
        '@keyframes jct-acct-in{from{opacity:0;transform:translateY(-8px) scale(.98);}to{opacity:1;transform:none;}}' +
        '.jct-acct-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #eef2f7;}' +
        '.jct-acct-av{width:46px;height:46px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;' +
        'justify-content:center;font-weight:700;font-size:16px;}' +
        '.jct-acct-head h3{margin:0;font-size:16px;font-weight:700;}' +
        '.jct-acct-head p{margin:2px 0 0;font-size:12px;color:#64748b;text-transform:capitalize;}' +
        '.jct-acct-x{margin-left:auto;background:transparent;border:none;color:#94a3b8;font-size:20px;cursor:pointer;' +
        'padding:4px 8px;border-radius:8px;line-height:1;}' +
        '.jct-acct-x:hover{background:#f1f5f9;color:#1e293b;}' +
        '.jct-acct-sec{padding:16px 20px;border-bottom:1px solid #eef2f7;}' +
        '.jct-acct-sec:last-child{border-bottom:none;}' +
        '.jct-acct-sec h4{margin:0 0 10px;font-size:13px;font-weight:700;color:#334155;letter-spacing:.02em;}' +
        '.jct-acct-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}' +
        '.jct-acct-input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:9px;' +
        'font-family:inherit;font-size:14px;color:#1e293b;outline:none;margin-bottom:8px;}' +
        '.jct-acct-input:focus{border-color:#2c5c9c;}' +
        '.jct-acct-btn2{background:#2c5c9c;color:#fff;border:none;border-radius:9px;padding:9px 16px;font-family:inherit;' +
        'font-size:14px;font-weight:600;cursor:pointer;}' +
        '.jct-acct-btn2:disabled{opacity:.5;cursor:default;}' +
        '.jct-acct-ghost{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:9px;padding:9px 14px;' +
        'font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;}' +
        '.jct-acct-msg{font-size:12px;margin-top:6px;min-height:16px;}' +
        '.jct-acct-msg.ok{color:#0d9488;}.jct-acct-msg.err{color:#dc2626;}' +
        '.jct-acct-preview{width:56px;height:56px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;' +
        'align-items:center;justify-content:center;font-weight:700;font-size:18px;}';
      document.head.appendChild(st);

      // Dropdown menu (Profile / Sign out).
      var menu = document.createElement('div');
      menu.id = 'jct-acct-menu';
      menu.innerHTML =
        '<div class="jct-menu-hdr"><div class="nm">' + esc(myName) + '</div><div class="rl">' + esc(myRole) + '</div></div>' +
        '<button class="jct-menu-item" id="jct-menu-profile"><span>👤</span> Profile</button>' +
        '<button class="jct-menu-item danger" id="jct-menu-signout"><span>⎋</span> Sign out</button>';
      document.body.appendChild(menu);

      // Prefer an existing on-page avatar as the entry point; only fall back to a
      // floating avatar button on pages that have none (avoids a duplicate avatar).
      var anchorEl = null, sels = ['#nav-avatar', '#me-av', '#me-avatar'];
      for (var ai = 0; ai < sels.length; ai++) { var cand = document.querySelector(sels[ai]); if (cand) { anchorEl = cand; break; } }
      if (!anchorEl) {
        anchorEl = document.createElement('button');
        anchorEl.id = 'jct-acct-fab';
        anchorEl.title = 'Your account';
        anchorEl.setAttribute('aria-label', 'Your account');
        document.body.appendChild(anchorEl);
        if (window.staffAvatar) staffAvatar(anchorEl, myId, myName, myColor);
        else anchorEl.textContent = (myName || '?').slice(0, 2).toUpperCase();
      } else {
        anchorEl.style.cursor = 'pointer';
        anchorEl.title = 'Account';
      }

      // Overlay + card.
      var ov = document.createElement('div');
      ov.id = 'jct-acct-overlay';
      ov.innerHTML =
        '<div class="jct-acct-card" role="dialog" aria-modal="true" aria-label="Account">' +
          '<div class="jct-acct-head">' +
            '<div class="jct-acct-av" id="jct-acct-headav" style="background:' + esc(myColor) + '28;color:' + esc(myColor) + '">' + esc((myName || '?').slice(0, 2).toUpperCase()) + '</div>' +
            '<div><h3>' + esc(myName) + '</h3><p>' + esc(myRole) + '</p></div>' +
            '<button class="jct-acct-x" id="jct-acct-close" aria-label="Close">&#10005;</button>' +
          '</div>' +
          '<div class="jct-acct-sec">' +
            '<h4>PROFILE PHOTO</h4>' +
            '<div class="jct-acct-row">' +
              '<div class="jct-acct-preview" id="jct-acct-prev" style="background:' + esc(myColor) + '28;color:' + esc(myColor) + '">' + esc((myName || '?').slice(0, 2).toUpperCase()) + '</div>' +
              '<button class="jct-acct-ghost" id="jct-acct-choose" type="button">Choose photo</button>' +
              '<button class="jct-acct-btn2" id="jct-acct-savephoto" type="button" disabled>Save photo</button>' +
              '<input type="file" id="jct-acct-file" accept="image/*" style="display:none">' +
            '</div>' +
            '<div class="jct-acct-msg" id="jct-acct-photomsg"></div>' +
          '</div>' +
          '<div class="jct-acct-sec">' +
            '<h4>CHANGE PASSWORD</h4>' +
            '<input class="jct-acct-input" id="jct-acct-cur" type="password" placeholder="Current password" autocomplete="current-password">' +
            '<input class="jct-acct-input" id="jct-acct-new" type="password" placeholder="New password" autocomplete="new-password">' +
            '<input class="jct-acct-input" id="jct-acct-conf" type="password" placeholder="Confirm new password" autocomplete="new-password">' +
            '<button class="jct-acct-btn2" id="jct-acct-savepw" type="button">Update password</button>' +
            '<div class="jct-acct-msg" id="jct-acct-pwmsg"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      function openAcct() { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
      function closeAcct() { ov.classList.remove('open'); document.body.style.overflow = ''; }

      // Position the menu next to the avatar (below if the avatar is up top, above if it's near the bottom).
      function positionMenu(el) {
        var r = el.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 188)) + 'px';
        if (r.top < window.innerHeight / 2) { menu.style.top = (r.bottom + 6) + 'px'; menu.style.transform = 'none'; }
        else { menu.style.top = (r.top - 6) + 'px'; menu.style.transform = 'translateY(-100%)'; }
      }
      anchorEl.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        if (menu.classList.contains('open')) { menu.classList.remove('open'); }
        else { positionMenu(anchorEl); menu.classList.add('open'); }
      });
      document.addEventListener('click', function (e) {
        if (menu.classList.contains('open') && !menu.contains(e.target) && e.target !== anchorEl) menu.classList.remove('open');
      });
      document.getElementById('jct-menu-profile').onclick = function () { menu.classList.remove('open'); openAcct(); };
      document.getElementById('jct-menu-signout').onclick = function () {
        fetch('/api/auth/logout', { method: 'POST' }).then(function () { location.href = '/login.html'; }).catch(function () { location.href = '/login.html'; });
      };
      document.getElementById('jct-acct-close').onclick = closeAcct;
      ov.addEventListener('click', function (e) { if (e.target === ov) closeAcct(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('open')) closeAcct(); });

      // Photo choose → preview → save.
      var chosenFile = null;
      var fileInput = document.getElementById('jct-acct-file');
      document.getElementById('jct-acct-choose').onclick = function () { fileInput.click(); };
      fileInput.onchange = function () {
        var f = fileInput.files && fileInput.files[0];
        var msg = document.getElementById('jct-acct-photomsg');
        if (!f) return;
        if (!f.type || f.type.indexOf('image/') !== 0) { msg.className = 'jct-acct-msg err'; msg.textContent = 'Please choose an image file.'; return; }
        if (f.size > 5 * 1024 * 1024) { msg.className = 'jct-acct-msg err'; msg.textContent = 'Image must be under 5 MB.'; return; }
        chosenFile = f; msg.textContent = '';
        var reader = new FileReader();
        reader.onload = function (ev) {
          var prev = document.getElementById('jct-acct-prev');
          prev.innerHTML = '';
          prev.style.background = 'transparent';
          var img = document.createElement('img');
          img.src = ev.target.result;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          prev.appendChild(img);
        };
        reader.readAsDataURL(f);
        document.getElementById('jct-acct-savephoto').disabled = false;
      };
      document.getElementById('jct-acct-savephoto').onclick = function () {
        var msg = document.getElementById('jct-acct-photomsg');
        if (!chosenFile) return;
        var saveBtn = this; saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
        var fd = new FormData(); fd.append('photo', chosenFile);
        fetch('/api/staff/' + myId + '/photo', { method: 'POST', body: fd })
          .then(function (r) {
            if (r.ok) { msg.className = 'jct-acct-msg ok'; msg.textContent = 'Photo updated. Refreshing...'; setTimeout(function () { location.reload(); }, 700); }
            else { msg.className = 'jct-acct-msg err'; msg.textContent = 'Upload failed. Try again.'; saveBtn.disabled = false; saveBtn.textContent = 'Save photo'; }
          })
          .catch(function () { msg.className = 'jct-acct-msg err'; msg.textContent = 'Connection error.'; saveBtn.disabled = false; saveBtn.textContent = 'Save photo'; });
      };

      // Change password.
      document.getElementById('jct-acct-savepw').onclick = function () {
        var cur = document.getElementById('jct-acct-cur').value;
        var nw = document.getElementById('jct-acct-new').value;
        var conf = document.getElementById('jct-acct-conf').value;
        var msg = document.getElementById('jct-acct-pwmsg');
        if (!cur || !nw) { msg.className = 'jct-acct-msg err'; msg.textContent = 'Fill in your current and new password.'; return; }
        if (nw.length < 4) { msg.className = 'jct-acct-msg err'; msg.textContent = 'New password must be at least 4 characters.'; return; }
        if (nw !== conf) { msg.className = 'jct-acct-msg err'; msg.textContent = 'New passwords do not match.'; return; }
        var b = this; b.disabled = true; b.textContent = 'Updating...';
        fetch('/api/auth/change-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        }).then(function (r) {
          b.disabled = false; b.textContent = 'Update password';
          if (r.ok) {
            msg.className = 'jct-acct-msg ok'; msg.textContent = 'Password updated.';
            document.getElementById('jct-acct-cur').value = '';
            document.getElementById('jct-acct-new').value = '';
            document.getElementById('jct-acct-conf').value = '';
          } else if (r.status === 401) {
            msg.className = 'jct-acct-msg err'; msg.textContent = 'Current password is incorrect.';
          } else {
            msg.className = 'jct-acct-msg err'; msg.textContent = 'Could not update password.';
          }
        }).catch(function () {
          b.disabled = false; b.textContent = 'Update password';
          msg.className = 'jct-acct-msg err'; msg.textContent = 'Connection error.';
        });
      };
    })
    .catch(function () {});
})();

// ── Mobile nav trim ─────────────────────────────────────────────────────────
// The phone experience is intentionally scaled down: hide Cash Summary,
// Timesheets, Bubble Monitoring and Contractor from the mobile "More" sheet
// (those are done on a computer), and make sure Wait Lists is reachable there.
// Desktop keeps the full sidebar; this only touches the mobile bottom-nav sheet.
(function () {
  var st = document.createElement('style');
  st.textContent =
    '@media(max-width:820px){' +
    '.mnav-sheet-link[href="/cash-summary.html"],' +
    '.mnav-sheet-link[href="/timesheet.html"],' +
    '.mnav-sheet-link[href="/bubble.html"],' +
    '.mnav-sheet-link[href="/contractor.html"]{display:none!important;}}';
  document.head.appendChild(st);
  function ensureWaitlist() {
    var sheet = document.querySelector('.mnav-sheet');
    if (!sheet || sheet.querySelector('a[href="/academy.html"]')) return;
    var a = document.createElement('a');
    a.href = '/academy.html';
    a.className = 'mnav-sheet-link';
    a.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">' +
      '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>' +
      '<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Wait Lists';
    var title = sheet.querySelector('.mnav-sheet-title');
    if (title && title.nextSibling) sheet.insertBefore(a, title.nextSibling);
    else sheet.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureWaitlist);
  else ensureWaitlist();
})();
