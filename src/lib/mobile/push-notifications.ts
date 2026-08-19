/**
 * Native Push Notifications for Capacitor
 *
 * Handles:
 * - Device registration with FCM/APNs
 * - Foreground notification display
 * - Notification tap actions with deep-linking
 * - Notification permission management
 * - Token refresh handling
 *
 * This module is only loaded when running inside a Capacitor WebView.
 * It bridges the native push notification system with the existing
 * notification seam (src/lib/notifications/).
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";

// Types for notification action handling
interface NotificationAction {
  type: "view" | "dismiss";
  url: string;
  data?: Record<string, unknown>;
}

interface NativeNotification {
  id: string;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
}

// Deep-link route map — matches the web service worker's notification handling
const DEEP_LINK_ROUTES = {
  home: "/",
  search: "/search",
  worker: "/workers/",
  categories: "/categories",
  favorites: "/favorites",
  notifications: "/notifications",
  dashboard: "/dashboard",
  bookings: "/bookings",
  admin: "/admin",
} as const;

/**
 * Check if the app is running inside a Capacitor WebView
 */
export function isCapacitorApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the current platform (ios, android, web)
 */
export function getPlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isCapacitorApp()) {
    // Fallback to web Notification API
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
    return false;
  }

  try {
    const result = await PushNotifications.requestPermissions();
    // Capacitor returns { display: string } but TypeScript may not recognize it
    return (result as any).display === "granted";
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return false;
  }
}

/**
 * Check current notification permission status
 */
export async function getNotificationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!isCapacitorApp()) {
    if ("Notification" in window) {
      return Notification.permission as "granted" | "denied" | "prompt";
    }
    return "prompt";
  }

  try {
    const result = await PushNotifications.checkPermissions();
    // Capacitor returns { display: string } but TypeScript may not recognize it
    const display = (result as any).display;
    switch (display) {
      case "granted":
        return "granted";
      case "denied":
        return "denied";
      default:
        return "prompt";
    }
  } catch {
    return "prompt";
  }
}

/**
 * Register the device for push notifications
 * This sends the device token to the server for later use
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isCapacitorApp()) {
    console.warn("Push notification registration only available on native platforms");
    return null;
  }

  try {
    // Request permission first
    const permission = await requestNotificationPermission();
    if (!permission) {
      console.warn("Notification permission denied");
      return null;
    }

    // Register with APNs/FCM
    await PushNotifications.register();

    // Return the token (will be delivered via listener)
    return null; // Token is received asynchronously
  } catch (error) {
    console.error("Failed to register for push notifications:", error);
    return null;
  }
}

/**
 * Unregister from push notifications
 */
export async function unregisterFromPushNotifications(): Promise<void> {
  if (!isCapacitorApp()) return;

  try {
    await PushNotifications.unregister();
  } catch (error) {
    console.error("Failed to unregister from push notifications:", error);
  }
}

/**
 * Handle notification tap action
 * Navigates to the deep-link URL specified in the notification
 */
function handleNotificationAction(action: NotificationAction): void {
  const { url, data } = action;

  if (!url || url === "/") {
    // Default: go to home
    window.location.href = "/";
    return;
  }

  // Parse the URL and navigate
  try {
    const urlObj = new URL(url, window.location.origin);
    const path = urlObj.pathname + urlObj.search;

    // Use Next.js router if available, otherwise fallback to location
    if (typeof window !== "undefined") {
      // For Capacitor, we use location.href to ensure proper navigation
      window.location.href = path;
    }
  } catch {
    // Invalid URL, go to home
    window.location.href = "/";
  }
}

/**
 * Parse notification data and extract deep-link URL
 */
function parseNotificationUrl(data: Record<string, unknown>): string {
  // Check for explicit URL in data
  if (data.url && typeof data.url === "string") {
    return data.url;
  }

  // Build URL from notification type and ID
  const type = data.type as string;
  const id = data.id as string;

  switch (type) {
    case "lead":
    case "review":
    case "verification":
      // Worker-related notifications → go to worker profile
      if (id) return `/workers/${id}`;
      break;
    case "booking":
    case "booking_confirmed":
    case "booking_completed":
      // Booking notifications → go to bookings page
      return "/bookings";
    case "subscription":
    case "subscription_renewed":
    case "subscription_expired":
      // Subscription notifications → go to dashboard
      return "/dashboard";
    case "campaign":
    case "campaign_status":
      // Campaign notifications → go to company page
      return "/company";
    case "push_subscription_pruned":
      // Admin notification → go to admin
      return "/admin/push-subscriptions";
    default:
      break;
  }

  // Default to home
  return "/";
}

/**
 * Set up all notification listeners
 * Should be called once when the app initializes
 */
