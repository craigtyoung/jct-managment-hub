// Shared helper: load a staff photo into an element, fall back to colour initials.
// Usage: staffAvatar(el, staffId, name, color)
window.staffAvatar = function(el, staffId, name, color, bust) {
  if (!el) return;
  const img = new Image();
  img.onload = function() {
    el.textContent = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;';
    el.style.padding = '0';
    el.appendChild(img);
  };
  img.onerror = function() {
    el.innerHTML = '';
    el.textContent = (name || '?').slice(0, 2).toUpperCase();
    el.style.background = (color || '#666') + '28';
    el.style.color = color || '#666';
  };
  img.src = `/api/staff/${staffId}/photo${bust ? '?t=' + Date.now() : ''}`;
};
