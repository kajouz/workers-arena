import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetBookingsStore } from "@/lib/data/bookings";

/**
 * Tests for the demo-mode-only seed-worker-completed-booking route — mirrors
 * tests/seed-refunded-campaign.test.ts (same conventions: store reset per
 * test, env pinned so the simulated provider is deterministic, temp-file
 * isolation for the admin activity feed, vi.resetModules for the import-time
 * DEMO_MODE const).
 */

const ADMIN_ACTIVITY_FILE = ".data/seed-worker-test-activity.json";

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY; // pin the simulated provider
  process.env.ADMIN_ACTIVITY_FILE = ADMIN_ACTIVITY_FILE;
  resetBookingsStore();
});

afterEach(() => {
  vi.resetModules();
  delete process.env.ADMIN_ACTIVITY_FILE;
  // The store survives module resets by design (globalThis-backed), so the
  // next test's resetBookingsStore() in beforeEach is what matters — but the
  // resetModules here means the next import of the route re-evaluates its
  // isDemoMode const against whatever env the next test stubbed.
});

async function post(env: Record<string, string> = {}) {
  const old = { ...process.env };
  Object.assign(process.env, env);
  vi.resetModules();
  try {
    const { POST } = await import("@/app/api/dev/seed-worker-completed-booking/route");
    const res = await POST();
    return { status: res.status, body: await res.json() };
  } finally {
    process.env = old;
  }
}

describe("POST /api/dev/seed-worker-completed-booking", () => {
  it("seeds a customer-confirmed COMPLETED booking for the demo worker (the worker-receipt case)", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, number: "BK-0992", status: "completed" });

    const { demoGetBookingByNumber } = await import("@/lib/data/bookings");
    const booking = demoGetBookingByNumber("BK-0992");
    expect(booking).not.toBeNull();
    // The completion is CUSTOMER-confirmed — the demoConfirmBookingCompletion
    // path that emails the WORKER the payout receipt (workerEmailKind →
    // worker-completion-confirmed), unlike the system-actor showcase seeds.
    const completed = [...booking!.events].reverse().find((e) => e.status === "completed");
    expect(completed?.actorType).toBe("customer");

    // The seed carries the bilingual catalog serviceItem — the AR worker-
    // receipt email's "Service" row renders the Arabic name (not the EN title).
    expect(booking!.serviceItem).toEqual({
      nameEn: "Bathroom renovation",
      nameAr: "تجديد حمام",
      price: 900,
      unit: "job",
    });

    const { workerEmailKind, workerEmailPreviewFor } = await import("@/lib/data/booking-notifications");
    expect(workerEmailKind(booking!)).toBe("worker-completion-confirmed");
    const preview = workerEmailPreviewFor(booking!, {
      nameEn: "Khaled Al-Harbi",
      nameAr: "خالد الحربي",
      email: "khaled@plumbfix.sa",
      languages: [{ code: "ar" }],
    });
    expect(preview).not.toBeNull();
    expect(preview!.subjectEn).toContain("BK-0992");
    expect(preview!.htmlEn).toContain("payout is on its way");
    expect(preview!.subjectAr).toContain("BK-0992");
    expect(preview!.htmlAr).toContain("دفعتك في الطريق");
  });

  it("is idempotent — a re-seed returns the same booking and leaves the store untouched", async () => {
    await post();
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, id: "bk-0992", alreadySeeded: true });

    const { demoGetAllBookings } = await import("@/lib/data/bookings");
    const completed = demoGetAllBookings().filter((b) => b.status === "completed");
    expect(completed).toHaveLength(2); // BK-0990 (Ali) + BK-0992 — no duplicates
    expect(completed.filter((b) => b.number === "BK-0992")).toHaveLength(1);
  });

  it("refuses in production (404 demo-only) and seeds nothing", async () => {
    const { status, body } = await post({ DEMO_MODE: "false" });
    expect(status).toBe(404);
    expect(body).toEqual({ error: "demo-only" });

    const { demoGetBookingByNumber } = await import("@/lib/data/bookings");
    expect(demoGetBookingByNumber("BK-0992")).toBeNull();
  });
});
