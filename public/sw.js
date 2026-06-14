// Sight Manager — Service Worker
// Handles push notifications + offline caching

// (Jun 2026) Bumped v2 → v3 so the activate handler purges the old cache,
// which could be holding a stale /live cabin page or pre-deploy chunks.
const CACHE_NAME = "sm-cache-v3";

// ─── Push Notifications ───

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Sight Manager";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: {
      url: data.url || "/tasks",
    },
    tag: data.tag || "default",
    renotify: !!data.renotify,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/tasks";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});

// ─── Offline Caching ───

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-only for mutations
  if (request.method !== "GET") return;

  // (Jun 2026) The live wall-cabin board (/live/<token>) must NEVER show a
  // stale cached copy. The network-first-with-cache-fallback below was
  // serving an old cached cabin page on flaky site WiFi — Keith saw "an old
  // version for some sites". Bypass the SW entirely for /live so the cabin is
  // always a direct, fresh network fetch; its own 5-min reload handles
  // retries when the connection drops.
  if (url.pathname.startsWith("/live/")) return;

  // Cache-first for immutable static assets (content-hashed filenames)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for API requests (always get fresh data, cache for offline)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: "Offline" }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          })
        )
    );
    return;
  }

  // Network-first for page navigations and RSC requests
  // (HTML pages reference build-specific chunk URLs, so must stay fresh)
  const isNavigation = request.headers.get("accept")?.includes("text/html");
  const isRSC = url.searchParams.has("_rsc") ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-state-tree");

  if (isNavigation || isRSC) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              "<html><body><h1>Offline</h1><p>You are offline. Please reconnect to continue.</p></body></html>",
              {
                status: 503,
                headers: { "Content-Type": "text/html" },
              }
            );
          })
        )
    );
    return;
  }
});
