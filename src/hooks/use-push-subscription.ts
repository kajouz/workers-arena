"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * usePushSubscription
 * ────────────────────────────────────────────────────────────────────────────
 * Client-side Web Push lifecycle:
 *   1. Detect support (service worker + PushManager + Notifications).
 *   2. Fetch the VAPID public key from GET /api/push/vapid-public-key
 *      (404 → "unconfigured": the server has no push provider set up).
 *   3. Register /sw.js, then enable() requests permission, subscribes with the
 *      VAPID key and POSTs the subscription to /api/push/register.
 *   4. disable() unsubscribes locally and tells the server to drop the
 *      endpoint (POST /api/push/register { unregister }).
 * ────────────────────────────────────────────────────────────────────────────
 */

export type PushStatus =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "idle"
  | "enabled"
  | "denied"
  | "error";

export interface PushState {
  status: PushStatus;
  error?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const keyRef = useRef<string | null>(null);

  const set = useCallback((status: PushStatus, error?: string) => {
    setState({ status, error });
  }, []);

  const init = useCallback(async () => {
    if (!isSupported()) return set("unsupported");
    try {
      // Register the worker up-front so it's installed before push is enabled.
      const reg = await navigator.serviceWorker.register("/sw.js");
      swRef.current = reg;

      // The server must expose a VAPID public key to subscribe against.
      const res = await fetch("/api/push/vapid-public-key");
      if (!res.ok) return set("unconfigured");
      const { publicKey } = (await res.json()) as { publicKey?: string };
      if (!publicKey) return set("unconfigured");
      keyRef.current = publicKey;

      const sub = await reg.pushManager.getSubscription();
      if (sub) return set("enabled");
      if (Notification.permission === "denied") return set("denied");
      set("idle");
    } catch {
      set("error", "init");
    }
  }, [set]);

  useEffect(() => {
    void init();
  }, [init]);

  /** Ask permission and subscribe, then persist the endpoint server-side. */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) return false;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        set("denied");
        return false;
      }
      const reg = swRef.current ?? (await navigator.serviceWorker.register("/sw.js"));
      swRef.current = reg;
      if (!keyRef.current) {
        const res = await fetch("/api/push/vapid-public-key");
        if (!res.ok) {
          set("unconfigured");
          return false;
        }
        const { publicKey } = (await res.json()) as { publicKey?: string };
        keyRef.current = publicKey ?? null;
        if (!keyRef.current) {
          set("unconfigured");
          return false;
        }
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRef.current),
      });
      const body = sub.toJSON();
      const save = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: { endpoint: body.endpoint, keys: body.keys },
        }),
      });
      if (!save.ok) {
        set("error", "register");
        return false;
      }
      set("enabled");
      return true;
    } catch {
      set("error", "subscribe");
      return false;
    } finally {
      setBusy(false);
    }
  }, [set]);

  /** Unsubscribe locally and tell the server to forget the endpoint. */
  const disable = useCallback(async (): Promise<void> => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = swRef.current ?? (await navigator.serviceWorker.getRegistration());
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe();
      if (endpoint) {
        await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unregister: endpoint }),
        }).catch(() => {});
      }
      set("idle");
    } catch {
      set("error", "unsubscribe");
    } finally {
      setBusy(false);
    }
  }, [set]);

  return { ...state, busy, enable, disable, refresh: init };
}
