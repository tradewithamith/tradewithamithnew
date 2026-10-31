try {
  importScripts('./push-handler.js');
} catch {
  // Fallback if imported in an environment where push-handler.js isn't preloaded yet
}

const CACHE_NAME = 'trade-with-amith-v3';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/terms.html',
  '/privacy.html',
  '/manifest.json?v=twa3',
  '/icon.svg?v=twa3',
  '/favicon.png?v=twa3',
  '/pwa-192x192.png?v=twa3',
  '/pwa-512x512.png?v=twa3',
  '/pwa-maskable-512x512.png?v=twa3',
  '/apple-touch-icon.png?v=twa3',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
