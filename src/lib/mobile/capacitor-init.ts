/**
 * Capacitor initialization — runs once on app mount.
 *
 * This module detects whether the app is running inside a native Capacitor
 * shell and, if so, initializes platform-specific features:
 *   • Push notification registration
 *   • Status bar styling
 *   • Keyboard appearance
 *   • Network connectivity listener
 *   • App state change listener (background/foreground)
 *
 * Safe to import in any Next.js component — all Capacitor APIs are loaded
 * dynamically so the web bundle tree-shakes them out when building for the
 * browser.
 */

let initialized = false;

export async function initCapacitor(): Promise<void> {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Running on", Capacitor.getPlatform());

    // Haptics — arm the availability flag once at boot so the haptic* helpers
    // scattered across booking/chat UIs actually fire on device (they no-op
    // until initHaptics has run; on web everything no-ops regardless).
    try {
      const { initHaptics } = await import("@/lib/mobile/haptics");
      await initHaptics();
    } catch { /* plugin not available */ }

    // Status bar
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#14120f" });
    } catch { /* plugin not available */ }

    // Push notifications
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      // Request permission
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === "granted") {
        await PushNotifications.register();

        PushNotifications.addListener("registration", (token) => {
          if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Push registration token:", token.value);
          void fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
          }).catch(() => {});
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[Capacitor] Push registration error:", err);
        });

        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Push received:", notification.title);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Push action:", action.notification.data);
          // Notification-tap deep linking: route through the deep-links
          // matcher (validates the path, normalizes custom schemes) instead of
          // assigning data.url verbatim — a malformed payload lands on "/",
          // never on an arbitrary string. Dynamic import keeps the web bundle
          // free of the deep-links module, same contract as every import here.
          const url = action.notification.data?.url;
          if (url && typeof window !== "undefined") {
            void import("@/lib/mobile/deep-links").then(({ handleDeepLink }) => {
              const appPath = handleDeepLink(url);
              window.location.href = appPath ?? "/";
            });
          }
        });
      }
    } catch { /* plugin not available */ }

    // Local notifications
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.requestPermissions();
    } catch { /* plugin not available */ }

    // Keyboard resize (helps with iOS keyboard overlapping inputs)
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      Keyboard.addListener("keyboardWillShow", (info) => {
        document.body.style.paddingBottom = `${info.keyboardHeight}px`;
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.body.style.paddingBottom = "";
      });
    } catch { /* plugin not available */ }

    // App state changes (detect foreground/background)
    try {
      const { App } = await import("@capacitor/app");
      App.addListener("appStateChange", ({ isActive }) => {
        if (process.env.NODE_ENV !== "production") console.log("[Capacitor] App state:", isActive ? "foreground" : "background");
      });

      App.addListener("appUrlOpen", (data) => {
        if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Deep link opened:", data.url);
        // Universal/app links now route through the deep-links matcher —
        // previously this listener only logged, so a cold link to
        // /workers/<slug> or /bookings just sat on whatever page was open.
        void import("@/lib/mobile/deep-links").then(({ handleDeepLink }) => {
          const appPath = handleDeepLink(data.url);
          window.location.href = appPath ?? "/";
        });
      });
    } catch { /* plugin not available */ }

    // Network connectivity
    try {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Network:", status.connected ? "online" : "offline");

      Network.addListener("networkStatusChange", (status) => {
        if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Network changed:", status.connected ? "online" : "offline");
        // Dispatch a custom event so React components can react
        window.dispatchEvent(
          new CustomEvent("capacitor:network-change", {
            detail: { connected: status.connected, connectionType: status.connectionType },
          })
        );
      });
    } catch { /* plugin not available */ }

    // Clipboard
    try {
      const { Clipboard } = await import("@capacitor/clipboard");
      // Expose clipboard for copy-to-clipboard features
      if (typeof window !== "undefined") {
        (window as any).__capacitorClipboard = Clipboard;
      }
    } catch { /* plugin not available */ }

    // Share
    try {
      const { Share } = await import("@capacitor/share");
      if (typeof window !== "undefined") {
        (window as any).__capacitorShare = Share;
      }
    } catch { /* plugin not available */ }

    // Geolocation
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      if (typeof window !== "undefined") {
        (window as any).__capacitorGeolocation = Geolocation;
      }
    } catch { /* plugin not available */ }

    if (process.env.NODE_ENV !== "production") console.log("[Capacitor] Initialization complete");
  } catch (err) {
    console.warn("[Capacitor] Init failed:", err);
  }
}

/**
 * Check if running inside a native Capacitor shell.
 */
export async function isNativeApp(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Get the current platform ("ios", "android", or "web").
 */
export async function getPlatform(): Promise<string> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}
