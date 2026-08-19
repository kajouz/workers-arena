/**
 * Deep-Link Handler for Capacitor
 *
 * Handles:
 * - Universal Links (iOS) and App Links (Android)
 * - Notification tap deep-linking
 * - QR code scanning
 * - Shared links from external sources
 *
 * This module bridges the native deep-linking system with the Next.js router.
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// Deep-link route configuration
interface DeepLinkRoute {
  pattern: RegExp;
  handler: (params: string[], search?: string) => string;
}

// Route patterns for deep-linking
const DEEP_LINK_ROUTES: DeepLinkRoute[] = [
  // Worker profiles: /workers/[slug]
  {
    pattern: /^\/workers\/([^/]+)$/,
    handler: (params) => `/workers/${params[0]}`,
  },
  // Search with filters: /search?category=...&city=...
  {
    pattern: /^\/search$/,
    handler: (_params, search) => `/search${search}`,
  },
  // Categories listing: /categories
  {
    pattern: /^\/categories$/,
    handler: () => "/categories",
  },
  // Bookings: /bookings
  {
    pattern: /^\/bookings$/,
    handler: () => "/bookings",
  },
  // Dashboard: /dashboard
  {
    pattern: /^\/dashboard$/,
    handler: () => "/dashboard",
  },
  // Notifications: /notifications
  {
    pattern: /^\/notifications$/,
    handler: () => "/notifications",
  },
  // Admin routes: /admin/*
  {
    pattern: /^\/admin\/(.+)$/,
    handler: (params) => `/admin/${params[0]}`,
  },
];

/**
 * Parse a deep-link URL and extract the path and search params
 */
export function parseDeepLink(url: string): { path: string; search: string } {
  try {
    // Handle custom URL schemes (workersarena://)
    if (url.startsWith("workersarena://")) {
      const path = url.replace("workersarena://", "/");
      return { path, search: "" };
    }

    // Handle standard HTTPS URLs
    const urlObj = new URL(url);
    return {
      path: urlObj.pathname,
      search: urlObj.search,
    };
  } catch {
    // Invalid URL, return root
    return { path: "/", search: "" };
  }
}

/**
 * Match a path against deep-link routes
 */
export function matchDeepLink(
  path: string,
  search: string = ""
): string | null {
  for (const route of DEEP_LINK_ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      const params = match.slice(1);
      return route.handler(params, search);
    }
  }

  // No match found — use the path as-is if it's a valid app route
  if (path.startsWith("/") && !path.includes("..")) {
    return `${path}${search}`;
  }

  return null;
}

/**
 * Handle a deep-link URL
 * Returns the app path to navigate to, or null if invalid
 */
export function handleDeepLink(url: string): string | null {
  const { path, search } = parseDeepLink(url);
  return matchDeepLink(path, search);
}

/**
 * Set up deep-link listeners
 * Should be called once when the app initializes
 */
export function setupDeepLinkListeners(): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {}; // No-op for web
  }

  const listeners: (() => void)[] = [];

  // Handle app URL open (universal links / app links)
  const appUrlOpenListener = App.addListener("appUrlOpen", ({ url }) => {
    console.log("App opened via deep link:", url);

    const appPath = handleDeepLink(url);
    if (appPath) {
      // Navigate to the deep-linked route
      window.location.href = appPath;
    } else {
      // Invalid deep link, go to home
      window.location.href = "/";
    }
  });
  listeners.push(() => appUrlOpenListener.then((l) => l.remove()));

  // Handle app state change (open from background via deep link)
  const appStateChangeListener = App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      // App came to foreground — check for pending deep link
      // This is handled by the OS, but we can add custom logic here
    }
  });
  listeners.push(() => appStateChangeListener.then((l) => l.remove()));

  // Return cleanup function
  return () => {
    for (const cleanup of listeners) {
      cleanup();
    }
  };
}

/**
 * Get the initial deep-link URL (for cold start)
 */
export function getInitialDeepLink(): string | null {
  if (!Capacitor.isNativePlatform()) return null;

  // On cold start, the app may have been opened via a deep link
  // This is typically handled by the OS and passed to the app
  // For now, we check the current URL
  const url = window.location.href;
  if (url.includes("workersarena://")) {
    return handleDeepLink(url);
  }

  return null;
}

/**
 * Generate a deep-link URL for sharing
 */
export function generateDeepLink(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://workersarena.com";
  return `${baseUrl}${path}`;
}

/**
 * Generate a QR code URL for a deep link
 */
export function generateQrCodeUrl(path: string): string {
  const deepLink = generateDeepLink(path);
  // Use a QR code API (e.g., QR Server)
  const encodedUrl = encodeURIComponent(deepLink);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUrl}`;
}

// Export for use in other modules
export const DEEP_LINK_SCHEME = "workersarena://";
export const UNIVERSAL_LINK_DOMAIN = "workersarena.com";
