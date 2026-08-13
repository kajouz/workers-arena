"use client";

import { useEffect } from "react";

export const SW_PATH = "/sw.js";

/**
 * Site-wide service-worker registration. Mounted once in the root layout so
 * /sw.js is installed on the first visit to any page — previously it only
 * registered when the user reached the notifications page.
 *
 * Registration is idempotent (the browser returns the existing registration),
 * so StrictMode's double-invoked effect is harmless. sw.js has no fetch
 * handler, so it never caches or intercepts requests — pure progressive
 * enhancement: failure is always silent.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_PATH).catch(() => {
      /* offline-capable app? no — this is just push delivery. Ignore. */
    });
  }, []);

  return null;
}
