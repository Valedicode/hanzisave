const CACHE = "hanzisave-v1";
const PRECACHE = ["/", "/manifest.json", "/lexicon.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first for the app shell/lexicon; network-first for everything else
// (notably /api/gloss, which must never be served stale).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (PRECACHE.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  );
});
