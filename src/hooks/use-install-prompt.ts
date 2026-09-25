"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "ios" | "android" | "desktop" | "unknown";

/**
 * Best-effort platform detection for choosing which manual install steps to
 * show. This is user-agent based (not viewport based) on purpose: it decides
 * WHICH instructions make sense, not WHETHER to offer them.
 */
export function detectPlatform(): InstallPlatform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
}

/**
 * Hook to capture the `beforeinstallprompt` event and provide an install function.
 *
 * The browser fires this event when the PWA meets installability criteria
 * (manifest, service worker, HTTPS) but the user hasn't installed yet.
 * We defer the browser's native prompt and show our own in-app banner instead.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if already installed (display-mode: standalone)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const hasInstalled = localStorage.getItem("wa-pwa-installed") === "true";
    if (isStandalone || hasInstalled) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      localStorage.setItem("wa-pwa-installed", "true");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      localStorage.setItem("wa-pwa-installed", "true");
    }

    setDeferredPrompt(null);
    setCanInstall(false);
    return outcome === "accepted";
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setCanInstall(false);
    localStorage.setItem("wa-pwa-install-dismissed", Date.now().toString());
  }, []);

  return { canInstall, isInstalled, install, dismiss };
}
