import { describe, expect, it } from "vitest";
import {
  distanceBoostKm,
  normalize,
  radiusCenter,
  scoreWorkerQuery,
  searchWorkers,
} from "@/lib/data/search";
import { cityBySlug } from "@/lib/data/cities";
import { WORKERS } from "@/lib/data/workers";
import { computeCategoryConversion, type CategoryOfferInput } from "@/lib/data/category-conversion";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");

describe("shared query scoring (demo ⇄ prisma parity)", () => {
  it("scores an exact-name match above a fuzzy one", () => {
    const named = WORKERS.find((w) => normalize(w.nameEn).length > 0)!;
    const exact = scoreWorkerQuery(named, named.nameEn);
    expect(exact).toBeGreaterThan(100); // rankBonus + 120 × 4
    const fuzzy = scoreWorkerQuery(named, named.nameEn.slice(0, 2) + "x" + named.nameEn.slice(3));
    expect(fuzzy).toBeLessThan(exact);
  });

  it("returns 0 for a worker the query does not match (caller filters out)", () => {
    expect(scoreWorkerQuery(WORKERS[0]!, "zzqqqqx")).toBe(0);
  });
});

describe("geo/radius search", () => {
  it("radiusCenter prefers explicit coordinates over the city centre", () => {
    const center = radiusCenter({ city: "beirut", nearLat: 33.9, nearLng: 35.5 });
    expect(center).toEqual({ lat: 33.9, lng: 35.5 });
    // City-anchored fallback.
    const beirut = cityBySlug("beirut")!;
    expect(radiusCenter({ city: "beirut" })).toEqual({ lat: beirut.lat, lng: beirut.lng });
    // No centre anywhere → no radius filter possible.
    expect(radiusCenter({})).toBeUndefined();
  });

  it("distanceBoostKm fades linearly to 0 at the radius edge", () => {
    expect(distanceBoostKm(0, 10)).toBeCloseTo(12);
    expect(distanceBoostKm(5, 10)).toBeCloseTo(6);
    expect(distanceBoostKm(10, 10)).toBeCloseTo(0);
    expect(distanceBoostKm(25, 10)).toBe(0); // beyond the edge
    expect(distanceBoostKm(5, 0)).toBe(0); // degenerate radius
  });

  it("filters workers outside the radius of the city centre", () => {
    const beirut = cityBySlug("beirut")!;
    const unfiltered = searchWorkers({ city: "beirut" });
    expect(unfiltered.total).toBeGreaterThan(0);
    // A tiny radius around the city centre keeps only the closest workers
    // (at least one is dropped in the seeded dataset — workers span areas).
    const tight = searchWorkers({ city: "beirut", radiusKm: 0.5 });
    expect(tight.total).toBeLessThanOrEqual(unfiltered.total);
    for (const w of tight.items) {
      // every returned worker sits within the radius (haversine tolerance 1m)
      expect(Math.hypot(w.lat - beirut.lat, w.lng - beirut.lng)).toBeLessThan(1);
    }
  });

  it("a radius without a resolvable centre is a no-op", () => {
    const withRadius = searchWorkers({ radiusKm: 5 });
    const without = searchWorkers({});
    expect(withRadius.total).toBe(without.total);
  });
});

describe("per-category conversion metrics", () => {
  function offer(overrides: Partial<CategoryOfferInput> = {}): CategoryOfferInput {
    return {
      offerId: "of-1",
      leadId: "qr-1",
      categorySlug: "plumbing",
      grade: "gold",
      status: "offered",
      priceCredits: 20,
      offeredAt: "2026-09-10T12:00:00.000Z",
      ...overrides,
    };
  }

  it("computes the funnel per category (leads, purchases, jobs, credits)", () => {
    const report = computeCategoryConversion(
      [
        offer({ offerId: "a", leadId: "qr-1", categorySlug: "plumbing", status: "purchased", priceCredits: 20 }),
        offer({ offerId: "b", leadId: "qr-1", categorySlug: "plumbing", status: "revoked" }),
        offer({ offerId: "c", leadId: "qr-2", categorySlug: "plumbing", status: "offered" }),
        offer({ offerId: "d", leadId: "qr-3", categorySlug: "electrical", status: "purchased", priceCredits: 9 }),
      ],
      [{ leadId: "qr-1", createdAt: "2026-09-15T12:00:00.000Z" }], // qr-1 became a job
      [{ offerId: "d", converted: true }], // electrical purchase self-converted
      { nowMs: NOW }
    );
    expect(report.windowDays).toBe(30);

    const plumbing = report.window.find((r) => r.categorySlug === "plumbing")!;
    expect(plumbing.leads).toBe(2); // qr-1, qr-2
    expect(plumbing.offers).toBe(3);
    expect(plumbing.purchased).toBe(1);
    expect(plumbing.purchaseRate).toBe(33);
    expect(plumbing.jobsWon).toBe(1); // rebate attributed
    expect(plumbing.jobRate).toBe(50); // 1 of 2 leads
    expect(plumbing.grossCredits).toBe(20);

    const electrical = report.window.find((r) => r.categorySlug === "electrical")!;
    expect(electrical.jobsWon).toBe(1); // rating.converted
    expect(electrical.jobRate).toBe(100);
  });

  it("the window cohort excludes offers older than the window; allTime keeps them", () => {
    const offers = [
      offer({ offerId: "recent", offeredAt: "2026-09-18T00:00:00.000Z" }),
      offer({ offerId: "old", offeredAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const report = computeCategoryConversion(offers, [], [], { windowDays: 30, nowMs: NOW });
    const win = report.window.find((r) => r.categorySlug === "plumbing")!;
    expect(win.offers).toBe(1);
    const all = report.allTime.find((r) => r.categorySlug === "plumbing")!;
    expect(all.offers).toBe(2);
  });

  it("dedupes job attribution — a lead counted once even with multiple signals", () => {
    const report = computeCategoryConversion(
      [offer({ offerId: "a", leadId: "qr-1", status: "purchased" })],
      [{ leadId: "qr-1", createdAt: "2026-09-15T00:00:00.000Z" }],
      [{ offerId: "a", converted: true }],
      { nowMs: NOW }
    );
    expect(report.window[0]!.jobsWon).toBe(1);
  });

  it("returns empty rows for an empty cohort", () => {
    const report = computeCategoryConversion([], [], [], { nowMs: NOW });
    expect(report.window).toEqual([]);
    expect(report.allTime).toEqual([]);
  });
});
