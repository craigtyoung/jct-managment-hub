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
