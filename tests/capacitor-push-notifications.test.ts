import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock Capacitor modules
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
  },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    requestPermissions: vi.fn(() => Promise.resolve({ display: "granted" })),
    checkPermissions: vi.fn(() => Promise.resolve({ display: "prompt" })),
    register: vi.fn(() => Promise.resolve()),
    unregister: vi.fn(() => Promise.resolve()),
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    removeAllDeliveredNotifications: vi.fn(() => Promise.resolve()),
    setBadgeCount: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

describe("Capacitor Push Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("push notifications module exports are defined", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    expect(mod.isCapacitorApp).toBeDefined();
    expect(mod.getPlatform).toBeDefined();
    expect(mod.requestNotificationPermission).toBeDefined();
    expect(mod.registerForPushNotifications).toBeDefined();
    expect(mod.setupNotificationListeners).toBeDefined();
    expect(mod.initializePushNotifications).toBeDefined();
  });

  it("isCapacitorApp returns false in web environment", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    const result = mod.isCapacitorApp();
    expect(result).toBe(false);
  });

  it("getPlatform returns web in web environment", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    const result = mod.getPlatform();
    expect(result).toBe("web");
  });

  it("setupNotificationListeners returns cleanup function", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    const cleanup = mod.setupNotificationListeners();
    expect(typeof cleanup).toBe("function");
    cleanup(); // Should not throw
  });

  it("getStoredPushToken returns null when not set", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    localStorage.removeItem("wa-push-token");
    const token = mod.getStoredPushToken();
    expect(token).toBeNull();
  });

  it("getStoredPlatform returns null when not set", async () => {
    const mod = await import("@/lib/mobile/push-notifications");
    localStorage.removeItem("wa-push-platform");
    const platform = mod.getStoredPlatform();
    expect(platform).toBeNull();
  });
});

describe("Deep Links", () => {
  it("deep links module exports are defined", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    expect(mod.parseDeepLink).toBeDefined();
    expect(mod.matchDeepLink).toBeDefined();
    expect(mod.handleDeepLink).toBeDefined();
    expect(mod.setupDeepLinkListeners).toBeDefined();
    expect(mod.generateDeepLink).toBeDefined();
  });

  it("parseDeepLink handles standard HTTPS URLs", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.parseDeepLink("https://workersarena.com/workers/khaled-plumbing");
    expect(result.path).toBe("/workers/khaled-plumbing");
    expect(result.search).toBe("");
  });

  it("parseDeepLink handles custom URL scheme", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.parseDeepLink("workersarena://workers/khaled-plumbing");
    expect(result.path).toBe("/workers/khaled-plumbing");
    expect(result.search).toBe("");
  });

  it("parseDeepLink handles URLs with search params", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.parseDeepLink("https://workersarena.com/search?category=plumbing&city=riyadh");
    expect(result.path).toBe("/search");
    expect(result.search).toBe("?category=plumbing&city=riyadh");
  });

  it("parseDeepLink handles invalid URLs gracefully", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.parseDeepLink("not-a-valid-url");
    expect(result.path).toBe("/");
    expect(result.search).toBe("");
  });

  it("matchDeepLink matches worker profiles", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/workers/khaled-plumbing", "");
    expect(result).toBe("/workers/khaled-plumbing");
  });

  it("matchDeepLink matches search routes", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/search", "?category=plumbing");
    expect(result).toBe("/search?category=plumbing");
  });

  it("matchDeepLink matches categories", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/categories", "");
    expect(result).toBe("/categories");
  });

  it("matchDeepLink matches bookings", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/bookings", "");
    expect(result).toBe("/bookings");
  });

  it("matchDeepLink matches dashboard", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/dashboard", "");
    expect(result).toBe("/dashboard");
  });

  it("matchDeepLink matches admin routes", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/admin/bookings/123", "");
    expect(result).toBe("/admin/bookings/123");
  });

  it("matchDeepLink returns null for invalid routes", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.matchDeepLink("/invalid/route/../../etc/passwd", "");
    expect(result).toBeNull();
  });

  it("handleDeepLink processes full URLs", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.handleDeepLink("https://workersarena.com/workers/test-worker");
    expect(result).toBe("/workers/test-worker");
  });

  it("handleDeepLink processes custom scheme URLs", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.handleDeepLink("workersarena://search?category=plumbing");
    expect(result).toBe("/search?category=plumbing");
  });

  it("generateDeepLink creates correct URLs", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const result = mod.generateDeepLink("/workers/test-worker");
    expect(result).toContain("/workers/test-worker");
    expect(result).toMatch(/^https?:\/\//);
  });

  it("setupDeepLinkListeners returns cleanup function", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    const cleanup = mod.setupDeepLinkListeners();
    expect(typeof cleanup).toBe("function");
    cleanup(); // Should not throw
  });

  it("deep link constants are defined", async () => {
    const mod = await import("@/lib/mobile/deep-links");
    expect(mod.DEEP_LINK_SCHEME).toBe("workersarena://");
    expect(mod.UNIVERSAL_LINK_DOMAIN).toBe("workersarena.com");
  });
});

describe("Push Notifications Hook", () => {
  it("usePushNotifications hook exports are defined", async () => {
    const mod = await import("@/hooks/use-push-notifications");
    expect(mod.usePushNotifications).toBeDefined();
    expect(typeof mod.usePushNotifications).toBe("function");
  });
});

describe("Service Worker Registrar Integration", () => {
  it("service worker registrar imports push notifications", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/notifications/service-worker-registrar.tsx"),
      "utf-8"
    );
    expect(content).toContain("isCapacitorApp");
    expect(content).toContain("initializePushNotifications");
    expect(content).toContain("cleanupPushNotifications");
  });
});

describe("Capacitor Configuration", () => {
  it("capacitor config has push notification settings", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "capacitor.config.ts"),
      "utf-8"
    );
    expect(content).toContain("PushNotifications");
    expect(content).toContain("presentationOptions");
    expect(content).toContain("badge");
    expect(content).toContain("sound");
    expect(content).toContain("alert");
  });

  it("capacitor config has push notification presentation options", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "capacitor.config.ts"),
      "utf-8"
    );
    expect(content).toContain("presentationOptions");
    expect(content).toContain("badge");
    expect(content).toContain("sound");
    expect(content).toContain("alert");
  });

  it("capacitor config has status bar settings", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "capacitor.config.ts"),
      "utf-8"
    );
    expect(content).toContain("StatusBar");
    expect(content).toContain("style");
    expect(content).toContain("backgroundColor");
  });

  it("capacitor config has splash screen settings", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "capacitor.config.ts"),
      "utf-8"
    );
    expect(content).toContain("SplashScreen");
    expect(content).toContain("launchAutoHide");
    expect(content).toContain("showSpinner");
  });
});

describe("Service Worker Notification Actions", () => {
  it("service worker has notification action buttons", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf-8"
    );
    expect(content).toContain("NOTIFICATION_ACTIONS");
    expect(content).toContain('action: "view"');
    expect(content).toContain('action: "dismiss"');
  });

  it("service worker handles notification click", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf-8"
    );
    expect(content).toContain("notificationclick");
    expect(content).toContain("event.action");
  });

  it("service worker deep-links on notification tap", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "public/sw.js"),
      "utf-8"
    );
    expect(content).toContain("event.notification.data");
    expect(content).toContain("clients.openWindow");
    expect(content).toContain("client.focus");
  });
});
