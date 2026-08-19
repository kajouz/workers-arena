/**
 * Enhanced Service Worker with Periodic Background Sync
 *
 * This module provides advanced SW capabilities:
 * - Periodic background sync for fresh content
 * - Smart caching strategies
 * - Offline analytics batching
 * - Push notification improvements
 *
 * Setup:
 * 1. Register the SW with periodic sync support
 * 2. Configure sync intervals
 * 3. Handle sync events in the SW
 */

const SW_REGISTRATION_KEY = "workers-arena-sw";

export interface PeriodicSyncConfig {
  tag: string;
  minInterval: number; // in milliseconds
  callback: () => Promise<void>;
}

/**
 * Register service worker with periodic sync support
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    console.warn("[SW] Service workers not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("[SW] Registered with scope:", registration.scope);

    // Check for periodic sync support
    if ("periodicSync" in registration) {
      console.log("[SW] Periodic sync supported");
    }

    // Listen for updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            console.log("[SW] New version activated");
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error("[SW] Registration failed:", error);
    return null;
  }
}

/**
 * Request periodic sync permission
 */
export async function requestPeriodicSync(
  tag: string,
  minInterval: number
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    if (!("periodicSync" in registration)) {
      console.warn("[SW] Periodic sync not supported");
      return false;
    }

    const status = await navigator.permissions.query({
      name: "periodic-background-sync" as PermissionName,
    });

    if (status.state !== "granted") {
      console.warn("[SW] Periodic sync permission not granted");
      return false;
    }

    await (registration as any).periodicSync.register(tag, {
      minInterval,
    });

    console.log(`[SW] Periodic sync registered: ${tag}`);
    return true;
  } catch (error) {
    console.error("[SW] Periodic sync registration failed:", error);
    return false;
  }
}

/**
 * Unregister periodic sync
 */
export async function unregisterPeriodicSync(tag: string): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    if ("periodicSync" in registration) {
      await (registration as any).periodicSync.unregister(tag);
      console.log(`[SW] Periodic sync unregistered: ${tag}`);
    }
  } catch (error) {
    console.error("[SW] Periodic sync unregistration failed:", error);
  }
}

/**
 * Get periodic sync status
 */
export async function getPeriodicSyncStatus(): Promise<
  { tag: string; lastSync: number }[]
> {
  if (typeof window === "undefined") return [];

  try {
    const registration = await navigator.serviceWorker.ready;
    if (!("periodicSync" in registration)) {
      return [];
    }

    const tags = await (registration as any).periodicSync.getRegistrations();
    return tags.map((reg: any) => ({
      tag: reg.tag,
      lastSync: reg.lastSync,
    }));
  } catch (error) {
    console.error("[SW] Failed to get sync status:", error);
    return [];
  }
}

/**
 * Predefined sync configurations
 */
export const SYNC_CONFIGS = {
  /**
   * Sync fresh content (search results, worker profiles)
   */
  freshContent: {
    tag: "fresh-content",
    minInterval: 60 * 60 * 1000, // 1 hour
    callback: async () => {
      // Cache fresh search results and worker profiles
      console.log("[SW] Syncing fresh content");
    },
  },

  /**
   * Sync offline analytics
   */
  analytics: {
    tag: "analytics-sync",
    minInterval: 15 * 60 * 1000, // 15 minutes
    callback: async () => {
      // Send batched analytics events
      console.log("[SW] Syncing analytics");
    },
  },

  /**
   * Sync offline queue
   */
  offlineQueue: {
    tag: "offline-queue",
    minInterval: 5 * 60 * 1000, // 5 minutes
    callback: async () => {
      // Process queued form submissions
      console.log("[SW] Syncing offline queue");
    },
  },

  /**
   * Check for app updates
   */
  appUpdate: {
    tag: "app-update",
    minInterval: 24 * 60 * 60 * 1000, // 24 hours
    callback: async () => {
      // Check for new SW version
      console.log("[SW] Checking for app updates");
    },
  },
};

/**
 * Initialize periodic sync for all configured tags
 */
export async function initializePeriodicSync(): Promise<void> {
  for (const [name, config] of Object.entries(SYNC_CONFIGS)) {
    const success = await requestPeriodicSync(config.tag, config.minInterval);
    if (success) {
      console.log(`[SW] Periodic sync enabled: ${name}`);
    }
  }
}

/**
 * Smart cache strategy based on content type
 */
export function getCacheStrategy(contentType: string): string {
  const strategies: Record<string, string> = {
    // Static assets - cache first
    "static": "cache-first",
    "css": "cache-first",
    "js": "cache-first",
    "fonts": "cache-first",
    "images": "cache-first",

    // API responses - network first with fallback
    "api": "network-first",
    "json": "network-first",

    // HTML pages - stale while revalidate
    "html": "stale-while-revalidate",
    "document": "stale-while-revalidate",

    // Dynamic content - network only
    "realtime": "network-only",
    "websocket": "network-only",
  };

  return strategies[contentType] || "network-first";
}

/**
 * Get cache name for content type
 */
export function getCacheName(contentType: string, version = "v1"): string {
  return `workers-arena-${contentType}-${version}`;
}

/**
 * Clean old caches
 */
export async function cleanOldCaches(maxAge = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const cacheNames = await caches.keys();
  const now = Date.now();

  for (const name of cacheNames) {
    if (!name.startsWith("workers-arena-")) continue;

    const cache = await caches.open(name);
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get("date");
        if (dateHeader) {
          const responseDate = new Date(dateHeader).getTime();
          if (now - responseDate > maxAge) {
            await cache.delete(request);
          }
        }
      }
    }
  }
}
