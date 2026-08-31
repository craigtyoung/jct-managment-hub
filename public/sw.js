/* JCT Staff Hub — service worker
   Network-first for same-origin GETs so data stays live; falls back to cache
   offline. API/auth calls are never cached. Cross-origin (e.g. weather) is
   left untouched. */
const CACHE = 'jct-hub-v1';
const SHELL = [
  '/login.html',
  '/hub.html',
  '/jct-logo.png',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // let cross-origin (weather API) pass through
  if (url.pathname.startsWith('/api/')) return;    // never cache API / auth — always live

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/login.html')))
  );
});
