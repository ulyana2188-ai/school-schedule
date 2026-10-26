// Service Worker for Интеллект-плюс PWA
const CACHE_VER = "v4";
const STATIC_CACHE  = `ip-static-${CACHE_VER}`;
const API_CACHE     = `ip-api-${CACHE_VER}`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/manifest.json",
];

// API routes to cache (stale-while-revalidate)
// Only safe GET endpoints that don't carry sensitive tokens in the path
const API_CACHE_PATHS = [
  "/api/schedule",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET
  if (event.request.method !== "GET") return;

  // API: stale-while-revalidate for whitelisted paths, skip others
  if (url.pathname.startsWith("/api/")) {
    const shouldCache = API_CACHE_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + "?"));
    if (shouldCache) {
      event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
    }
    // Other API calls: pass through (no cache)
    return;
  }

  // Static assets: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Start network fetch in background regardless
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  return cached || fetchPromise;
}

// Push notification handler
self.addEventListener("push", (event) => {
  let data = { title: "Интеллект-плюс", body: "Новое уведомление", icon: "/icon-192.png" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icon-192.png",
      badge: "/icon-96.png",
      vibrate: [200, 100, 200],
      tag: data.tag || "ip-notification",
      data: { url: data.url || "/" },
    })
  );
});

// Notification click: open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
