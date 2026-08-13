/**
 * WorkersArena service worker — Web Push display + click handling.
 *
 * Payloads come from src/lib/notifications/templates.ts (renderPushPayload):
 *   { title, body, url, icon, badge, tag, dir, lang, data: { type, id, time, url } }
 * RTL: the server sets dir/lang per locale so Arabic notifications render RTL.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }

  const payload =
    data && typeof data === "object"
      ? data
      : {
          title: "WorkersArena",
          body: event.data ? event.data.text() : "",
          url: "/",
        };

  event.waitUntil(
    self.registration.showNotification(payload.title || "WorkersArena", {
      body: payload.body || "",
      icon: payload.icon || "/icon.svg",
      badge: payload.badge || "/icon.svg",
      tag: payload.tag,
      dir: payload.dir || "auto",
      lang: payload.lang || "en",
      data: payload.data || {},
      renotify: payload.tag ? true : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing tab on the same origin instead of opening a new one.
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
