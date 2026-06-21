const CACHE = "aiea-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config/config.js",
  "./config/sync-config.js",
  "./js/utils.js",
  "./js/storage.js",
  "./js/sync.js",
  "./js/notifications.js",
  "./js/phone-call.js",
  "./js/weather.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.search) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow("./");
    })
  );
});
