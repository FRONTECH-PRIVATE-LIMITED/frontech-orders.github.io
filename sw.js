// Keeps the app shell (this page + icons) on the phone so the app opens instantly.
// Business data never passes through here: the app talks to the central database (Supabase) directly.
const CACHE = 'ft-shell-v4';
const SHELL = ['./', './index.html', './app.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;             // database traffic goes straight to Supabase
  e.respondWith(
    fetch(e.request).then(r => {                          // network first, so updates show at once
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

// ---------------------------------------------------------------- phone pop-up notifications (web push)
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { title: 'FT Orders', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(m.title || 'FT Orders', {
      body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: './icon-192.png', badge: './favicon.png',
      data: { no: m.no || '', status: /^order-/.test(m.tag || '') },
    });
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ type: 'pushed' }));                 // an open app refreshes its bell at once
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = cs.find(c => /\/app\.html/.test(new URL(c.url).pathname));
    const top = cs.find(c => c.frameType === 'top-level') || cs[0];
    if (app && top) {                                                   // app already open: bring it up and open the order
      try { await top.focus(); } catch (x) { }
      if (d.no) app.postMessage({ type: 'openOrder', no: d.no, status: d.status });
      return;
    }
    await self.clients.openWindow('./' + (d.no ? '?order=' + encodeURIComponent(d.no) : ''));
  })());
});
