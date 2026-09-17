"use client";

import { useState, useEffect, useCallback } from "react";

interface SWUpdateState {
  /** A new service worker is installed and waiting to take control. */
  isUpdateAvailable: boolean;
  /** The new service worker has taken control (update applied). */
  isUpdated: boolean;
  /** Call to apply the update (reloads the page). */
  applyUpdate: () => void;
  /** Dismiss the update prompt (won't show again for 24h). */
  dismiss: () => void;
}

/**
 * Detects when a new service worker version is available and provides
 * actions to apply or dismiss the update.
 *
 * The hook:
 * 1. Checks `navigator.serviceWorker.controller` vs `reg.waiting` on mount
 * 2. Listens for `controllerchange` (new SW took control)
 * 3. Re-checks on every tab focus (user returns to the app)
 * 4. Respects user dismissal for 24 hours
 */
export function useSWUpdate(): SWUpdateState {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      // A waiting SW means a new version is installed but not yet active
      if (reg.waiting) {
        setIsUpdateAvailable(true);
        return;
      }

      // Check if there's an updateready (SW installed and ready)
      if (reg.installing) {
        const sw = reg.installing;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            setIsUpdateAvailable(true);
          }
        });
      }
    } catch {
      // Service worker not supported or error — silently skip
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        // Tell the waiting SW to skip waiting and activate
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      // Reload to get the new version
      window.location.reload();
    });
  }, []);

  const dismiss = useCallback(() => {
    setIsUpdateAvailable(false);
    localStorage.setItem("wa-sw-update-dismissed", Date.now().toString());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Check if user dismissed recently (24 hours)
    const dismissedAt = localStorage.getItem("wa-sw-update-dismissed");
    if (dismissedAt) {
      const hoursSinceDismiss = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60);
      if (hoursSinceDismiss < 24) return;
    }

    // Initial check
    checkForUpdate();

    // Listen for controllerchange (new SW took control)
    const onControllerChange = () => {
      setIsUpdated(true);
      setIsUpdateAvailable(false);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Re-check on tab focus (user returns to the app)
    const onFocus = () => checkForUpdate();
    window.addEventListener("focus", onFocus);

    // Also check periodically (every 60 seconds) for edge cases
    const interval = setInterval(checkForUpdate, 60_000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [checkForUpdate]);

  return { isUpdateAvailable, isUpdated, applyUpdate, dismiss };
}
