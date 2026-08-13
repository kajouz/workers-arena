import { describe, expect, it } from "vitest";
import { normalize, searchWorkers } from "@/lib/data/search";
import { WORKERS, workerBySlug } from "@/lib/data/workers";
import { getWorkerBySlug, getWorkers } from "@/lib/data/repo";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";

describe("normalize", () => {
  it("strips Arabic diacritics and normalizes alef forms", () => {
    expect(normalize("سَبّاكٌ")).toBe("سباك");
    expect(normalize("أحمد إبراهيم").split(" ")[0]).toBe("احمد");
  });

  it("lowercases and trims Latin input", () => {
    expect(normalize("  Plumber!  ")).toBe("plumber");
  });
});

describe("searchWorkers — filters", () => {
  it("returns all workers without filters (expired subscriptions hidden)", () => {
    const { total } = searchWorkers({});
    const hidden = WORKERS.filter((w) => {
      const days = Math.ceil((new Date(w.subscription.expiresAt).getTime() - Date.now()) / 86400000);
      return days < 0;
    }).length;
    expect(total).toBe(WORKERS.length - hidden);
    expect(total).toBeGreaterThan(0);
  });

  it("filters by category", () => {
    const { items, total } = searchWorkers({ category: "plumbing" });
    expect(total).toBeGreaterThan(0);
    expect(items.every((w) => w.categorySlug === "plumbing")).toBe(true);
  });

  it("filters by city", () => {
    const { items } = searchWorkers({ city: "riyadh" });
    expect(items.every((w) => w.citySlug === "riyadh")).toBe(true);
  });

  it("filters by minimum rating", () => {
    const { items } = searchWorkers({ minRating: 4.7 });
    expect(items.every((w) => w.rating >= 4.7)).toBe(true);
  });

  it("filters by verified only", () => {
    const { items } = searchWorkers({ verifiedOnly: true });
    expect(items.every((w) => w.verified)).toBe(true);
  });

  it("filters by price range", () => {
    const { items } = searchWorkers({ priceMin: 100, priceMax: 500 });
    expect(items.every((w) => w.priceMax >= 100 && w.priceMin <= 500)).toBe(true);
  });

  it("combines filters (category + city + verified)", () => {
    const { items } = searchWorkers({ category: "ac-technician", city: "riyadh", verifiedOnly: true });
    expect(items.every((w) => w.categorySlug === "ac-technician" && w.citySlug === "riyadh" && w.verified)).toBe(true);
  });
});

describe("searchWorkers — query & fuzzy", () => {
  it("finds workers by English query", () => {
    const { items } = searchWorkers({ query: "plumber" });
    expect(items.length).toBeGreaterThan(0);
  });

  it("finds workers by Arabic query", () => {
    const { items } = searchWorkers({ query: "سباك" });
    expect(items.length).toBeGreaterThan(0);
  });

  it("finds workers by name", () => {
    const { items } = searchWorkers({ query: "Khaled" });
    expect(items.some((w) => w.nameEn.includes("Khaled"))).toBe(true);
  });

  it("fuzzy-matches near-miss queries (subsequence on short fields)", () => {
    // "pntr" is a subsequence of "painter" — should surface the painter
    const { items } = searchWorkers({ query: "pntr" });
    expect(items.some((w) => w.categorySlug === "painting")).toBe(true);
  });

  it("ranks verified/premium workers above others for ambiguous queries", () => {
    const { items } = searchWorkers({ query: "technician" });
    const top = items[0];
    expect(top).toBeDefined();
  });
});

describe("searchWorkers — sorting", () => {
  it("sorts by rating descending", () => {
    const { items } = searchWorkers({ sort: "rating" });
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].rating).toBeGreaterThanOrEqual(items[i].rating);
    }
  });

  it("sorts by price ascending", () => {
    const { items } = searchWorkers({ sort: "priceLow" });
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].priceMin).toBeLessThanOrEqual(items[i].priceMin);
    }
  });

  it("sorts by experience descending", () => {
    const { items } = searchWorkers({ sort: "experience" });
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].yearsExp).toBeGreaterThanOrEqual(items[i].yearsExp);
    }
  });
});

