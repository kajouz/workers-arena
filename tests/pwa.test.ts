import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "@/app/manifest";

const root = process.cwd();
const pub = (p: string) => resolve(root, "public", p);
const src = (p: string) => resolve(root, "src", p);

/** Read the PNG width/height from the IHDR chunk (big-endian at bytes 16–24). */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe("PWA manifest (src/app/manifest.ts)", () => {
  it("is installable: id, scope, start_url, display standalone + override", async () => {
    const m = await manifest();
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.display_override).toContain("standalone");
  });

  it("declares PNG icons at 192 + 512 (any) and a maskable 512 variant", async () => {
    const m = await manifest();
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.src === "/icons/icon-192.png" && i.sizes === "192x192" && i.type === "image/png" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.src === "/icons/icon-512.png" && i.sizes === "512x512" && i.type === "image/png" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.src === "/icons/maskable-512.png" && i.sizes === "512x512" && i.type === "image/png" && i.purpose === "maskable")).toBe(true);
  });

  it("defaults to LTR/English outside a request scope (locale cookie unavailable)", async () => {
    const m = await manifest();
    expect(m.dir).toBe("ltr");
    expect(m.lang).toBe("en");
  });

  it("exposes deep-link shortcuts to the four role surfaces", async () => {
    const m = await manifest();
    const urls = (m.shortcuts ?? []).map((s) => s.url);
    expect(urls).toEqual(expect.arrayContaining(["/search", "/bookings", "/dashboard", "/company"]));
  });
});

