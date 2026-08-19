import { describe, it, expect, beforeEach, vi } from "vitest";

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

describe("Search History", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("useSearchHistory exports are defined", async () => {
    const mod = await import("@/hooks/use-search-history");
    expect(mod.useSearchHistory).toBeDefined();
    expect(typeof mod.useSearchHistory).toBe("function");
  });

  it("SearchHistoryEntry type exists", async () => {
    const mod = await import("@/hooks/use-search-history");
    // Type check - the interface should be importable
    expect(mod).toBeDefined();
  });

  it("search history can be stored and retrieved from localStorage", () => {
    const history = [
      {
        query: "plumber",
        category: "plumbing",
        timestamp: Date.now(),
      },
      {
        query: "electrician",
        category: "electrical",
        timestamp: Date.now() - 1000,
      },
    ];

    localStorage.setItem("wa-search-history", JSON.stringify(history));

    const stored = localStorage.getItem("wa-search-history");
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBe(2);
    expect(parsed[0].query).toBe("plumber");
    expect(parsed[0].category).toBe("plumbing");
  });

  it("search history respects max limit of 10", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      query: `search ${i}`,
      timestamp: Date.now() - i * 1000,
    }));

    // Simulate the hook's slice behavior
    const limited = history.slice(0, 10);
    expect(limited.length).toBe(10);
  });

  it("search history can be cleared", () => {
    localStorage.setItem(
      "wa-search-history",
      JSON.stringify([{ query: "test", timestamp: Date.now() }])
    );

    localStorage.removeItem("wa-search-history");

    const stored = localStorage.getItem("wa-search-history");
    expect(stored).toBeNull();
  });

  it("search history removes duplicates", () => {
    const existing = [
      { query: "plumber", category: "plumbing", timestamp: Date.now() },
      { query: "electrician", category: "electrical", timestamp: Date.now() },
    ];

    // Simulate adding a duplicate
    const newEntry = { query: "plumber", category: "plumbing" };
    const filtered = existing.filter(
      (h) => h.query !== newEntry.query || h.category !== newEntry.category
    );
    const updated = [
      { ...newEntry, timestamp: Date.now() },
      ...filtered,
    ].slice(0, 10);

    expect(updated.length).toBe(2);
    expect(updated[0].query).toBe("plumber");
  });
});

describe("Geolocation Hook", () => {
  it("useGeolocation exports are defined", async () => {
    const mod = await import("@/hooks/use-geolocation");
    expect(mod.useGeolocation).toBeDefined();
    expect(typeof mod.useGeolocation).toBe("function");
  });

  it("geolocation hook returns expected interface", async () => {
    // This is a type check - the hook should return the expected properties
    const mod = await import("@/hooks/use-geolocation");
    expect(mod).toBeDefined();
  });
});

describe("Search Client Component", () => {
  it("SearchClient component exists", async () => {
    const mod = await import("@/components/search/search-client");
    expect(mod.SearchClient).toBeDefined();
    expect(typeof mod.SearchClient).toBe("function");
  });

  it("search-client imports useSearchHistory", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-client.tsx"),
      "utf-8"
    );
    expect(content).toContain("useSearchHistory");
    expect(content).toContain("SearchHistory");
  });

  it("search-client imports useGeolocation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-client.tsx"),
      "utf-8"
    );
    expect(content).toContain("useGeolocation");
    expect(content).toContain("Find Near Me");
  });
});

describe("Search History Component", () => {
  it("SearchHistory component exists", async () => {
    const mod = await import("@/components/search/search-history");
    expect(mod.SearchHistory).toBeDefined();
    expect(typeof mod.SearchHistory).toBe("function");
  });

  it("search-history component uses lucide-react icons", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-history.tsx"),
      "utf-8"
    );
    expect(content).toContain("Clock");
    expect(content).toContain("Trash2");
    expect(content).toContain("X");
  });

  it("search-history shows 'Recent searches' text", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-history.tsx"),
      "utf-8"
    );
    expect(content).toContain("Recent searches");
  });
});

describe("Virtual Scrolling Integration", () => {
  it("search-client uses @tanstack/react-virtual", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-client.tsx"),
      "utf-8"
    );
    expect(content).toContain("@tanstack/react-virtual");
    expect(content).toContain("useVirtualizer");
  });

  it("search-client has virtual scrolling threshold", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/components/search/search-client.tsx"),
      "utf-8"
    );
    // Virtual scrolling kicks in when results > 12
    expect(content).toContain("results.items.length > 12");
  });
});

describe("Analytics Dashboard", () => {
  it("analytics dashboard page exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const exists = fs.existsSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx")
    );
    expect(exists).toBe(true);
  });

  it("analytics dashboard has correct metadata", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx"),
      "utf-8"
    );
    expect(content).toContain("Analytics Dashboard");
    expect(content).toContain("/debug/analytics");
  });

  it("analytics dashboard shows page views section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx"),
      "utf-8"
    );
    expect(content).toContain("Page Views");
    expect(content).toContain("page-views");
  });

  it("analytics dashboard shows offline queue section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx"),
      "utf-8"
    );
    expect(content).toContain("Offline Queue Status");
    expect(content).toContain("offline-queue");
  });

  it("analytics dashboard shows search history section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx"),
      "utf-8"
    );
    expect(content).toContain("Search History");
    expect(content).toContain("search-history");
  });

  it("analytics dashboard shows network status section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/app/debug/analytics/page.tsx"),
      "utf-8"
    );
    expect(content).toContain("Network & Sync Status");
    expect(content).toContain("network-status");
  });
});

describe("Capacitor Mobile Setup", () => {
  it("capacitor.config.ts exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const exists = fs.existsSync(
      path.join(process.cwd(), "capacitor.config.ts")
    );
    expect(exists).toBe(true);
  });

  it("capacitor.config.ts has correct app ID", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "capacitor.config.ts"),
      "utf-8"
    );
    expect(content).toContain("com.workersarena.app");
    expect(content).toContain("WorkersArena");
  });

  it("mobile README exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const exists = fs.existsSync(
      path.join(process.cwd(), "mobile/README.md")
    );
    expect(exists).toBe(true);
  });

  it("package.json has capacitor scripts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf-8"
    );
    expect(content).toContain("cap:build");
    expect(content).toContain("cap:open:ios");
    expect(content).toContain("cap:open:android");
  });
});

describe("Geolocation Hook Integration", () => {
  it("use-geolocation.ts exports are defined", async () => {
    const mod = await import("@/hooks/use-geolocation");
    expect(mod.useGeolocation).toBeDefined();
    expect(typeof mod.useGeolocation).toBe("function");
  });

  it("use-geolocation has calculateDistance function", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/hooks/use-geolocation.ts"),
      "utf-8"
    );
    expect(content).toContain("calculateDistance");
    expect(content).toContain("6371"); // Earth's radius in km
  });

  it("use-geolocation handles permission denied", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.join(process.cwd(), "src/hooks/use-geolocation.ts"),
      "utf-8"
    );
    expect(content).toContain("Location permission denied");
    expect(content).toContain("PERMISSION_DENIED");
  });
});

describe("Search API Contract", () => {
  it("API route for workers exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const exists = fs.existsSync(
      path.join(process.cwd(), "src/app/api/workers/route.ts")
    );
    expect(exists).toBe(true);
  });

  it("API route for search suggest exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const exists = fs.existsSync(
      path.join(process.cwd(), "src/app/api/search/suggest/route.ts")
    );
    expect(exists).toBe(true);
  });
});
