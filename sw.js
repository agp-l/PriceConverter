const CACHE = 'priceconverter-shell-v2';
const SHELL = ['./','./index.html','./style.css','./app.js','./rates.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Use fresh app files when connected; retain the latest successful response
  // for offline visits, including updates that don't change this worker file.
  event.respondWith(fetch(request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    return cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  }));
});
