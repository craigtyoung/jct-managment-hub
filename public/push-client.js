/* JCT Staff Hub — push notification client helper.
   window.jctPush.enable() runs the full subscribe flow (must be triggered by a
   user gesture); .status() reports the current state for toggling UI. */
(function () {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  const supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  // On iOS, web push only works when the PWA is installed to the Home Screen.
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  async function enable() {
    if (!supported) return { ok: false, reason: 'unsupported' };
    if (isIOS && !isStandalone) return { ok: false, reason: 'ios-install' };
    let perm = Notification.permission;
    if (perm !== 'granted') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    const reg = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;
    const res = await fetch('/api/push/vapid-public-key');
    const { key } = await res.json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) });
    return { ok: true };
  }

  async function disable() {
    if (!supported) return { ok: false };
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
    if (reg) { const sub = await reg.pushManager.getSubscription(); if (sub) { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); } }
    return { ok: true };
  }

  async function status() {
    if (!supported) return 'unsupported';
    if (isIOS && !isStandalone) return 'ios-install';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
    if (!reg) return 'off';
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  }

  window.jctPush = { enable, disable, status, supported, isIOS, isStandalone };
})();
