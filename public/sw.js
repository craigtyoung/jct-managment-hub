/* JCT Staff Hub — service worker (v2)
   Lesson learned: caching HTML/JS caused stale UI during active development.
   New policy:
   - HTML / JS / CSS / navigations → ALWAYS network (never stale app code).
   - Static images / fonts → cache-first (fast, safe to cache).
   - /api/* and cross-origin → passthrough, never cached.
   Bumping the cache name purges the old v1 cache on activate. */
const CACHE = 'jct-hub-v2';
const PRECACHE = ['/icon-192.png', '/icon-512.png', '/manifest.json', '/jct-logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
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
  if (url.origin !== location.origin) return;   // cross-origin (weather etc.) untouched
  if (url.pathname.startsWith('/api/')) return;  // never cache API / auth / photos

  const isAsset = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);
  if (isAsset) {
    // cache-first for static art
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  } else {
    // HTML / JS / CSS / navigations — always fresh from network
    e.respondWith(fetch(req).catch(() => caches.match('/login.html')));
  }
});
