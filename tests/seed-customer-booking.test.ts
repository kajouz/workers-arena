/**
 * ────────────────────────────────────────────────────────────────────────────
 * SEED-CUSTOMER-BOOKING ROUTE (demo-mode-only fixture)
 * ────────────────────────────────────────────────────────────────────────────
 * POST /api/dev/seed-customer-booking — the fixture the e2e hydration smoke
 * uses to give the customer /bookings rows a previewable booking. The demo
 * store seeds Sara with only the REQUESTED BK-1001 (customerEmailKind null —
 * no email sent, so no Preview button), so the smoke needs a deterministic
 * COMPLETED booking whose received-email preview renders. This route seeds it
 * through demoSeedCompletedBookingForCustomer — the same pure-data showcase
 * construction the seeded BK-0990 uses (system-actor completion = the
 * auto-confirm path that emails the customer the receipt).
 *
 * These tests cover the route's three branches:
 *   1. Happy path — a COMPLETED booking for Sara lands in the store with a
 *      system-actor completion event (the preview renders) and a real worker.
 *   2. Idempotent re-seed — a second call finds the fixed BK-0991 already
 *      seeded and no-ops (no duplicate booking or slot).
 *   3. Production refusal — DEMO_MODE=false (the route is unreachable in
 *      real deployments) returns 404 and touches nothing.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetBookingsStore, demoGetBookingByNumber, demoGetCustomerBookings } from "../src/lib/data/bookings";

/** POST the seed route with the current module registry. */
async function postSeed(): Promise<Response> {
  const { POST } = await import("../src/app/api/dev/seed-customer-booking/route");
  return POST();
}

beforeEach(() => {
  resetBookingsStore();
  // The route is demo-gated — keep demo mode ON for the happy-path tests
  // (the production-refusal test stubs it off explicitly).
  vi.stubEnv("DEMO_MODE", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/dev/seed-customer-booking (demo-mode fixture)", () => {
  it("seeds a COMPLETED booking for the customer whose received-email preview renders", async () => {
    const res = await postSeed();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; number?: string; status?: string };
    expect(body.ok).toBe(true);
    expect(body.number).toBe("BK-0991");
    expect(body.status).toBe("completed");

    const booking = demoGetBookingByNumber("BK-0991");
    expect(booking).not.toBeNull();
    expect(booking?.status).toBe("completed");
    expect(booking?.customerEmail).toBe("sara@example.com");

    // The completion is SYSTEM-actor — the auto-confirm path that emails the
    // customer the completion receipt → customerEmailKind non-null → the
    // /bookings row renders the Preview button (mirroring BK-0990).
    const completed = [...(booking?.events ?? [])].reverse().find((e) => e.status === "completed");
    expect(completed?.actorType).toBe("system");

    // The seed carries the bilingual catalog serviceItem — the AR receipt
    // email's "Service" row renders the Arabic name (not the EN jobTitle).
    expect(booking?.serviceItem).toEqual({
      nameEn: "Fix leaking pipe",
      nameAr: "إصلاح تسريب ماسورة",
      price: 120,
      unit: "job",
    });

    // The worker resolved through the real getWorkerBySlug seam — the row's
    // worker display data is genuine (Khaled, Sara's seeded worker).
    expect(booking?.workerId).toBeTruthy();

    // Sara's /bookings page now carries the previewable row (plus BK-1001).
    const saraBookings = demoGetCustomerBookings({ email: "sara@example.com" });
    expect(saraBookings.map((b) => b.number)).toContain("BK-0991");
  });

  it("re-seeding is idempotent — a second call no-ops instead of duplicating the booking", async () => {
    const first = await postSeed();
    const firstBody = (await first.json()) as { id?: string };
    const countAfterFirst = demoGetCustomerBookings({ email: "sara@example.com" }).length;

    const second = await postSeed();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id?: string; alreadySeeded?: boolean };
    expect(secondBody.alreadySeeded).toBe(true);
    expect(secondBody.id).toBe(firstBody.id);

    // No duplicate: Sara's booking list is unchanged and BK-0991 is unique.
    expect(demoGetCustomerBookings({ email: "sara@example.com" })).toHaveLength(countAfterFirst);
    expect(demoGetBookingByNumber("BK-0991")?.id).toBe(firstBody.id);
  });

  it("refuses to run outside demo mode (production → 404, nothing touched)", async () => {
    // The route's demo gate is isDemoMode — a module-load const in repo.ts —
    // so stub DEMO_MODE off and reset the module registry first, forcing the
    // const to re-evaluate against the stubbed env, exactly like a production
    // deployment's process env. The demo bookings store lives on globalThis
    // (survives module resets), so the post-call store assertions stay valid.
    vi.stubEnv("DEMO_MODE", "false");
    vi.resetModules();
    const { POST } = await import("../src/app/api/dev/seed-customer-booking/route");
    const res = await POST();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("demo-only");

    // Nothing was seeded — no BK-0991, Sara still has only her REQUESTED BK-1001.
    expect(demoGetBookingByNumber("BK-0991")).toBeNull();
    expect(demoGetCustomerBookings({ email: "sara@example.com" }).map((b) => b.number)).toEqual(["BK-1001"]);
  });
});
