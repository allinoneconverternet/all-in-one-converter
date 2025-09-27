const CACHE_VERSION = "v1-2025-09-26";
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/js/related-conversions.js",
  "/js/ffmpeg-worker-client.js",
  "/vendor/ffmpeg/ffmpeg-core.wasm",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => (k.startsWith("precache-") || k.startsWith("runtime-")) && k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const dest = req.destination;

  if (req.mode === "navigate" || dest === "document") {
    event.respondWith(networkFirst(req));
    return;
  }

  if (dest === "wasm" || req.url.includes("/vendor/ffmpeg/ffmpeg-core.wasm")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (dest === "script" || dest === "style" || dest === "worker") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (dest === "image" || dest === "font") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("/index.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(RUNTIME);
  cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || fetchPromise || fetch(request).catch(() => cached);
}