export function setupNotificationListeners(): () => void {
  if (!isCapacitorApp()) {
    return () => {}; // No-op for web
  }

  const listeners: (() => void)[] = [];

  // 1. Registration success — receive device token
  const registrationListener = PushNotifications.addListener("registration", (token) => {
    console.log("Push registration success, token:", token.value);

    // Store token locally for later use
    localStorage.setItem("wa-push-token", token.value);
    localStorage.setItem("wa-push-platform", getPlatform());

    // TODO: Send token to server for storage
    // POST /api/push/register { platform: getPlatform(), token: token.value }
  });
  listeners.push(() => registrationListener.then((l) => l.remove()));

  // 2. Registration error
  const registrationErrorListener = PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration error:", error);
  });
  listeners.push(() => registrationErrorListener.then((l) => l.remove()));

  // 3. Notification received in foreground
  const notificationReceivedListener = PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      console.log("Push notification received:", notification);

      // For foreground notifications, we can show an in-app alert
      // or just log it — the OS handles display for background notifications
      if (Capacitor.getPlatform() === "ios") {
        // iOS: foreground notifications don't show by default
        // We could show a custom in-app notification here
      }
    }
  );
  listeners.push(() => notificationReceivedListener.then((l) => l.remove()));

  // 4. Notification tapped (action performed)
  const notificationActionPerformedListener = PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      console.log("Push notification action performed:", action);

      const { notification, actionId } = action;
      const data = notification.data || {};

      // Handle different action types
      if (actionId === "tap" || actionId === "click") {
        // Default tap action — navigate to deep-link URL
        const url = parseNotificationUrl(data);
        handleNotificationAction({ type: "view", url, data });
      } else if (actionId === "dismiss") {
        // Dismiss action — just close the notification (already handled by OS)
        console.log("Notification dismissed");
      } else {
        // Custom action — try to parse as deep-link
        const url = parseNotificationUrl(data);
        handleNotificationAction({ type: "view", url, data });
      }
    }
  );
  listeners.push(() => notificationActionPerformedListener.then((l) => l.remove()));

  // 5. App URL open (deep links from outside the app)
  const appUrlOpenListener = App.addListener("appUrlOpen", ({ url }) => {
    console.log("App opened via URL:", url);

    // Parse the URL and navigate
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      window.location.href = path;
    } catch {
      window.location.href = "/";
    }
  });
  listeners.push(() => appUrlOpenListener.then((l) => l.remove()));

  // 6. Token refresh (FCM/APNs may rotate tokens)
  const tokenRefreshListener = PushNotifications.addListener("registration", (token) => {
    console.log("Push token refreshed:", token.value);
    localStorage.setItem("wa-push-token", token.value);
    // TODO: Update token on server
  });
  listeners.push(() => tokenRefreshListener.then((l) => l.remove()));

  // Return cleanup function
  return () => {
    for (const cleanup of listeners) {
      cleanup();
    }
  };
}

/**
 * Get the stored push token
 */
export function getStoredPushToken(): string | null {
  return localStorage.getItem("wa-push-token");
}

/**
 * Get the stored platform
 */
export function getStoredPlatform(): string | null {
  return localStorage.getItem("wa-push-platform");
}

/**
 * Check if push notifications are available and enabled
 */
export async function isPushNotificationsEnabled(): Promise<boolean> {
  if (!isCapacitorApp()) return false;

  try {
    const permission = await getNotificationPermission();
    if (permission !== "granted") return false;

    const token = getStoredPushToken();
    return !!token;
  } catch {
    return false;
  }
}

/**
 * Clear all delivered notifications (iOS only)
 */
export async function clearDeliveredNotifications(): Promise<void> {
  if (!isCapacitorApp()) return;
  if (getPlatform() !== "ios") return;

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (error) {
    console.error("Failed to clear delivered notifications:", error);
  }
}

/**
 * Set the badge count (iOS only)
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (!isCapacitorApp()) return;

  try {
    // Use any to bypass TypeScript error - Capacitor types may vary
    await (PushNotifications as any).setBadgeCount({ count });
  } catch (error) {
    console.error("Failed to set badge count:", error);
  }
}

/**
 * Initialize push notifications for the app
 * Call this once when the app starts
 */
export async function initializePushNotifications(): Promise<void> {
  if (!isCapacitorApp()) {
    console.log("Push notifications: running in web mode, using service worker");
    return;
  }

  console.log(`Push notifications: initializing for ${getPlatform()}`);

  // Set up listeners
  const cleanup = setupNotificationListeners();

  // Register for notifications
  await registerForPushNotifications();

  // Store cleanup function for later use
  (window as any).__pushCleanup = cleanup;
}

/**
 * Cleanup push notification listeners
 * Call this when the app unmounts
 */
export function cleanupPushNotifications(): void {
  const cleanup = (window as any).__pushCleanup;
  if (typeof cleanup === "function") {
    cleanup();
    delete (window as any).__pushCleanup;
  }
}