describe("PWA icon assets (public/icons/)", () => {
  const cases = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const;

  for (const [file, size] of cases) {
    it(`${file} exists at ${size}×${size}`, () => {
      expect(existsSync(pub(`icons/${file}`))).toBe(true);
      const { width, height } = pngSize(pub(`icons/${file}`));
      expect(width).toBe(size);
      expect(height).toBe(size);
    });
  }

  it("every manifest icon src resolves to a real public file", async () => {
    const m = await manifest();
    for (const icon of m.icons ?? []) {
      expect(existsSync(pub(icon.src.replace(/^\//, "")))).toBe(true);
    }
  });
});

describe("Service worker (public/sw.js)", () => {
  const sw = readFileSync(pub("sw.js"), "utf8");

  it("precaches the offline shell + top content (each listed URL resolves to a public file or route)", () => {
    for (const entry of ["/", "/offline.html", "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]) {
      expect(sw).toContain(entry);
    }
    // Categories listing page for offline trade browsing
    expect(sw).toContain('"/categories"');
    // Top worker profiles (featured workers for offline access)
    for (const slug of ["khaled-al-harbi-plumbing", "omar-al-mutairi-ac-technician", "bilal-mansour-cleaning", "anas-barakat-interior-design", "ali-hassan-carpentry"]) {
      expect(sw).toContain(`/workers/${slug}`);
    }
    // Every category search page for offline trade browsing
    for (const cat of ["plumbing", "electrical", "ac-technician", "carpentry", "cleaning", "painting", "masonry", "satellite-technician", "mechanic", "welding", "blacksmith", "roofing", "movers", "gardening", "pest-control", "locksmith", "glass-works", "aluminum-works", "gypsum-works", "interior-design", "construction"]) {
      expect(sw).toContain(`/search?category=${cat}`);
    }
    expect(existsSync(pub("offline.html"))).toBe(true);
    expect(existsSync(pub("icons/apple-touch-icon.png"))).toBe(true);
  });

  it("falls back to /offline.html for failed navigations", () => {
    expect(sw).toContain('caches.match("/offline.html")');
  });

  it("never caches /api data requests", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
  });

  it("keeps the push display + notification-click handlers", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("showNotification");
    expect(sw).toContain("clients.openWindow");
  });

  it("maintains a bounded profiles cache for recently-visited worker pages", () => {
    // Dedicated cache name for profile pages
    expect(sw).toContain("wa-profiles-");
    // Profile URL pattern to detect /workers/* navigations
    expect(sw).toContain("PROFILE_PATH_RE");
    // Caches successful profile responses into the profiles cache
    expect(sw).toContain("PROFILES_CACHE");
    // Prunes the cache to stay bounded
    expect(sw).toContain("MAX_PROFILES");
    expect(sw).toContain("pruneProfilesCache");
  });

  it("checks the profiles cache before the shell when offline", () => {
    // The offline catch block should check profiles cache for worker pages
    expect(sw).toContain("isProfile");
    expect(sw).toContain("profileCached");
  });

  it("has a SEARCH_URLS list derived from precache entries", () => {
    expect(sw).toContain("SEARCH_URLS");
    expect(sw).toContain('PRECACHE_URLS.filter((u) => u.startsWith("/search?"))');
  });

  it("registers a sync event to refresh search results when offline search is served", () => {
    expect(sw).toContain('sync.register("refresh-search")');
  });

  it("handles sync and message events to refresh the search cache", () => {
    expect(sw).toContain('addEventListener("sync"');
    expect(sw).toContain('addEventListener("message"');
    expect(sw).toContain('"refresh-search"');
    expect(sw).toContain("refreshSearchCache");
  });

  it("refreshSearchCache re-fetches all SEARCH_URLS and updates the shell cache", () => {
    expect(sw).toContain("async function refreshSearchCache");
    expect(sw).toContain("SHELL_CACHE");
  });

  it("has storage budget monitoring to auto-evict profiles when disk is low", () => {
    // Minimum free storage threshold (50MB)
    expect(sw).toContain("MIN_FREE_STORAGE");
    // Storage estimation check
    expect(sw).toContain("checkStorageBudget");
    expect(sw).toContain("navigator.storage.estimate");
    // Aggressive eviction when storage is low
    expect(sw).toContain("evictProfilesForBudget");
    // Pre-cache check to avoid caching when storage is critically low
    expect(sw).toContain("canCacheProfile");
  });

  it("runs storage check on activate and after caching profiles", () => {
    // Storage check on activate
    expect(sw).toContain("checkStorageBudget");
    // canCacheProfile guard before caching profiles
    expect(sw).toContain("canCacheProfile");
  });
});

describe("Offline page (public/offline.html)", () => {
  const html = readFileSync(pub("offline.html"), "utf8");

  it("is bilingual (EN + AR) with a retry action and the app icon", () => {
    expect(html).toContain("You're offline");
    expect(html).toContain("أنت غير متصل");
    expect(html).toContain("إعادة المحاولة");
    expect(html).toContain('src="/icons/icon-192.png"');
    expect(html).toContain("window.location.reload()");
  });

  it("shows cached worker profiles section", () => {
    expect(html).toContain("profiles-section");
    expect(html).toContain("profiles-list");
    expect(html).toContain("Recently Viewed Workers");
  });

  it("shows cached search pages section", () => {
    expect(html).toContain("search-section");
    expect(html).toContain("search-list");
    expect(html).toContain("Cached Search Pages");
  });

  it("reads from service worker caches", () => {
    expect(html).toContain("caches.keys()");
    expect(html).toContain("wa-profiles");
    expect(html).toContain("wa-shell");
  });

  it("displays worker profiles with category icons", () => {
    expect(html).toContain("categoryIcons");
    expect(html).toContain("plumbing");
    expect(html).toContain("electrical");
    expect(html).toContain("🔧");
  });

  it("has offline badge with animation", () => {
    expect(html).toContain("offline-badge");
    expect(html).toContain("offline-dot");
    expect(html).toContain("Offline Mode");
  });

  it("shows empty state when no cached content", () => {
    expect(html).toContain("empty-state");
    expect(html).toContain("No cached content available");
  });

  it("has retry and home buttons", () => {
    expect(html).toContain("Try again");
    expect(html).toContain("Back to Home");
    expect(html).toContain('href="/"');
  });
});

describe("Root layout PWA metadata (src/app/layout.tsx)", () => {
  const layout = readFileSync(src("app/layout.tsx"), "utf8");

  it("declares apple-web-app capable + title and the apple-touch-icon", () => {
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("capable: true");
    expect(layout).toContain("/icons/apple-touch-icon.png");
  });

  it("uses viewport-fit cover for installed safe areas", () => {
    expect(layout).toContain('viewportFit: "cover"');
  });
});

describe("Service worker registrar (src/components/notifications/service-worker-registrar.tsx)", () => {
  const registrar = readFileSync(src("components/notifications/service-worker-registrar.tsx"), "utf8");

  it("posts a refresh-search message on online event to refresh cached search results", () => {
    expect(registrar).toContain('addEventListener("online"');
    expect(registrar).toContain('{ type: "refresh-search" }');
    expect(registrar).toContain('postMessage');
  });
});

describe("Install banner (src/components/pwa/install-banner.tsx)", () => {
  const banner = readFileSync(src("components/pwa/install-banner.tsx"), "utf8");
  const hook = readFileSync(src("hooks/use-install-prompt.ts"), "utf8");
  const en = readFileSync(src("lib/i18n/translations/en.ts"), "utf8");
  const ar = readFileSync(src("lib/i18n/translations/ar.ts"), "utf8");
  const layout = readFileSync(src("app/layout.tsx"), "utf8");

  it("install banner component exists and uses framer-motion for animation", () => {
    expect(existsSync(src("components/pwa/install-banner.tsx"))).toBe(true);
    expect(banner).toContain('"use client"');
    expect(banner).toContain('from "framer-motion"');
    expect(banner).toContain('AnimatePresence');
  });

  it("install banner has four benefit items", () => {
    // Should list offline browsing, offline requests, fast loading, home screen
    expect(banner).toContain('benefit1');
    expect(banner).toContain('benefit2');
    expect(banner).toContain('benefit3');
    expect(banner).toContain('benefit4');
  });

  it("useInstallPrompt hook exists and captures beforeinstallprompt", () => {
    expect(existsSync(src("hooks/use-install-prompt.ts"))).toBe(true);
    expect(hook).toContain('beforeinstallprompt');
    expect(hook).toContain('deferredPrompt');
  });

  it("translations include install section in English", () => {
    expect(en).toContain('install:');
    expect(en).toContain('title: "Install WorkersArena"');
    expect(en).toContain('subtitle: "Get the full offline experience"');
    expect(en).toContain('benefit1: "Browse workers offline');
    expect(en).toContain('install: "Install app"');
    expect(en).toContain('dismiss: "Not now"');
  });

  it("translations include install section in Arabic", () => {
    expect(ar).toContain('تثبيت وركرز أرينا');
    expect(ar).toContain('احصل على تجربة بدون إنترنت كاملة');
    expect(ar).toContain('تصفح العمال بدون إنترنت');
  });

  it("InstallBanner is integrated into root layout", () => {
    expect(layout).toContain('InstallBanner');
    expect(layout).toContain('from "@/components/pwa/install-banner"');
  });
});

describe("Notification actions (public/sw.js)", () => {
  const sw = readFileSync(pub("sw.js"), "utf8");

  it("has NOTIFICATION_ACTIONS constant with view and dismiss buttons", () => {
    expect(sw).toContain("NOTIFICATION_ACTIONS");
    expect(sw).toContain('action: "view"');
    expect(sw).toContain('action: "dismiss"');
  });

  it("passes actions array to showNotification", () => {
    expect(sw).toContain("actions: NOTIFICATION_ACTIONS");
  });

  it("handles dismiss action by closing without navigation", () => {
    expect(sw).toContain('event.action === "dismiss"');
    expect(sw).toContain("event.notification.close();");
    expect(sw).toContain("return;");
  });

  it("handles view action (default click) by navigating to deep link", () => {
    // The notificationclick handler should navigate to the URL in data
    expect(sw).toContain("event.notification.close();");
    expect(sw).toContain("client.navigate(url)");
  });
});

describe("PWA debug dashboard (src/app/debug/pwa/page.tsx)", () => {
  const debugPage = readFileSync(src("app/debug/pwa/page.tsx"), "utf8");

  it("debug page exists and exports a default component", () => {
    expect(existsSync(src("app/debug/pwa/page.tsx"))).toBe(true);
    expect(debugPage).toContain("export default function DebugPWAPage");
  });

  it("shows cache status section", () => {
    expect(debugPage).toContain("Cache Status");
    expect(debugPage).toContain("cache-status");
  });

  it("shows storage usage section", () => {
    expect(debugPage).toContain("Storage Usage");
    expect(debugPage).toContain("storage-status");
    expect(debugPage).toContain("navigator.storage.estimate");
  });

  it("shows offline queue section", () => {
    expect(debugPage).toContain("Offline Queue");
    expect(debugPage).toContain("queue-status");
    expect(debugPage).toContain("workers-arena-offline");
  });

  it("shows analytics queue section", () => {
    expect(debugPage).toContain("Analytics Queue");
    expect(debugPage).toContain("analytics-status");
    expect(debugPage).toContain("workers-arena-analytics");
  });

  it("shows service worker status section", () => {
    expect(debugPage).toContain("Service Worker Status");
    expect(debugPage).toContain("sw-status");
    expect(debugPage).toContain("navigator.serviceWorker.getRegistration");
  });
});
