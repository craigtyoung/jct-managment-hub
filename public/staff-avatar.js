// Shared helper: load a staff photo into an element, fall back to colour initials.
// Usage: staffAvatar(el, staffId, name, color)
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
    };
    img.onerror = function() {
      // Transient failure (cold start / dropped request) — retry twice with backoff.
      // A genuine 404 just leaves the initials already showing.
      if (tries < 2) { tries++; setTimeout(function() { load(base + '?r=' + tries); }, 700 * tries); }
    };
    img.src = url;
  })(bust ? base + '?t=' + Date.now() : base);
};
