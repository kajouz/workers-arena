/**
 * Offline Cache Service Worker
 * 
 * This file runs as a Web Worker (service worker context).
 * It should NOT be imported in regular app code.
 * 
 * Provides offline support for the mobile app:
 * - Cache static assets
 * - Cache API responses
 * - Background sync for offline actions
 * - Push notification handling
 */

// Service Worker types are declared globally
declare const self: ServiceWorkerGlobalScope;

// ─── Cache Configuration ───────────────────────────────────────────

const CACHE_NAME = "workersarena-v1";
const STATIC_CACHE = "workersarena-static-v1";
const API_CACHE = "workersarena-api-v1";
const PAGES_CACHE = "workersarena-pages-v1";

const STATIC_ASSETS = [
  "/",
  "/search",
  "/dashboard",
  "/bookings",
  "/notifications",
  "/offline.html",
];

// ─── Install Event ─────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// ─── Activate Event ────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE && name !== PAGES_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  
  // Claim all clients immediately
  self.clients.claim();
});

// ─── Fetch Event ───────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response before caching
          const responseClone = response.clone();
          caches.open(API_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets - Cache first, fallback to network
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // HTML pages - Network first, fallback to cache
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(PAGES_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match("/offline.html");
          });
        })
    );
    return;
  }

  // Default - Network first
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// ─── Push Notification Handling ────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  
  const options: NotificationOptions = {
    body: data.body,
    icon: data.icon || "/icons/icon-192x192.png",
    badge: data.badge || "/icons/badge-72x72.png",
    image: data.image,
    data: data.data,
    actions: data.actions,
    tag: data.tag || "workersarena-notification",
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  
  // Handle notification actions
  if (event.action) {
    switch (event.action) {
      case "view-booking":
        event.waitUntil(
          self.clients.openWindow(`/bookings/${data.bookingId}`)
        );
        break;
      case "reply":
        event.waitUntil(
          self.clients.openWindow(`/chat/${data.bookingId}`)
        );
        break;
      case "dismiss":
        // Just close the notification
        break;
      default:
        // Open the app
        event.waitUntil(
          self.clients.openWindow("/")
        );
    }
  } else {
    // Default action - open the app
    event.waitUntil(
      self.clients.openWindow("/")
    );
  }
});

// ─── Message Handling ──────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (!event.data) return;

  const { type } = event.data;

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;
    case "CLEAR_CACHE":
      event.waitUntil(
        caches.keys().then((names) => {
          return Promise.all(names.map((name) => caches.delete(name)));
        })
      );
      break;
    case "GET_CACHE_STATUS":
      event.waitUntil(
        caches.keys().then((names) => {
          const status: Record<string, number> = {};
          return Promise.all(
            names.map(async (name) => {
              const cache = await caches.open(name);
              const keys = await cache.keys();
              status[name] = keys.length;
            })
          ).then(() => {
            event.source?.postMessage({
              type: "CACHE_STATUS",
              payload: status,
            });
          });
        })
      );
      break;
  }
});
