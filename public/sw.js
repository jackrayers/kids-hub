// Minimal service worker: makes the app installable and keeps the shell
// available on flaky Wi-Fi. API calls always go to the network.
const CACHE = 'kids-hub-v15';
const SHELL = ['/', '/pair/', '/shared/ui.css', '/shared/api.js', '/shared/whimsy.js', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // Network first, cache fallback.
  event.respondWith(
    // Page loads can't take extra fetch options; other files always revalidate with the server.
    (event.request.mode === 'navigate' ? fetch(event.request) : fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        if (res.ok && !url.pathname.startsWith('/img/')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});

// Grown-up alerts (Web Push). The server encrypts { title, body, url, tag, image }.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Kids Hub', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    image: d.image,
    tag: d.tag,
    data: { url: d.url || '/admin/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).pathname.startsWith('/admin'));
    if (open) return open.focus().then((c) => (c && c.navigate ? c.navigate(url) : c));
    return self.clients.openWindow(url);
  }));
});
