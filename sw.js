/* NOTIGAS SERVICE WORKER v136.0 - CACHE PROGRESIVO Y MODO OFFLINE */
const CACHE_NAME = 'notigas-cache-v136';

// Mantener el precache inicial deliberadamente pequeño. La página principal ya
// descarga sus módulos durante el primer render; volver a pedir todos los JS con
// cache:'reload' durante install duplicaba tráfico y competía con el arranque.
// El resto de recursos se incorpora al cache progresivamente al ser utilizado.
const ASSETS_TO_CACHE = [
  './index.html',
  './styles/main.css?v=135',
  './icons/camion_dina_rojo.svg',
  './icons/garrafa_red_clean.svg',
  './icons/garrafa_red-192.png',
  './icons/garrafa_red-512.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
      ASSETS_TO_CACHE.map((asset) => fetch(asset)
        .then((response) => {
          if (response.ok) return cache.put(asset, response);
          console.warn('SW: No se pudo cachear:', asset);
          return null;
        })
        .catch((err) => console.warn('SW: Error cacheando:', asset, err)))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((cache) => cache !== CACHE_NAME ? caches.delete(cache) : Promise.resolve(false))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
  const isNavigation = event.request.mode === 'navigate' || acceptsHtml;

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate: respuesta inmediata desde cache y renovación
        // en segundo plano sin bloquear la interacción del usuario.
        fetch(event.request, { cache: 'no-cache' }).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      });
    })
  );
});