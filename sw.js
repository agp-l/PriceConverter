const CACHE = 'priceconverter-shell-v27';
const SHELL = ['./','./index.html','./style.css','./app.js','./rates.js','./quotes.js','./currencies.js','./i18n.js',
  './locales/sk.js','./locales/es.js','./locales/pl.js','./locales/de.js','./locales/fr.js','./locales/pt.js',
  './locales/ru.js','./locales/uk.js','./locales/sv.js','./locales/nb.js','./locales/eo.js',
  './manifest.json','./icon.svg','./icon-192.png','./icon-512.png'];
const SHELL_URLS = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('priceconverter-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const isShell = SHELL_URLS.has(request.url);
  if (!isShell && request.mode !== 'navigate') return;
  // Only cache this app's files. Other paths on the same host belong to their owners.
  event.respondWith(fetch(request).then(async response => {
    if (response.ok && isShell) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const cached = isShell ? await cache.match(request) : null;
    return cached || (request.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});