describe("searchWorkers — pagination", () => {
  it("paginates correctly and returns the total", () => {
    const page1 = searchWorkers({ page: 1 });
    const page2 = searchWorkers({ page: 2 });
    expect(page1.items.length).toBeGreaterThan(0);
    expect(page2.items.length).toBeGreaterThan(0);
    const ids1 = new Set(page1.items.map((w) => w.id));
    expect(page2.items.every((w) => !ids1.has(w.id))).toBe(true);
    expect(page1.total).toBe(page2.total);
  });
});

describe("feeWaivedOnly filter (M5 — docs/booking-take-rate.md)", () => {
  it("narrows results to Enterprise (fee-waived) workers", () => {
    const waived = searchWorkers({ feeWaivedOnly: true });
    expect(waived.total).toBeGreaterThan(0);
    expect(waived.items.every((w) => isPlanFeeExempt(w.subscription.plan))).toBe(true);
    // Bilal is the seeded Enterprise worker; khaled (premium) never appears.
    expect(waived.items.some((w) => w.slug === "bilal-mansour-cleaning")).toBe(true);
    expect(waived.items.some((w) => w.slug === "khaled-al-harbi-plumbing")).toBe(false);
  });

  it("passes through the repo seam with W1 signals stamped", async () => {
    const { items } = await getWorkers({ feeWaivedOnly: true });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((w) => isPlanFeeExempt(w.subscription.plan))).toBe(true);
    expect(items.every((w) => w.responseRate !== undefined)).toBe(true);
  });
});

describe("W1 trust signals (repo seam, demo mode)", () => {
  it("stamps responseRate + availableThisWeek on search results", async () => {
    const { items } = await getWorkers({ query: "Khaled" });
    const khaled = items.find((w) => w.slug === "khaled-al-harbi-plumbing");
    expect(khaled).toBeDefined();
    // Seeded BK-1001 is still REQUESTED → 0% answered (honest: he hasn't
    // responded to Sara yet).
    expect(khaled!.responseRate).toBe(0);
    // Seeded 09:00 slot is AVAILABLE tomorrow → within the 7-day window.
    expect(khaled!.availableThisWeek).toBe(true);
  });

  it("leaves workers without bookings/slots as null/false", async () => {
    const w = await getWorkerBySlug("mohammed-farouk-electrical");
    expect(w?.responseRate).toBeNull();
    expect(w?.availableThisWeek).toBe(false);
  });

  it("does not mutate the shared demo dataset (fresh copies only)", async () => {
    const raw = workerBySlug("khaled-al-harbi-plumbing");
    expect(raw?.responseRate).toBeUndefined();
    await getWorkers({});
    await getWorkerBySlug("khaled-al-harbi-plumbing");
    expect(workerBySlug("khaled-al-harbi-plumbing")?.responseRate).toBeUndefined();
  });

  it("stamps the showcase workers seeded with availability + history", async () => {
    // Ali: 1 COMPLETED (45d ago) → 100% answered + a free slot this week.
    const ali = await getWorkerBySlug("ali-hassan-carpentry");
    expect(ali?.responseRate).toBe(100);
    expect(ali?.availableThisWeek).toBe(true);

    // Omar/Ahmed: availability only, no booking history → rate stays null.
    const omar = await getWorkerBySlug("omar-al-mutairi-ac-technician");
    expect(omar?.responseRate).toBeNull();
    expect(omar?.availableThisWeek).toBe(true);
    const ahmed = await getWorkerBySlug("ahmed-el-sayed-masonry");
    expect(ahmed?.responseRate).toBeNull();
    expect(ahmed?.availableThisWeek).toBe(true);

    // Bilal is the demo Enterprise worker — his cards carry the fee badge.
    const bilal = await getWorkerBySlug("bilal-mansour-cleaning");
    expect(bilal?.subscription.plan).toBe("enterprise");
  });
});
