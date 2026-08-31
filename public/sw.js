/* Self-destructing service worker.
   Earlier versions cached HTML/JS and caused stale pages to persist across
   deploys. This version removes itself and wipes all caches so every request
   goes straight to the network — always fresh. The pages no longer register a
   service worker, so once this cleans up, none comes back. (PWA offline can be
   re-added deliberately later, once the app has stabilised.) */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url)); // force one fresh reload
    } catch (e) { /* best effort */ }
  })());
});
/* No fetch handler on purpose — nothing is intercepted or cached. */
