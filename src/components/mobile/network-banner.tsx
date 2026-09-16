"use client";

import { useState, useEffect } from "react";
import { WifiOff, Wifi, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Network awareness banner — displayed at the top of the screen when the
 * device goes offline. Automatically dismisses when connectivity returns.
 * On native (Capacitor), uses the Network plugin; on web, uses navigator.onLine.
 */
export function NetworkBanner() {
  const [online, setOnline] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Web fallback.
    const handleOnline = () => {
      setOnline(true);
      setWasOffline(true);
      // Auto-dismiss after 3s when back online.
      setTimeout(() => setDismissed(true), 3000);
    };
    const handleOffline = () => {
      setOnline(false);
      setDismissed(false);
      setWasOffline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check initial state.
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Try Capacitor Network plugin for more accurate detection.
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        setOnline(status.connected);

        const listener = await Network.addListener("networkStatusChange", (status) => {
          setOnline(status.connected);
          if (status.connected) {
            setWasOffline(true);
            setTimeout(() => setDismissed(true), 3000);
          } else {
            setDismissed(false);
          }
        });

        removeListener = () => listener.remove();
      } catch {
        // Not in Capacitor — web listeners are enough.
      }
    })();

    return () => { removeListener?.(); };
  }, []);

  if (dismissed) return null;

  // Show "back online" flash for 3s.
  if (wasOffline && online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-emerald-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top">
        <Wifi className="h-4 w-4" />
        {typeof window !== "undefined" && document.documentElement.dir === "rtl"
          ? "تم الاتصال مجدداً"
          : "Back online"}
      </div>
    );
  }

  // Show "offline" banner.
  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>
          {typeof window !== "undefined" && document.documentElement.dir === "rtl"
            ? "بدون اتصال — بعض الميزات قد لا تعمل"
            : "No connection — some features may not work"}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return null;
}
