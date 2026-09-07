/* Live cross-client refresh (Google-Docs style).
   A page opts in by exposing a reload function as window.onLiveUpdate
   (or a global named load / loadSlots / refresh — auto-detected below).
   On any server change broadcast over SSE, we call it — unless the user is
   actively editing a field, so a colleague's change never clobbers your typing.
   The browser auto-reconnects the EventSource if the connection drops. */
(function () {
  function isEditing() {
    var a = document.activeElement;
    if (!a) return false;
    if (a.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  function reloadFn() {
    if (typeof window.onLiveUpdate === 'function') return window.onLiveUpdate;
    if (typeof window.load === 'function') return window.load;
    if (typeof window.loadSlots === 'function') return window.loadSlots;
    if (typeof window.refresh === 'function') return window.refresh;
    return null;
  }
  try {
    var es = new EventSource('/api/events');
    es.onmessage = function () {
      var fn = reloadFn();
      if (fn && !isEditing()) { try { fn(); } catch (e) {} }
    };
    // onerror: EventSource retries automatically; nothing to do.
  } catch (e) {}
})();
