/**
 * service-worker.js — PWA Offline-First para "Mi Gimnasio"
 * 
 * Estrategias:
 * - Network First para el shell (HTML, CSS, JS) para tener siempre la última versión si hay red,
 *   con fallback instantáneo al cache en sótanos de gimnasio sin señal.
 * - Cache First para activos estáticos (íconos, fuentes).
 * - Versionado sincronizado con APP_VERSION de app.js.
 */

const CACHE_VERSION = 'v3.2.0';
const CACHE_NAME = `migimnasio-shell-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `migimnasio-static-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/engine.js',
  './js/store.js',
  './js/timer.js',
  './js/app.js'
];

// 1. Instalación: cachear shell inicial
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activación: purgar cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== STATIC_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Interceptación de peticiones (Fetch)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignorar esquemas no HTTP/HTTPS (ej. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Activos estáticos de fuentes o íconos -> Cache First
  if (url.pathname.includes('/icons/') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Shell y scripts de la app -> Network First con fallback a Cache
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En el sótano sin señal: responder desde la caché
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Si pedían una navegación HTML, retornar el index.html cacheado
          if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline: Sin conexión y recurso no cacheado', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
