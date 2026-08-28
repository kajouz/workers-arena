"use client";

import { useEffect, useState } from "react";
import { initCapacitor, isNativeApp, getPlatform } from "@/lib/mobile/capacitor-init";

interface CapacitorState {
  /** Whether the app is running natively (iOS/Android) */
  isNative: boolean;
  /** Current platform ("ios", "android", or "web") */
  platform: string;
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Whether Capacitor initialization is complete */
  ready: boolean;
}

/**
 * Hook that initializes Capacitor and exposes native platform state.
 *
 * Usage:
 * ```tsx
 * const { isNative, platform, isOnline } = useCapacitor();
 * if (isNative && platform === "ios") { ... }
 * ```
 */
export function useCapacitor(): CapacitorState {
  const [state, setState] = useState<CapacitorState>({
    isNative: false,
    platform: "web",
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Initialize Capacitor native plugins
      await initCapacitor();

      if (cancelled) return;

      const native = await isNativeApp();
      const plat = await getPlatform();

      if (cancelled) return;

      setState((prev) => ({
        ...prev,
        isNative: native,
        platform: plat,
        ready: true,
      }));

      // Listen for network changes from Capacitor
      const onNetworkChange = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setState((prev) => ({
          ...prev,
          isOnline: detail.connected,
        }));
      };

      // Also listen for browser online/offline events
      const onOnline = () => setState((prev) => ({ ...prev, isOnline: true }));
      const onOffline = () => setState((prev) => ({ ...prev, isOnline: false }));

      window.addEventListener("capacitor:network-change", onNetworkChange);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);

      return () => {
        window.removeEventListener("capacitor:network-change", onNetworkChange);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
