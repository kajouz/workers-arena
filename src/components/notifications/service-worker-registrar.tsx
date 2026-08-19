"use client";

import { useEffect } from "react";
import { replayQueue } from "@/lib/offline-queue";
import { flushAnalyticsQueue } from "@/lib/analytics-queue";
import { isCapacitorApp, initializePushNotifications, cleanupPushNotifications } from "@/lib/mobile/push-notifications";

export const SW_PATH = "/sw.js";

/**
 * Site-wide service-worker registration. Mounted once in the root layout so
 * /sw.js is installed on the first visit to ANY page — previously it only
 * registered when the user reached the notifications page.
 *
 * Registration is idempotent (the browser returns the existing registration),
 * so StrictMode's double-invoked effect is harmless. sw.js is the full PWA
 * shell: it precaches the offline app-shell, serves the offline page for
 * failed navigations, and handles Web Push — all progressive enhancement,
 * so failure is always silent (registration errors are swallowed).
 *
 * On network restore the registrar asks the service worker to refresh all
 * precached search-result pages so they never go stale, and replays any
 * queued offline actions (leads, reviews) from IndexedDB.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize native push notifications for Capacitor
    const isNative = isCapacitorApp();
    if (isNative) {
      initializePushNotifications().catch(() => {});
    }

    // Register service worker for web PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(SW_PATH)
        .then((reg) => {
          // When the browser comes back online, ask the SW to refresh cached
          // search results, replay the offline queue, and flush analytics.
          const onOnline = () => {
            if (reg.active) {
              reg.active.postMessage({ type: "refresh-search" });
              reg.active.postMessage({ type: "replay-offline-queue" });
            }
            // Flush analytics directly (no SW involvement needed).
            flushAnalyticsQueue().catch(() => {});
          };
          window.addEventListener("online", onOnline);

          // If the SW sends a replay message (e.g. from a sync event), honour it.
          const onMessage = (event: MessageEvent) => {
            if (event.data?.type === "replay-offline-queue") {
              replayQueue().catch(() => {});
            }
          };
          navigator.serviceWorker.addEventListener("message", onMessage);

          return () => {
            window.removeEventListener("online", onOnline);
            navigator.serviceWorker.removeEventListener("message", onMessage);
          };
        })
        .catch(() => {
          /* offline-capable app? no — this is just push delivery. Ignore. */
        });
    }

    return () => {
      if (isNative) {
        cleanupPushNotifications();
      }
    };
  }, []);

  return null;
}
