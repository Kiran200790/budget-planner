const STATIC_CACHE_NAME = 'budget-planner-static-cache-v1.3'; // Incremented version for static assets
const DYNAMIC_CACHE_NAME = 'budget-planner-dynamic-cache-v1'; // New cache for dynamic API data
const urlsToCache = [
  '/',
  '/static/style.css',
  '/static/script.js',
  '/static/manifest.json',
  '/static/icon-192x192.png',
  '/static/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add a cache-busting query parameter to the CSS file
        return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'})));
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME]; // Add dynamic cache to whitelist
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Strategy:
  // - For API calls (/api/): Use Stale-While-Revalidate.
  //   - Serve from cache immediately if available.
  //   - In the background, fetch from the network to update the cache.
  //   - If not in cache, fetch from network and wait for the response.
  // - For all other requests (static assets): Use a robust Cache-First strategy.
  //   - Serve from cache if available.
  //   - If not in cache, fetch from network, cache the response, and then serve it.
  //   - If network fails, provide a fallback for navigation requests.

  if (event.request.url.includes('/api/')) {
    // Use Stale-While-Revalidate for API calls
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            // If we get a valid response, clone it and store it in the dynamic cache
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
          // Return cached response immediately if available, otherwise wait for network
          return response || fetchPromise;
        });
      })
    );
  } else {
    // Use Cache-First, with network fallback and dynamic caching for static assets
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        // If we have a cached response, return it
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, fetch from the network
        return fetch(event.request).then(networkResponse => {
          // If we get a valid response, cache it for future offline use
          return caches.open(STATIC_CACHE_NAME).then(cache => {
            // We need to clone the response because a response can only be consumed once
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          // If the network fetch fails (e.g., offline)
          if (event.request.mode === 'navigate') {
            // For page navigation, return the main offline page
            return caches.match('/');
          }
          // For other assets (images, etc.), we don't have a specific fallback,
          // so we let the request fail gracefully without crashing the service worker.
          return;
        });
      })
    );
  }
});
