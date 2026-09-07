const SHELL_CACHE = 'glen-growth-shell-v3-final-20260907';
const NAVIGATION_TIMEOUT_MS = 4500;

const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './money.js',
  './wins.js',
  './streak.js',
  './pwa-v2.js',
  './offline-queue-v2.js',
  './offline-timestamp.js',
  './hardening-v1.js',
  './manifest.webmanifest',
  './icon.svg',
  './GGIcon.jpeg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('glen-growth-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  event.respondWith(assetNetworkFirst(request));
});

async function navigationNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (response && response.ok) {
      cache.put('./index.html', response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const exact = await cache.match(request, { ignoreSearch: true });
    if (exact) return exact;

    const fallback = await cache.match('./index.html', { ignoreSearch: true });
    if (fallback) return fallback;

    throw error;
  }
}

async function assetNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Navigation network timeout')), timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
