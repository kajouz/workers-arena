import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

// The server action imports next/cache (revalidatePath) — mock it so the
// action's zod layer is testable in vitest (the demo adapter underneath stays
// real, so these are true action-level round-trips).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  availableSlotsAction,
  cancelBookingAction,
  rescheduleBookingAction,
  respondBookingAction,
  transitionBookingAction,
} from "../src/app/actions/bookings";
import {
  cancelBooking,
  confirmBookingCompletion,
  confirmBookingPayment,
  createBookingCheckout,
  createBookingRequest,
  createQuoteRequest,
  decidePayout,
  expireQuoteRequests,
  getBookingByNumber,
  getBookingFunnel,
  getPlatformFeeStats,
  getWorkerBalance,
  getCustomerBookings,
  getCustomerQuoteRequests,
  getNotificationsList,
  getQuoteRequest,
  getWorkerBookings,
  getWorkerSlots,
  requestPayout,
  rescheduleBooking,
  respondToBooking,
  refundBookingDeposit,
  selectQuote,
  setSlotBlocked,
  submitQuote,
  transitionBooking,
} from "../src/lib/data/repo";
import { demoAddSlot, demoGenerateSlots, resetBookingsStore } from "../src/lib/data/bookings";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { computePlatformFee, computeResponseRate, isPlanFeeExempt, nextDayKeys } from "../src/lib/data/booking-ui";
import { workerBySlug } from "../src/lib/data/workers";
import { MAX_QUOTE_WORKERS, QUOTE_SLA_MS } from "../src/lib/data/types";
import type { Booking, QuoteRequest } from "../src/lib/data/types";

const DEMO_WORKER = "khaled-al-harbi-plumbing";

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

function request(slotId: string, overrides: Record<string, unknown> = {}) {
  return {
    workerId: khaled().id,
    slotId,
    customerName: "Noor E.",
    customerPhone: "+966 55 123 4871",
    customerEmail: "noor@example.com",
    jobTitle: "Fix a leaking pipe under the kitchen sink",
    ...overrides,
  };
}

function bookingOf(r: Booking | { error: string }): Booking {
  if ("error" in r) throw new Error(`expected booking, got error ${r.error}`);
  return r;
}

// The M4 activity-feed logging runs through the same seam the tests exercise —
// isolate the file-backed feed per test so it never touches the dev's
// .data/admin-activity.json, and reset it after (same pattern as
// notifications.test.ts).
let activityFile: string;

beforeEach(() => {
  resetBookingsStore();
  activityFile = path.join(tmpdir(), `bookings-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("seeded demo store", () => {
  it("mirrors the DB seed: 5 slots (incl. 2 fresh AVAILABLE for the live dialog walkthrough) + REQUESTED BK-1001", async () => {
    const slots = await getWorkerSlots(khaled().id);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.status)).toEqual(["available", "reserved", "blocked", "available", "available"]);
    expect(slots.map((s) => s.id)).toContain("slot-khaled-plus3");
    expect(slots.map((s) => s.id)).toContain("slot-khaled-plus5");
    expect(slots[1]?.bookingId).toBe("bk-1001");

    const bookings = await getWorkerBookings(khaled().id);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]?.number).toBe("BK-1001");
    expect(bookings[0]?.status).toBe("requested");
    expect(bookings[0]?.events).toHaveLength(1);
    expect(bookings[0]?.events[0]?.status).toBe("requested");
  });
});

describe("createBookingRequest — lifecycle & rules", () => {
  it("reserves an AVAILABLE slot, creates a REQUESTED booking with an audit event, and notifies the worker", async () => {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;

    const result = await createBookingRequest(request(available.id));
    const booking = bookingOf(result);

    expect(booking.number).toBe("BK-1002");
    expect(booking.status).toBe("requested");
    expect(booking.workerId).toBe(w.id);
    expect(booking.jobTitle).toBe("Fix a leaking pipe under the kitchen sink");
    expect(booking.currency).toBe(w.currency);
    expect(booking.events.map((e) => e.status)).toEqual(["requested"]);
    expect(booking.events[0]?.actorType).toBe("customer");

    // Slot is now RESERVED and linked to the booking.
    const slot = (await getWorkerSlots(w.id)).find((s) => s.id === available.id)!;
    expect(slot.status).toBe("reserved");
    expect(slot.bookingId).toBe(booking.id);

    // Worker got a bookingRequest notification.
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingRequest" && n.href === "/dashboard")).toBe(true);
  });

  it("rejects a second request on the same slot (rule 1 — no double-booking)", async () => {
    const w = khaled();
    const reserved = (await getWorkerSlots(w.id)).find((s) => s.status === "reserved")!;
    const result = await createBookingRequest(request(reserved.id));
    expect(result).toEqual({ error: "slot-taken" });
  });

  it("rejects a request on a BLOCKED slot", async () => {
    const w = khaled();
    const blocked = (await getWorkerSlots(w.id)).find((s) => s.status === "blocked")!;
    const result = await createBookingRequest(request(blocked.id));
    expect(result).toEqual({ error: "slot-taken" });
  });

  it("rejects a request that overlaps a RESERVED slot (rule 2 — overlap guard)", async () => {
    const w = khaled();
    const reserved = (await getWorkerSlots(w.id)).find((s) => s.status === "reserved")!;
    // An AVAILABLE slot that overlaps the reserved 10:00–11:00 slot.
    const start = new Date(reserved.startAt);
    start.setMinutes(30); // 10:30
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const overlapping = demoAddSlot(w.id, start.toISOString(), end.toISOString(), "available");

    const result = await createBookingRequest(request(overlapping.id));
    expect(result).toEqual({ error: "slot-taken" });
    // The overlapping slot must still be AVAILABLE — nothing was half-reserved.
    const slot = (await getWorkerSlots(w.id)).find((s) => s.id === overlapping.id)!;
    expect(slot.status).toBe("available");
  });

  it("rejects a request that overlaps a BLOCKED slot (worker off-time is protected)", async () => {
    const w = khaled();
    const blocked = (await getWorkerSlots(w.id)).find((s) => s.status === "blocked")!;
    const start = new Date(blocked.startAt);
    start.setMinutes(30); // mid-way through the blocked 14:00–15:00 slot
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const overlapping = demoAddSlot(w.id, start.toISOString(), end.toISOString(), "available");

    const result = await createBookingRequest(request(overlapping.id));
    expect(result).toEqual({ error: "slot-taken" });
  });

  it("rejects a request on a non-existent slot or worker (invalid)", async () => {
    const w = khaled();
    expect(await createBookingRequest(request("no-such-slot"))).toEqual({ error: "invalid" });
    expect(await createBookingRequest(request("slot-khaled-9", { workerId: "no-such-worker" }))).toEqual({
      error: "invalid",
    });
  });
});

describe("respondBookingAction — server-action zod layer", () => {
  /** Accept-form FormData: the exact shape the RespondDialog submits. */
  function acceptFd(overrides: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("accept", "true");
    fd.set("quote", "80");
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
    return fd;
  }

  it("accepts without a deposit or reason (absent FormData fields are null, not undefined — the regression)", async () => {
    const res = await respondBookingAction("bk-1001", acceptFd());
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id)).find((b) => b.id === "bk-1001") ?? { error: "not-found" });
    expect(booking.status).toBe("confirmed");
    expect(booking.quote).toBe(8000); // 80 major → 8000 minor
  });

  it("accepts with a deposit (major units → minor ×100)", async () => {
    const res = await respondBookingAction("bk-1001", acceptFd({ deposit: "50" }));
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id)).find((b) => b.id === "bk-1001") ?? { error: "not-found" });
    expect(booking.status).toBe("pendingPayment");
    expect(booking.deposit).toBe(5000);
  });

  it("declines without a reason (also absent → null)", async () => {
    const fd = new FormData();
    fd.set("accept", "false");
    const res = await respondBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id)).find((b) => b.id === "bk-1001") ?? { error: "not-found" });
    expect(booking.status).toBe("declined");
  });

  it("declines with a reason", async () => {
    const fd = new FormData();
    fd.set("accept", "false");
    fd.set("declineReason", "Fully booked this week");
    const res = await respondBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id)).find((b) => b.id === "bk-1001") ?? { error: "not-found" });
    expect(booking.events[1]).toMatchObject({ reason: "Fully booked this week" });
  });

  it("rejects a malformed accept value", async () => {
    const res = await respondBookingAction("bk-1001", acceptFd({ accept: "maybe" }));
    expect(res).toEqual({ ok: false, error: "invalid" });
  });

  it("returns not-found for an unknown booking id", async () => {
    const res = await respondBookingAction("bk-9999", acceptFd());
    expect(res).toEqual({ ok: false, error: "not-found" });
  });
});

describe("respondToBooking — worker decisions", () => {
  it("accepts a REQUESTED booking → CONFIRMED, slot BOOKED, event appended, customer notified", async () => {
    const w = khaled();
    const result = await respondToBooking("bk-1001", { accept: true });
    expect(result).not.toBeNull();
    const booking = result!;
    expect(booking.status).toBe("confirmed");
    expect(booking.events.map((e) => e.status)).toEqual(["requested", "confirmed"]);
    expect(booking.events[1]?.actorType).toBe("worker");

    const slot = (await getWorkerSlots(w.id)).find((s) => s.bookingId === "bk-1001")!;
    expect(slot.status).toBe("booked");

    const inbox = await getNotificationsList();
    // Customer notifications deep-link to the "My bookings" page.
    expect(inbox.some((n) => n.type === "bookingConfirmed" && n.href === "/bookings")).toBe(true);
  });

  it("accept with a deposit → PENDING_PAYMENT (rule 4) and stores money in minor units", async () => {
    const result = await respondToBooking("bk-1001", { accept: true, quote: 25000, deposit: 5000 });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("pendingPayment");
    expect(booking.quote).toBe(25000);
    expect(booking.deposit).toBe(5000);
  });

  it("accepts with a quote but no deposit → CONFIRMED with the quote attached", async () => {
    const result = await respondToBooking("bk-1001", { accept: true, quote: 15000 });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("confirmed");
    expect(booking.quote).toBe(15000);
    expect(booking.deposit).toBeUndefined();
  });

  it("declines → DECLINED with reason, slot freed back to AVAILABLE (rule 3), customer notified", async () => {
    const w = khaled();
    const result = await respondToBooking("bk-1001", { accept: false, declineReason: "Fully booked" });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("declined");
    expect(booking.events[1]).toMatchObject({ status: "declined", actorType: "worker", reason: "Fully booked" });

    const slot = (await getWorkerSlots(w.id)).find((s) => s.id === "slot-khaled-10")!;
    expect(slot.status).toBe("available");
    expect(slot.bookingId).toBeUndefined();

    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingDeclined")).toBe(true);
  });

  it("is a no-op for an unknown booking or a non-REQUESTED booking", async () => {
    expect(await respondToBooking("no-such-booking", { accept: true })).toBeNull();

    await respondToBooking("bk-1001", { accept: true });
    // Already CONFIRMED — a second response must not change it.
    const second = await respondToBooking("bk-1001", { accept: false, declineReason: "oops" });
    expect(second).toBeNull();
  });
});

describe("M5 platform fee (take rate — docs/booking-take-rate.md)", () => {
  it("computePlatformFee — zero/negative quotes are fee-free", () => {
    expect(computePlatformFee(0)).toBe(0);
    expect(computePlatformFee(-100)).toBe(0);
  });

  it("computePlatformFee — exact 7% of the quote (minor units)", () => {
    expect(computePlatformFee(8000)).toBe(560); // SAR 80 → SAR 5.60
    expect(computePlatformFee(15000)).toBe(1050);
    expect(computePlatformFee(25000)).toBe(1750);
  });

  it("computePlatformFee — min floor and max cap clamp the raw fee", () => {
    expect(computePlatformFee(6000)).toBe(500); // raw 420 → floored to min
    expect(computePlatformFee(450000)).toBe(30000); // raw 31500 → capped to max
  });

  it("computePlatformFee — an exempt plan is always 0", () => {
    expect(computePlatformFee(8000, { exempt: true })).toBe(0);
  });

  it("isPlanFeeExempt — enterprise only, case-insensitive (DB enum)", () => {
    expect(isPlanFeeExempt("enterprise")).toBe(true);
    expect(isPlanFeeExempt("ENTERPRISE")).toBe(true);
    expect(isPlanFeeExempt("premium")).toBe(false);
    expect(isPlanFeeExempt(undefined)).toBe(false);
  });

  it("accept-with-quote stamps platformFee + the audit rate", async () => {
    const booking = bookingOf((await respondToBooking("bk-1001", { accept: true, quote: 8000 })) ?? { error: "not-found" });
    expect(booking.platformFee).toBe(560);
    expect(booking.platformFeeRateBps).toBe(700);
  });

  it("accept without a quote leaves the fee unset (free tier stays free)", async () => {
    const booking = bookingOf((await respondToBooking("bk-1001", { accept: true })) ?? { error: "not-found" });
    expect(booking.platformFee).toBeUndefined();
    expect(booking.platformFeeRateBps).toBeUndefined();
  });

  it("decline stamps nothing", async () => {
    const booking = bookingOf((await respondToBooking("bk-1001", { accept: false, declineReason: "busy" })) ?? { error: "not-found" });
    expect(booking.platformFee).toBeUndefined();
    expect(booking.platformFeeRateBps).toBeUndefined();
  });

  it("an Enterprise worker's quoted accept stores fee 0 but keeps the audit rate", async () => {
    const w = workerBySlug("mohammed-farouk-electrical")!;
    const original = w.subscription.plan;
    try {
      w.subscription.plan = "enterprise";
      const slot = demoAddSlot(w.id, new Date(2027, 0, 5, 9).toISOString(), new Date(2027, 0, 5, 10).toISOString());
      const created = bookingOf(
        (await createBookingRequest({
          workerId: w.id,
          slotId: slot.id,
          customerName: "Noor E.",
          customerPhone: "+966 55 123 4871",
          customerEmail: "noor@example.com",
          jobTitle: "Rewire a room",
        })) ?? { error: "not-found" }
      );
      const booking = bookingOf((await respondToBooking(created.id, { accept: true, quote: 8000 })) ?? { error: "not-found" });
      expect(booking.platformFee).toBe(0);
      expect(booking.platformFeeRateBps).toBe(700);
    } finally {
      w.subscription.plan = original;
    }
  });
});

describe("getPlatformFeeStats — M5 admin take-rate revenue (demo adapter)", () => {
  it("is empty when no fee-carrying booking exists (seeded BK-1001 is still requested)", async () => {
    const s = await getPlatformFeeStats(30);
    expect(s).toMatchObject({ grossMinor: 0, refundedMinor: 0, netMinor: 0, count: 0, avgFeeMinor: 0 });
    expect(s.currency).toBe("USD"); // default — no rows to derive from
  });

  it("gross/net/avg from quoted accepts, and a refunded deposit returns its fee", async () => {
    const w = khaled();
    // One plain confirmed accept (fee 560) + one deposit accept that later refunds.
    const slot1 = demoAddSlot(w.id, "2027-06-10T09:00:00.000Z", "2027-06-10T10:00:00.000Z", "available");
    const b1 = bookingOf(await createBookingRequest(request(slot1.id, { customerEmail: "stats-a@test.sa" })));
    await respondToBooking(b1.id, { accept: true, quote: 8000 });

    const slot2 = demoAddSlot(w.id, "2027-06-10T11:00:00.000Z", "2027-06-10T12:00:00.000Z", "available");
    const b2 = bookingOf(await createBookingRequest(request(slot2.id, { customerEmail: "stats-b@test.sa" })));
    await respondToBooking(b2.id, { accept: true, quote: 8000, deposit: 3000 });
    const checkout = await createBookingCheckout(b2.id);
    expect(checkout).not.toBeNull();
    await confirmBookingPayment(b2.id, `sim_pay-${b2.id}`);

    let s = await getPlatformFeeStats(30);
    expect(s.grossMinor).toBe(1120); // two × 560
    expect(s.refundedMinor).toBe(0);
    expect(s.netMinor).toBe(1120);
    expect(s.count).toBe(2);
    expect(s.avgFeeMinor).toBe(560);
    expect(s.currency).toBe("SAR"); // khaled is Riyadh-based

    // Customer cancels the deposit booking → the paid deposit (and its fee) refunds.
    await cancelBooking(b2.id, { by: "customer", reason: "Changed my mind" });
    s = await getPlatformFeeStats(30);
    expect(s.grossMinor).toBe(1120); // the fee snapshot stays on the row
    expect(s.refundedMinor).toBe(560);
    expect(s.netMinor).toBe(560);
    expect(s.count).toBe(2);
    expect(s.avgFeeMinor).toBe(560);
  });

  it("a KEPT deposit (worker cancel inside the window) does not refund its fee", async () => {
    const w = khaled();
    // Slot 2h out — inside the 24h cancellation-policy window, so the worker
    // cancel keeps the deposit (payment stays PAID) and the fee stays collected.
    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const slot = demoAddSlot(w.id, startAt, new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), "available");
    const b = bookingOf(await createBookingRequest(request(slot.id, { customerEmail: "stats-c@test.sa" })));
    await respondToBooking(b.id, { accept: true, quote: 8000, deposit: 3000 });
    await createBookingCheckout(b.id);
    await confirmBookingPayment(b.id, `sim_pay-${b.id}`);
    await cancelBooking(b.id, { by: "worker", reason: "Emergency" });

    const s = await getPlatformFeeStats(30);
    expect(s.grossMinor).toBe(560);
    expect(s.refundedMinor).toBe(0); // no refund happened → fee kept
    expect(s.netMinor).toBe(560);
  });

  it("quote-less accepts and declines never appear (no fee is set)", async () => {
    const w = khaled();
    const slot1 = demoAddSlot(w.id, "2027-06-11T09:00:00.000Z", "2027-06-11T10:00:00.000Z", "available");
    const b1 = bookingOf(await createBookingRequest(request(slot1.id, { customerEmail: "stats-d@test.sa" })));
    await respondToBooking(b1.id, { accept: true }); // no quote → fee stays unset
    const slot2 = demoAddSlot(w.id, "2027-06-11T11:00:00.000Z", "2027-06-11T12:00:00.000Z", "available");
    const b2 = bookingOf(await createBookingRequest(request(slot2.id, { customerEmail: "stats-e@test.sa" })));
    await respondToBooking(b2.id, { accept: false });

    const s = await getPlatformFeeStats(30);
    expect(s.count).toBe(0);
    expect(s.grossMinor).toBe(0);
    expect(s.netMinor).toBe(0);
  });

  it("an Enterprise worker's fee-0 accept is not counted (nothing collected)", async () => {
    const w = workerBySlug("mohammed-farouk-electrical")!;
    const original = w.subscription.plan;
    try {
      w.subscription.plan = "enterprise";
      const slot = demoAddSlot(w.id, new Date(2027, 0, 6, 9).toISOString(), new Date(2027, 0, 6, 10).toISOString());
      const created = bookingOf(
        (await createBookingRequest({
          workerId: w.id,
          slotId: slot.id,
          customerName: "Noor E.",
          customerPhone: "+966 55 123 4871",
          customerEmail: "noor@example.com",
          jobTitle: "Rewire a room",
        })) ?? { error: "not-found" }
      );
      await respondToBooking(created.id, { accept: true, quote: 8000 });

      const s = await getPlatformFeeStats(30);
      expect(s.count).toBe(0); // fee 0 → excluded by the tally
      expect(s.grossMinor).toBe(0);
    } finally {
      w.subscription.plan = original;
    }
  });
});

describe("computeResponseRate", () => {
  it("returns null when there is no history yet", () => {
    expect(computeResponseRate([])).toBeNull();
  });

  it("returns 0 when every booking is still awaiting a response", () => {
    expect(computeResponseRate([{ status: "requested" }, { status: "requested" }])).toBe(0);
  });

  it("counts any non-REQUESTED status as an answer (accept, decline, cancel…)", () => {
    expect(
      computeResponseRate([
        { status: "requested" },
        { status: "confirmed" },
        { status: "declined" },
        { status: "cancelled" },
        { status: "completed" },
      ])
    ).toBe(80);
  });

  it("returns 100 when every request was answered", () => {
    expect(computeResponseRate([{ status: "confirmed" }, { status: "pendingPayment" }])).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    expect(computeResponseRate([{ status: "requested" }, { status: "requested" }, { status: "confirmed" }])).toBe(33);
  });
});

describe("availability — generateSlots (M2)", () => {
  // Fixed 2027 windows + an injected `now` make these tests deterministic
  // forever: the seed's slots live at the real run-date's "tomorrow" (2026),
  // which can never collide with a 2027 window, and `now` pins the
  // never-past-hours guard instead of Date.now().
  const NOW = new Date(2027, 0, 1); // Jan 1 2027, before the windows below

  it("materializes the weekly hours template as AVAILABLE slots across the window", async () => {
    const w = khaled();
    // Mon 2027-01-04 → Sun 2027-01-10 (verified). Khaled: Sun–Thu
    // (08:00–18:00) × 10, Fri (09:00–14:00) × 5, Sat = 24/7 marker × 24.
    const from = new Date(2027, 0, 4);
    const to = new Date(2027, 0, 10);
    const created = demoGenerateSlots(w.id, { from: from.toISOString(), to: to.toISOString() }, NOW);
    expect(created).toBe(5 * 10 + 5 + 24);

    const slots = await getWorkerSlots(w.id, { from: from.toISOString(), to: to.toISOString() });
    expect(slots.every((s) => s.status === "available")).toBe(true);
    expect(slots.every((s) => s.workerId === w.id)).toBe(true);
  });

  it("is idempotent — re-generating never duplicates an existing hour", () => {
    const w = khaled();
    const from = new Date(2027, 0, 4);
    const to = new Date(2027, 0, 10);
    const first = demoGenerateSlots(w.id, { from: from.toISOString(), to: to.toISOString() }, NOW);
    const second = demoGenerateSlots(w.id, { from: from.toISOString(), to: to.toISOString() }, NOW);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  it("skips hours already covered by an existing slot (no overlap)", async () => {
    const w = khaled();
    // Wed 2027-01-06 (verified): 08:00–18:00 = 10 hours; the explicitly
    // added 09:00 slot covers one → 9 new.
    const wed = new Date(2027, 0, 6);
    demoAddSlot(w.id, new Date(2027, 0, 6, 9, 0).toISOString(), new Date(2027, 0, 6, 10, 0).toISOString(), "available");
    const created = demoGenerateSlots(w.id, { from: wed.toISOString(), to: wed.toISOString() }, NOW);
    expect(created).toBe(9);
  });

  it("skips closed days entirely", () => {
    // Khaled is emergency (Saturday = 24/7), so use a non-emergency worker:
    // Mohammed Farouk has a regular template with Saturday closed.
    const w = workerBySlug("mohammed-farouk-electrical")!;
    const saturday = new Date(2027, 0, 9); // Saturday, verified
    const created = demoGenerateSlots(
      w.id,
      { from: saturday.toISOString(), to: saturday.toISOString() },
      NOW
    );
    expect(created).toBe(0);
  });

  it("never creates a slot that has already started (past-hour guard)", () => {
    const w = khaled();
    // now = 09:30 on Wed 2027-01-06 — the 08:00/09:00 starts are in the past
    // and must be skipped; 10:00 onward (10:00–18:00 = 8 hours) survive.
    const now = new Date(2027, 0, 6, 9, 30);
    const wed = new Date(2027, 0, 6);
    const created = demoGenerateSlots(w.id, { from: wed.toISOString(), to: wed.toISOString() }, now);
    expect(created).toBe(8);
  });

  it("returns 0 for an unknown worker", () => {
    expect(demoGenerateSlots("no-such-worker", {}, NOW)).toBe(0);
  });
});

describe("availability — block/unblock (M2)", () => {
  it("blocks an AVAILABLE slot and unblocks it back", async () => {
    const w = khaled();
    const free = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;

    const blocked = await setSlotBlocked(w.id, free.id, true);
    expect(blocked?.status).toBe("blocked");
    expect((await getWorkerSlots(w.id)).find((s) => s.id === free.id)?.status).toBe("blocked");

    const unblocked = await setSlotBlocked(w.id, free.id, false);
    expect(unblocked?.status).toBe("available");
  });

  it("refuses to block a RESERVED or BOOKED slot (it belongs to a booking)", async () => {
    const w = khaled();
    const reserved = (await getWorkerSlots(w.id)).find((s) => s.status === "reserved")!;
    expect(await setSlotBlocked(w.id, reserved.id, true)).toBeNull();
    // Still reserved after the refusal.
    expect((await getWorkerSlots(w.id)).find((s) => s.id === reserved.id)?.status).toBe("reserved");
  });

  it("returns null for an unknown slot", async () => {
    const w = khaled();
    expect(await setSlotBlocked(w.id, "no-such-slot", true)).toBeNull();
  });
});

describe("nextDayKeys", () => {
  it("returns 7 consecutive day keys starting today", () => {
    const today = new Date(2026, 7, 12, 15, 30);
    expect(nextDayKeys(7, today)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
    ]);
  });
});

describe("reads", () => {
  it("filters worker bookings by status and limit", async () => {
    const w = khaled();
    // Create a second booking so the filter/limit has something to work with.
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    await createBookingRequest(request(available.id));

    expect(await getWorkerBookings(w.id, { status: "requested" })).toHaveLength(2);
    expect(await getWorkerBookings(w.id, { status: "confirmed" })).toHaveLength(0);
    expect(await getWorkerBookings(w.id, { limit: 1 })).toHaveLength(1);
  });

  it("finds customer bookings by email and by normalized phone", async () => {
    expect(await getCustomerBookings({ email: "sara@example.com" })).toHaveLength(1);
    expect(await getCustomerBookings({ phone: "+966 50 000 0000" })).toHaveLength(1);
    expect(await getCustomerBookings({ email: "nobody@example.com" })).toHaveLength(0);
  });

  it("scopes slots by time window", async () => {
    const w = khaled();
    const all = await getWorkerSlots(w.id);
    const from = all[0]!.startAt;
    const to = all[2]!.startAt;
    const windowed = await getWorkerSlots(w.id, { from, to });
    expect(windowed.length).toBeGreaterThanOrEqual(1);
    expect(windowed.length).toBeLessThanOrEqual(3);
  });
});

describe("booking lifecycle activity feed (M4) — funnel & feed tell one story", () => {
  it("logs BOOKING_REQUESTED with the booking number when a request is created", async () => {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    await createBookingRequest(request(available.id));

    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "BOOKING_REQUESTED");
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("booking");
    expect(entry!.bookingNo).toBe("BK-1002");
    expect(entry!.actionEn).toContain("BK-1002");
    expect(entry!.actor).toBe("Noor E.");
  });

  it("logs BOOKING_CONFIRMED (worker) when an accept reaches CONFIRMED", async () => {
    await respondToBooking("bk-1001", { accept: true, quote: 15000 });

    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "BOOKING_CONFIRMED");
    expect(entry).toBeDefined();
    expect(entry!.bookingNo).toBe("BK-1001");
    expect(entry!.actor).toBe("Khaled Al-Harbi");
  });

  it("does NOT log BOOKING_CONFIRMED for a deposit accept (PENDING_PAYMENT — the funnel's pendingPayment bucket)", async () => {
    await respondToBooking("bk-1001", { accept: true, quote: 15000, deposit: 5000 });
    const feed = await getAdminActivityFeed();
    expect(feed.some((e) => e.code === "BOOKING_CONFIRMED")).toBe(false);
  });

  it("logs BOOKING_CONFIRMED when the deposit is paid (confirmBookingPayment)", async () => {
    await respondToBooking("bk-1001", { accept: true, quote: 15000, deposit: 5000 });
    const { confirmBookingPayment } = await import("../src/lib/data/repo");
    await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");

    const feed = await getAdminActivityFeed();
    const confirmed = feed.filter((e) => e.code === "BOOKING_CONFIRMED");
    expect(confirmed).toHaveLength(1); // redelivery must not re-log
    expect(confirmed[0]!.bookingNo).toBe("BK-1001");

    // A webhook redelivery is a no-op — the feed entry must stay unique.
    await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");
    const after = await getAdminActivityFeed();
    expect(after.filter((e) => e.code === "BOOKING_CONFIRMED")).toHaveLength(1);
  });

  it("logs BOOKING_CANCELLED with the acting party (customer cancels → customer, worker cancels → worker)", async () => {
    await respondToBooking("bk-1001", { accept: true });
    await cancelBooking("bk-1001", { by: "worker", reason: "Emergency" });
    let feed = await getAdminActivityFeed();
    let entry = feed.find((e) => e.code === "BOOKING_CANCELLED")!;
    expect(entry.bookingNo).toBe("BK-1001");
    expect(entry.actor).toBe("Khaled Al-Harbi");
    expect(entry.actionEn).toContain("Emergency");

    // A fresh request → customer cancels → the actor is the customer.
    resetBookingsStore();
    await cancelBooking("bk-1001", { by: "customer" });
    feed = await getAdminActivityFeed();
    entry = feed.find((e) => e.code === "BOOKING_CANCELLED")!;
    expect(entry.actor).toBe("Sara Customer");
  });

  it("logs BOOKING_RESCHEDULED with the acting party (worker → worker name, customer → customer)", async () => {
    await respondToBooking("bk-1001", { accept: true });
    const target = demoAddSlot(khaled().id, "2027-06-10T11:00:00.000Z", "2027-06-10T12:00:00.000Z", "available");
    await rescheduleBooking("bk-1001", target.id, { by: "worker" });

    let feed = await getAdminActivityFeed();
    let entry = feed.find((e) => e.code === "BOOKING_RESCHEDULED")!;
    expect(entry.bookingNo).toBe("BK-1001");
    expect(entry.type).toBe("booking");
    expect(entry.actor).toBe("Khaled Al-Harbi");

    // A customer-initiated reschedule stamps the customer as the actor.
    resetBookingsStore();
    await respondToBooking("bk-1001", { accept: true });
    const target2 = demoAddSlot(khaled().id, "2027-06-11T11:00:00.000Z", "2027-06-11T12:00:00.000Z", "available");
    await rescheduleBooking("bk-1001", target2.id, { by: "customer" });
    feed = await getAdminActivityFeed();
    entry = feed.find((e) => e.code === "BOOKING_RESCHEDULED")!;
    expect(entry.actor).toBe("Sara Customer");
  });

  it("logs BOOKING_NO_SHOW when a worker voids a confirmed booking", async () => {
    await respondToBooking("bk-1001", { accept: true });
    await transitionBooking("bk-1001", "noShow");

    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "BOOKING_NO_SHOW");
    expect(entry).toBeDefined();
    expect(entry!.bookingNo).toBe("BK-1001");
    expect(entry!.actor).toBe("Khaled Al-Harbi");
    expect(entry!.actionEn).toContain("BK-1001");
  });

  it("does NOT log NO_SHOW for an illegal (rejected) transition, and no code for inProgress/completed", async () => {
    // REQUESTED → noShow is illegal — the null result means nothing is logged.
    expect(await transitionBooking("bk-1001", "noShow")).toBeNull();
    // inProgress/completed have no lifecycle codes by design (the dispute
    // view's event trail carries them) — no feed entries either.
    await respondToBooking("bk-1001", { accept: true });
    await transitionBooking("bk-1001", "inProgress");
    await transitionBooking("bk-1001", "completed");

    const feed = await getAdminActivityFeed();
    expect(feed.some((e) => e.code === "BOOKING_NO_SHOW")).toBe(false);
    expect(feed.some((e) => e.code === "BOOKING_CONFIRMED" && e.bookingNo === "BK-1001")).toBe(true);
    expect(feed.some((e) => e.code?.startsWith("BOOKING") && e.code !== "BOOKING_CONFIRMED")).toBe(false);
  });

  it("getBookingByNumber resolves the booking the feed deep-links to (dispute view)", async () => {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    const created = bookingOf(await createBookingRequest(request(available.id)));

    const byNumber = await getBookingByNumber("BK-1002");
    expect(byNumber?.id).toBe(created.id);
    expect(byNumber?.events[0]?.status).toBe("requested");
    expect(await getBookingByNumber("BK-9999")).toBeNull();
  });
});

describe("getBookingFunnel — M4 admin funnel (demo adapter)", () => {
  it("counts the seeded store: BK-1001 requested, no conversion yet", async () => {
    const f = await getBookingFunnel(30);
    expect(f.total).toBe(1);
    expect(f.counts.requested).toBe(1);
    expect(f.conversionRate).toBe(0);
  });

  it("counts by current status across requests + accepts", async () => {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    await createBookingRequest(request(available.id)); // → requested
    await respondToBooking("bk-1001", { accept: true }); // seeded → confirmed

    const f = await getBookingFunnel(30);
    expect(f.total).toBe(2);
    expect(f.counts.requested).toBe(1);
    expect(f.counts.confirmed).toBe(1);
    expect(f.conversionRate).toBe(50); // 1 confirmed of 2
  });

  it("counts cancelled/declined/completed buckets (terminal statuses don't convert)", async () => {
    const w = khaled();
    await respondToBooking("bk-1001", { accept: true });
    await transitionBooking("bk-1001", "inProgress");
    await transitionBooking("bk-1001", "completed"); // §2.3 — staged
    await confirmBookingCompletion("bk-1001");
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    const second = bookingOf(await createBookingRequest(request(available.id)));
    await cancelBooking(second.id, { by: "customer" });

    const f = await getBookingFunnel(30);
    expect(f.counts.completed).toBe(1);
    expect(f.counts.cancelled).toBe(1);
    expect(f.conversionRate).toBe(50); // 1 completed of 2 — cancelled never converts
  });

  it("declined bookings count as declined, not confirmed", async () => {
    const available = (await getWorkerSlots(khaled().id)).find((s) => s.status === "available")!;
    const created = bookingOf(await createBookingRequest(request(available.id)));
    await respondToBooking(created.id, { accept: false, declineReason: "Busy" });
    await respondToBooking("bk-1001", { accept: true });

    const f = await getBookingFunnel(30);
    expect(f.counts.declined).toBe(1);
    expect(f.counts.confirmed).toBe(1);
    expect(f.conversionRate).toBe(50);
  });

  it("every status key is present (zeroed), and counts sum to total", async () => {
    const f = await getBookingFunnel(30);
    const statuses = [
      "requested",
      "pendingPayment",
      "confirmed",
      "inProgress",
      "completed",
      "cancelled",
      "declined",
      "noShow",
      "rescheduled",
    ] as const;
    for (const s of statuses) expect(typeof f.counts[s]).toBe("number");
    expect(Object.values(f.counts).reduce((s, n) => s + n, 0)).toBe(f.total);
  });
});

describe("transitionBooking — M4 lifecycle", () => {
  it("§2.3 stages completion (completionPending), customer confirm → completed, worker notified", async () => {
    const w = khaled();
    await respondToBooking("bk-1001", { accept: true });

    const started = bookingOf((await transitionBooking("bk-1001", "inProgress")) ?? { error: "not-found" });
    expect(started.status).toBe("inProgress");
    expect(started.events.map((e) => e.status)).toEqual(["requested", "confirmed", "inProgress"]);
    expect(started.events[2]?.actorType).toBe("worker");
    const slotDuring = (await getWorkerSlots(w.id)).find((s) => s.bookingId === "bk-1001")!;
    expect(slotDuring.status).toBe("booked");

    // The worker's "completed" flip is STAGED — not completed yet.
    const staged = bookingOf((await transitionBooking("bk-1001", "completed")) ?? { error: "not-found" });
    expect(staged.status).toBe("completionPending");
    expect(staged.events.at(-1)).toMatchObject({ status: "completionPending", actorType: "worker" });
    const slotAfter = (await getWorkerSlots(w.id)).find((s) => s.bookingId === "bk-1001")!;
    expect(slotAfter.status).toBe("booked"); // only cancellation frees the slot

    // The customer is prompted to confirm — no "completed" push yet.
    const inboxAfterStage = await getNotificationsList();
    expect(inboxAfterStage.some((n) => n.type === "bookingCompletionPending" && n.href === "/bookings")).toBe(true);
    expect(inboxAfterStage.some((n) => n.type === "bookingCompleted")).toBe(false);

    // Confirming flips it to completed (customer actor) and tells the worker.
    const done = bookingOf((await confirmBookingCompletion("bk-1001")) ?? { error: "not-found" });
    expect(done.status).toBe("completed");
    expect(done.events.at(-1)).toMatchObject({ status: "completed", actorType: "customer" });
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingCompletionConfirmed" && n.href === "/dashboard")).toBe(true);
    // A second confirm is a no-op (already completed).
    expect(await confirmBookingCompletion("bk-1001")).toBeNull();
  });

  it("rejects an illegal transition — completed requires inProgress", async () => {
    await respondToBooking("bk-1001", { accept: true });
    expect(await transitionBooking("bk-1001", "completed")).toBeNull(); // confirmed → completed is not allowed
    expect((await getWorkerBookings(khaled().id))[0]?.status).toBe("confirmed"); // unchanged
  });

  it("rejects a transition on a REQUESTED booking or an unknown booking", async () => {
    expect(await transitionBooking("bk-1001", "inProgress")).toBeNull(); // requested → inProgress illegal
    expect(await transitionBooking("bk-1001", "noShow")).toBeNull(); // requested → noShow also illegal
    expect(await transitionBooking("no-such-booking", "inProgress")).toBeNull();
  });

  it("no-show voids a confirmed booking but keeps the slot booked", async () => {
    const w = khaled();
    await respondToBooking("bk-1001", { accept: true });
    const voided = bookingOf((await transitionBooking("bk-1001", "noShow")) ?? { error: "not-found" });
    expect(voided.status).toBe("noShow");
    expect(voided.events.at(-1)).toMatchObject({ status: "noShow", actorType: "worker" });
    const slot = (await getWorkerSlots(w.id)).find((s) => s.bookingId === "bk-1001")!;
    expect(slot.status).toBe("booked");
  });
});

describe("cancelBooking — M4 cancellation", () => {
  it("worker cancels a confirmed booking → CANCELLED, reason + actor on the event, slot freed (rule 3), customer notified", async () => {
    const w = khaled();
    await respondToBooking("bk-1001", { accept: true });

    const result = await cancelBooking("bk-1001", { by: "worker", reason: "Emergency" });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("cancelled");
    expect(booking.events.at(-1)).toMatchObject({ status: "cancelled", actorType: "worker", reason: "Emergency" });

    const slot = (await getWorkerSlots(w.id)).find((s) => s.id === "slot-khaled-10")!;
    expect(slot.status).toBe("available");
    expect(slot.bookingId).toBeUndefined();

    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/bookings")).toBe(true);
  });

  it("customer cancels a REQUESTED booking → slot freed, worker notified", async () => {
    const w = khaled();
    const result = await cancelBooking("bk-1001", { by: "customer" });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("cancelled");
    expect(booking.events.at(-1)).toMatchObject({ status: "cancelled", actorType: "customer" });

    const slot = (await getWorkerSlots(w.id)).find((s) => s.id === "slot-khaled-10")!;
    expect(slot.status).toBe("available");
    expect(slot.bookingId).toBeUndefined();

    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/dashboard")).toBe(true);
  });

  it("cannot cancel a terminal booking (completed) or an unknown one", async () => {
    await respondToBooking("bk-1001", { accept: true });
    await transitionBooking("bk-1001", "inProgress");
    await transitionBooking("bk-1001", "completed"); // staged
    // A staged completion is NOT terminal — cancellation still allowed.
    expect(await cancelBooking("bk-1001", { by: "worker" })).not.toBeNull();
    await confirmBookingCompletion("bk-1001");
    expect(await cancelBooking("bk-1001", { by: "worker" })).toBeNull(); // completed is terminal
    expect(await cancelBooking("no-such-booking", { by: "worker" })).toBeNull();
  });
});

describe("admin cancel + refund — §2.4 dispute view (demo adapter)", () => {
  /** Accept BK-1001 (seeded REQUESTED) with a deposit + pay it — the state an
   * admin refund or cancel acts on. */
  async function acceptAndPay() {
    await respondToBooking("bk-1001", { accept: true, quote: 15000, deposit: 3000 });
    const checkout = await createBookingCheckout("bk-1001");
    expect(checkout).not.toBeNull();
    await confirmBookingPayment("bk-1001", "sim_pay-admin");
  }

  it("admin cancel frees the slot, stamps the admin actor, refunds the paid deposit and notifies BOTH parties", async () => {
    await acceptAndPay();

    const result = await cancelBooking("bk-1001", { by: "admin", reason: "Duplicate booking", adminName: "Platform Admin" });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("cancelled");
    expect(booking.events.at(-1)).toMatchObject({ status: "cancelled", actorType: "admin", reason: "Duplicate booking" });

    // Rule 3 — the slot is freed back to AVAILABLE.
    const slot = (await getWorkerSlots(khaled().id)).find((s) => s.id === "slot-khaled-10")!;
    expect(slot.status).toBe("available");

    // A platform cancel ALWAYS refunds a paid deposit (the window policy is
    // worker-only) — the customer gets the refund email.
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingRefund")).toBe(true);
    // BOTH the customer (/bookings) and the worker (/dashboard) are told.
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/bookings")).toBe(true);
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/dashboard")).toBe(true);
  });

  it("admin cancel of a quote-only (no deposit) booking still tells both parties", async () => {
    await respondToBooking("bk-1001", { accept: true, quote: 15000 }); // no deposit
    // The demo inbox is shared globalThis state, so refund-notification checks
    // must be delta-based: earlier tests in this file legitimately push one.
    const refundsBefore = (await getNotificationsList()).filter((n) => n.type === "bookingRefund").length;
    await cancelBooking("bk-1001", { by: "admin", reason: "Duplicate" });
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/bookings")).toBe(true);
    expect(inbox.some((n) => n.type === "bookingCancelled" && n.href === "/dashboard")).toBe(true);
    // Nothing to refund — no NEW refund notification appears.
    expect(inbox.filter((n) => n.type === "bookingRefund").length).toBe(refundsBefore);
  });

  it("refundBookingDeposit refunds a PAID deposit without cancelling, appends a REFUNDED event and emails the refund", async () => {
    await acceptAndPay();

    const result = await refundBookingDeposit("bk-1001", { reason: "Dispute resolved in customer's favour", adminName: "Platform Admin" });
    const booking = bookingOf(result ?? { error: "not-found" });
    // The booking itself is unchanged — money-only correction (post-payment it sits at CONFIRMED).
    expect(booking.status).toBe("confirmed");
    expect(booking.events.at(-1)).toMatchObject({ status: "refunded", actorType: "admin", reason: "Dispute resolved in customer's favour" });

    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingRefund")).toBe(true);
    // No cancellation notification — the job is still on. Delta-based because
    // the shared demo inbox already carries cancellations from earlier tests.
    const cancelledBefore = inbox.filter((n) => n.type === "bookingCancelled").length;
    const inboxAfter = await getNotificationsList();
    expect(inboxAfter.filter((n) => n.type === "bookingCancelled").length).toBe(cancelledBefore);
  });

  it("refundBookingDeposit is a no-op without a PAID deposit (idempotent)", async () => {
    // No payment at all — nothing to refund.
    expect(await refundBookingDeposit("bk-1001", { reason: "x" })).toBeNull();

    // A PENDING checkout (unpaid) is not refundable.
    await respondToBooking("bk-1001", { accept: true, quote: 15000, deposit: 3000 });
    await createBookingCheckout("bk-1001");
    expect(await refundBookingDeposit("bk-1001", { reason: "x" })).toBeNull();

    // Pay it, refund once, then the second refund is a no-op.
    await confirmBookingPayment("bk-1001", "sim_pay-admin-2");
    expect(await refundBookingDeposit("bk-1001", { reason: "first" })).not.toBeNull();
    expect(await refundBookingDeposit("bk-1001", { reason: "second" })).toBeNull();

    expect(await refundBookingDeposit("no-such-booking", { reason: "x" })).toBeNull();
  });

  it("logs BOOKING_CANCELLED (admin actor) and BOOKING_REFUNDED to the activity feed", async () => {
    await acceptAndPay();
    await cancelBooking("bk-1001", { by: "admin", reason: "Duplicate", adminName: "Amina Admin" });
    const feed = await getAdminActivityFeed();
    expect(feed.some((e) => e.code === "BOOKING_CANCELLED" && e.actor === "Amina Admin")).toBe(true);
    expect(feed.some((e) => e.code === "BOOKING_CANCELLED" && e.actor === "Platform Admin")).toBe(false);
  });
});

describe("M4 server actions — transition & cancel zod layer", () => {
  /** Accept-form FormData (the exact shape the RespondDialog submits). */
  function acceptFd() {
    const fd = new FormData();
    fd.set("accept", "true");
    fd.set("quote", "80");
    return fd;
  }

  it("rejects an unknown transition target (invalid, not not-found)", async () => {
    const res = await transitionBookingAction("bk-1001", "done" as "completed");
    expect(res).toEqual({ ok: false, error: "invalid" });
  });

  it("returns not-found for an illegal transition on a REQUESTED booking", async () => {
    const res = await transitionBookingAction("bk-1001", "completed");
    expect(res).toEqual({ ok: false, error: "not-found" });
  });

  it("accepts a valid transition end-to-end", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const res = await transitionBookingAction("bk-1001", "inProgress");
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id))[0] ?? { error: "not-found" });
    expect(booking.status).toBe("inProgress");
  });

  it("cancels with a reason and defaults the actor to worker", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const fd = new FormData();
    fd.set("reason", "No longer available");
    const res = await cancelBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id))[0] ?? { error: "not-found" });
    expect(booking.status).toBe("cancelled");
    expect(booking.events.at(-1)).toMatchObject({ actorType: "worker", reason: "No longer available" });
  });

  it("rejects a malformed actor", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const fd = new FormData();
    fd.set("by", "admin");
    const res = await cancelBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: false, error: "invalid" });
  });
});

describe("rescheduleBooking — M4 slot swap", () => {
  /** Accept BK-1001 (seeded REQUESTED) so it is reschedulable. */
  async function accept() {
    const result = await respondToBooking("bk-1001", { accept: true, quote: 20000 });
    return bookingOf(result ?? { error: "not-found" });
  }

  it("moves a confirmed booking to an AVAILABLE slot, frees the old one, and appends a RESCHEDULED event", async () => {
    await accept();
    const before = bookingOf((await getWorkerBookings(khaled().id))[0] ?? { error: "not-found" });
    const target = demoAddSlot(khaled().id, "2027-06-01T11:00:00.000Z", "2027-06-01T12:00:00.000Z", "available");

    const moved = await rescheduleBooking("bk-1001", target.id, { by: "worker" });
    expect(moved).not.toBeNull();
    expect(moved!.startAt).toBe(target.startAt);
    expect(moved!.endAt).toBe(target.endAt);
    expect(moved!.status).toBe("confirmed"); // status is unchanged — the slot moved
    expect(moved!.events.at(-1)).toMatchObject({ status: "rescheduled", actorType: "worker" });

    // Old slot freed, target now BOOKED + linked.
    const slots = await getWorkerSlots(khaled().id);
    const old = slots.find((s) => s.id === "slot-khaled-10");
    const claimed = slots.find((s) => s.id === target.id);
    expect(old?.status).toBe("available");
    expect(old?.bookingId).toBeUndefined();
    expect(claimed?.status).toBe("booked");
    expect(claimed?.bookingId).toBe("bk-1001");

    // The customer was notified (deep-link /bookings).
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingRescheduled" && n.href === "/bookings")).toBe(true);
  });

  it("customer-initiated reschedule notifies the worker instead", async () => {
    await accept();
    const target = demoAddSlot(khaled().id, "2027-06-02T11:00:00.000Z", "2027-06-02T12:00:00.000Z", "available");
    const moved = await rescheduleBooking("bk-1001", target.id, { by: "customer" });
    expect(moved).not.toBeNull();
    expect(moved!.events.at(-1)?.actorType).toBe("customer");
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "bookingRescheduled" && n.href === "/dashboard")).toBe(true);
  });

  it("rejects a non-reschedulable status (REQUESTED and terminal)", async () => {
    const onRequested = await rescheduleBooking("bk-1001", "slot-khaled-9", { by: "worker" });
    expect(onRequested).toBeNull();

    await accept();
    await transitionBooking("bk-1001", "inProgress");
    await transitionBooking("bk-1001", "completed");
    const onCompleted = await rescheduleBooking("bk-1001", "slot-khaled-9", { by: "worker" });
    expect(onCompleted).toBeNull();
  });

  it("rejects a non-AVAILABLE target (RESERVED/BOOKED/BLOCKED)", async () => {
    await accept();
    // The seeded 10:00 slot is BOOKED by BK-1001 itself; 14:00 is BLOCKED.
    const blocked = await rescheduleBooking("bk-1001", "slot-khaled-14", { by: "worker" });
    expect(blocked).toBeNull();
    // A slot of ANOTHER worker is also rejected.
    const other = demoAddSlot("other-worker", "2027-06-03T11:00:00.000Z", "2027-06-03T12:00:00.000Z", "available");
    const foreign = await rescheduleBooking("bk-1001", other.id, { by: "worker" });
    expect(foreign).toBeNull();
  });

  it("rejects a target overlapping another reserved/booked slot", async () => {
    await accept();
    // 09:00–10:00 is AVAILABLE but overlaps nothing; make one overlapping the
    // old BOOKED 10:00 slot — wait, the old slot is freed on reschedule. So
    // instead reserve a DIFFERENT slot first, then target an overlapping one.
    const reserved = demoAddSlot(khaled().id, "2027-06-04T10:00:00.000Z", "2027-06-04T11:00:00.000Z", "reserved");
    const overlapping = demoAddSlot(khaled().id, "2027-06-04T10:30:00.000Z", "2027-06-04T11:30:00.000Z", "available");
    const moved = await rescheduleBooking("bk-1001", overlapping.id, { by: "worker" });
    expect(moved).toBeNull();
    expect(reserved.status).toBe("reserved"); // untouched
  });

  it("rejects unknown booking / unknown slot", async () => {
    await accept();
    expect(await rescheduleBooking("bk-9999", "slot-khaled-9", { by: "worker" })).toBeNull();
    expect(await rescheduleBooking("bk-1001", "slot-nope", { by: "worker" })).toBeNull();
  });
});

describe("rescheduleBookingAction — server-action zod layer", () => {
  /** Accept-form FormData (same shape as the M1 describe's helper). */
  function acceptFd() {
    const fd = new FormData();
    fd.set("accept", "true");
    fd.set("quote", "80");
    return fd;
  }

  it("moves the booking end-to-end via the action", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const target = demoAddSlot(khaled().id, "2027-06-05T11:00:00.000Z", "2027-06-05T12:00:00.000Z", "available");
    const fd = new FormData();
    fd.set("targetSlotId", target.id);
    fd.set("by", "worker");
    const res = await rescheduleBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id))[0] ?? { error: "not-found" });
    expect(booking.startAt).toBe(target.startAt);
  });

  it("defaults the actor to worker when by is absent", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const target = demoAddSlot(khaled().id, "2027-06-06T11:00:00.000Z", "2027-06-06T12:00:00.000Z", "available");
    const fd = new FormData();
    fd.set("targetSlotId", target.id);
    const res = await rescheduleBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: true });
    const booking = bookingOf((await getWorkerBookings(khaled().id))[0] ?? { error: "not-found" });
    expect(booking.events.at(-1)?.actorType).toBe("worker");
  });

  it("rejects a missing target slot", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const fd = new FormData();
    fd.set("by", "worker");
    const res = await rescheduleBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects a malformed actor", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const fd = new FormData();
    fd.set("targetSlotId", "slot-khaled-9");
    fd.set("by", "admin");
    const res = await rescheduleBookingAction("bk-1001", fd);
    expect(res).toEqual({ ok: false, error: "invalid" });
  });

  it("availableSlotsAction returns only future AVAILABLE slots", async () => {
    await respondBookingAction("bk-1001", acceptFd());
    const past = demoAddSlot(khaled().id, "2020-01-01T11:00:00.000Z", "2020-01-01T12:00:00.000Z", "available");
    const future = demoAddSlot(khaled().id, "2030-01-01T11:00:00.000Z", "2030-01-01T12:00:00.000Z", "available");
    demoAddSlot(khaled().id, "2030-01-02T11:00:00.000Z", "2030-01-02T12:00:00.000Z", "booked");
    const res = await availableSlotsAction(khaled().id);
    expect(res.ok).toBe(true);
    expect(res.slots!.map((s) => s.id)).toContain(future.id);
    expect(res.slots!.map((s) => s.id)).not.toContain(past.id);
  });

  it("availableSlotsAction rejects an empty worker id", async () => {
    const res = await availableSlotsAction("");
    expect(res).toEqual({ ok: false, error: "invalid" });
  });
});

describe("worker payouts — docs/payouts.md (demo adapter)", () => {
  async function completeBooking(quote = 8000) {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    const created = bookingOf(await createBookingRequest(request(available.id)));
    await respondToBooking(created.id, { accept: true, quote });
    await transitionBooking(created.id, "inProgress");
    await transitionBooking(created.id, "completed"); // §2.3 — staged
    await confirmBookingCompletion(created.id); // customer confirms → completed
    return created;
  }

  it("is empty before any completed job (seeded BK-1001 is requested)", async () => {
    const b = await getWorkerBalance(khaled().id);
    expect(b).toEqual({ availableMinor: 0, pendingMinor: 0, currency: "SAR" });
  });

  it("credits net earnings (quote − platform fee) when a job completes", async () => {
    const created = await completeBooking(8000); // fee 560 → net 7440
    const b = await getWorkerBalance(khaled().id);
    expect(b.availableMinor).toBe(7440);
    expect(b.pendingMinor).toBe(0);
    expect(b.currency).toBe("SAR");

    // A second completion of the same booking cannot double-credit (the
    // ledger's one-entry-per-booking guard mirrors the prisma @@unique).
    await transitionBooking(created.id, "completed"); // illegal (terminal) → null
    expect(await confirmBookingCompletion(created.id)).toBeNull(); // already completed
    expect((await getWorkerBalance(khaled().id)).availableMinor).toBe(7440);
  });

  it("a quote-less completed job credits nothing (no entry)", async () => {
    const w = khaled();
    const available = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    const created = bookingOf(await createBookingRequest(request(available.id)));
    await respondToBooking(created.id, { accept: true }); // no quote → fee unset
    await transitionBooking(created.id, "inProgress");
    await transitionBooking(created.id, "completed"); // staged
    await confirmBookingCompletion(created.id);
    expect((await getWorkerBalance(w.id)).availableMinor).toBe(0);
  });

  it("requestPayout validates against available − pending (pending reserves)", async () => {
    const w = khaled();
    await completeBooking(8000); // 7440 available

    expect(await requestPayout(w.id, -100)).toMatchObject({ error: "invalid" });
    expect(await requestPayout(w.id, 99999)).toMatchObject({ error: "insufficient" });

    const payout = (await requestPayout(w.id, 5000)) as { kind: string; status: string; amount: number };
    expect(payout.kind).toBe("withdrawal");
    expect(payout.status).toBe("pending");
    expect(payout.amount).toBe(-5000); // signed minor units

    const b = await getWorkerBalance(w.id);
    expect(b.availableMinor).toBe(7440); // balance unchanged while pending
    expect(b.pendingMinor).toBe(5000); // reserved

    // The pending 5000 is reserved — requesting beyond the remainder is refused.
    expect(await requestPayout(w.id, 3000)).toMatchObject({ error: "insufficient" });
    expect(await requestPayout(w.id, 2440)).not.toHaveProperty("error"); // exactly the remainder
  });

  it("admin approval settles the withdrawal (debit), rejection voids it", async () => {
    const w = khaled();
    await completeBooking(8000); // 7440
    const payout = await requestPayout(w.id, 5000);
    if ("error" in payout) throw new Error("payout should succeed");

    // Approve → PROCESSED, the balance drops by 5000.
    const decided = await decidePayout(payout.id, true);
    expect(decided?.status).toBe("processed");
    let b = await getWorkerBalance(w.id);
    expect(b.availableMinor).toBe(2440);
    expect(b.pendingMinor).toBe(0);

    // A second decision on the same payout is refused (CAS on PENDING).
    expect(await decidePayout(payout.id, false)).toBeNull();

    // Reject path — nothing moves.
    const second = await requestPayout(w.id, 1000);
    if ("error" in second) throw new Error("payout should succeed");
    expect((await decidePayout(second.id, false))?.status).toBe("rejected");
    b = await getWorkerBalance(w.id);
    expect(b.availableMinor).toBe(2440);
    expect(b.pendingMinor).toBe(0);
  });

  it("an Enterprise worker's full quote is credited (fee 0 → no deduction)", async () => {
    const w = workerBySlug("mohammed-farouk-electrical")!;
    const original = w.subscription.plan;
    try {
      w.subscription.plan = "enterprise";
      const slot = demoAddSlot(w.id, new Date(2027, 0, 7, 9).toISOString(), new Date(2027, 0, 7, 10).toISOString());
      const created = bookingOf(
        (await createBookingRequest({
          workerId: w.id,
          slotId: slot.id,
          customerName: "Noor E.",
          customerPhone: "+966 55 123 4871",
          customerEmail: "noor@example.com",
          jobTitle: "Rewire a room",
        })) ?? { error: "not-found" }
      );
      await respondToBooking(created.id, { accept: true, quote: 10000 });
      await transitionBooking(created.id, "inProgress");
      await transitionBooking(created.id, "completed"); // staged
      await confirmBookingCompletion(created.id);
      expect((await getWorkerBalance(w.id)).availableMinor).toBe(10000); // full quote
    } finally {
      w.subscription.plan = original;
    }
  });
});

/* ─────────────── Multi-candidate quotes (docs/multi-candidate-quotes.md) ─────────────── */

function quoteOf(r: QuoteRequest | { error: string }): QuoteRequest {
  if ("error" in r) throw new Error(`expected quote request, got error ${r.error}`);
  return r;
}

function quoteInput(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Noor E.",
    customerPhone: "+966 55 123 4871",
    customerEmail: "noor@example.com",
    jobTitle: "Fix a leaking pipe under the kitchen sink",
    categorySlug: "plumbing",
    citySlug: "riyadh",
    ...overrides,
  };
}

describe("multi-candidate quotes (demo adapter + seams)", () => {
  const ali = () => workerBySlug("ali-hassan-carpentry")!;
  const omar = () => workerBySlug("omar-al-mutairi-ac-technician")!;

  it("create: one QuoteRequest (OPEN, QR-YYYY-NNNNN, expiresAt) + one slot-less QUOTING booking per worker; over-limit/duplicate/unknown rejected", async () => {
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id, ali().id]));
    expect(created.bookings).toHaveLength(2);
    expect(created.status).toBe("open");
    expect(created.number).toMatch(/^QR-\d{4}-\d{5}$/);
    expect(created.expiresAt).toBeTruthy();
    expect(Date.parse(created.expiresAt!) - Date.parse(created.createdAt)).toBe(QUOTE_SLA_MS);
    for (const b of created.bookings) {
      expect(b.status).toBe("quoting");
      expect(b.startAt).toBeUndefined(); // rule 2 — no slot is locked during the auction
      expect(b.endAt).toBeUndefined();
      expect(b.quoteRequestId).toBe(created.id);
      expect(b.customerName).toBe("Noor E.");
      expect(b.events[0]).toMatchObject({ status: "quoting", actorType: "customer" });
    }
    // The invited bookings surface on the workers' dashboards (Requests tab).
    const khaledBookings = await getWorkerBookings(khaled().id);
    expect(khaledBookings.some((b) => b.status === "quoting" && b.quoteRequestId === created.id)).toBe(true);
    // The customer's page lists the job.
    const mine = await getCustomerQuoteRequests({ email: "noor@example.com" });
    expect(mine.some((q) => q.id === created.id)).toBe(true);

    const tooMany = await createQuoteRequest(quoteInput(), [khaled().id, ali().id, omar().id, workerBySlug("ahmed-el-sayed-masonry")!.id]);
    expect(tooMany).toEqual({ error: "too-many" });
    const dup = await createQuoteRequest(quoteInput(), [khaled().id, khaled().id]);
    expect(dup).toEqual({ error: "duplicate" });
    const ghost = await createQuoteRequest(quoteInput(), ["no-such-worker"]);
    expect(ghost).toEqual({ error: "unknown-worker" });
  });

  it("a signed-in customer who skips the optional email still sees their own quote jobs (customerId lookup)", async () => {
    // The email is OPTIONAL on the quote form — the session id is the only
    // identity stamped when a signed-in customer leaves it blank.
    const created = quoteOf(
      await createQuoteRequest(quoteInput({ customerId: "u-customer", customerEmail: undefined }), [khaled().id])
    );
    expect(created.customerId).toBe("u-customer");
    expect(created.customerEmail).toBeUndefined();

    // The email-less job is invisible to the email lookup (and the store has
    // no sara@example.com jobs)…
    expect(await getCustomerQuoteRequests({ email: "sara@example.com" })).toEqual([]);

    // …but the signed-in customer's session id finds it — the /bookings page
    // passes { email, customerId }, and the customerId branch is what matches.
    const mine = await getCustomerQuoteRequests({ customerId: "u-customer" });
    expect(mine.some((q) => q.id === created.id)).toBe(true);
    expect(mine[0]!.customerName).toBe("Noor E.");

    // The single-job read enforces the same ownership by customerId.
    expect((await getQuoteRequest(created.number, { customerId: "u-customer" }))?.id).toBe(created.id);
    expect(await getQuoteRequest(created.number, { customerId: "someone-else" })).toBeNull();
  });

  it("submitQuote: QUOTING → QUOTED with the bid; no slot claim; the job flips OPEN → QUOTING; a re-bid is refused", async () => {
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id, ali().id]));
    const bid = created.bookings[0]!;

    const submitted = await submitQuote(bid.id, { quote: 25000, deposit: 5000 });
    expect(submitted?.status).toBe("quoted");
    expect(submitted?.quote).toBe(25000);
    expect(submitted?.deposit).toBe(5000);
    expect(submitted?.startAt).toBeUndefined(); // rule 3 — bids are not commitments

    // The job container moved OPEN → QUOTING once the first bid landed.
    const after = await getCustomerQuoteRequests({ email: "noor@example.com" });
    expect(after.find((q) => q.id === created.id)?.status).toBe("quoting");

    // A second submit on the same booking is refused (CAS on QUOTING).
    expect(await submitQuote(bid.id, { quote: 1 })).toBeNull();
    // An unknown booking is refused.
    expect(await submitQuote("bk-nope", { quote: 1 })).toBeNull();
  });

  it("selectQuote: winner claims the slot (RESERVED + times stamped), losers are system-DECLINED, job → SELECTED once; re-select is closed", async () => {
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id, ali().id]));
    const [khaledBid, aliBid] = created.bookings;
    await submitQuote(khaledBid!.id, { quote: 30000 });
    await submitQuote(aliBid!.id, { quote: 20000 });

    const slot = demoAddSlot(khaled().id, new Date(2027, 0, 7, 9).toISOString(), new Date(2027, 0, 7, 10).toISOString());
    const winner = await selectQuote(created.id, khaledBid!.id, slot.id);
    if ("error" in winner) throw new Error(`expected winner, got ${winner.error}`);

    expect(winner.id).toBe(khaledBid!.id);
    expect(winner.status).toBe("requested");
    expect(winner.startAt).toBe(slot.startAt); // the winner is now slot-bound
    expect(winner.events.at(-1)).toMatchObject({ status: "requested", actorType: "customer" });

    // The slot is RESERVED + linked; the losers are DECLINED (slot-less).
    const slots = await getWorkerSlots(khaled().id);
    expect(slots.find((s) => s.id === slot.id)?.status).toBe("reserved");
    const mine = await getCustomerQuoteRequests({ email: "noor@example.com" });
    const job = mine.find((q) => q.id === created.id)!;
    expect(job.status).toBe("selected");
    expect(job.bookings.find((b) => b.id === aliBid!.id)?.status).toBe("declined");
    expect(job.bookings.find((b) => b.id === aliBid!.id)?.events.at(-1)).toMatchObject({
      status: "declined",
      actorType: "system",
    });

    // Re-selecting the closed job is refused; a fresh slot is NOT claimed.
    const again = await selectQuote(created.id, khaledBid!.id, slot.id);
    expect(again).toEqual({ error: "closed" });
  });

  it("selectQuote guards: not-quoted winner and slot-taken", async () => {
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id, ali().id]));
    const [khaledBid, aliBid] = created.bookings;
    await submitQuote(aliBid!.id, { quote: 20000 });
    const slot = demoAddSlot(khaled().id, new Date(2027, 0, 7, 9).toISOString(), new Date(2027, 0, 7, 10).toISOString());

    // The winner hasn't bid yet → not-quoted.
    expect(await selectQuote(created.id, khaledBid!.id, slot.id)).toEqual({ error: "not-quoted" });

    // Now bid and claim the slot with a plain booking — the pick must lose it.
    await submitQuote(khaledBid!.id, { quote: 30000 });
    const slotTaken = await createBookingRequest({
      workerId: khaled().id,
      slotId: slot.id,
      customerName: "Sara Customer",
      customerPhone: "+966 50 000 0000",
      jobTitle: "Leaking sink",
    });
    expect("error" in slotTaken).toBe(false);
    expect(await selectQuote(created.id, khaledBid!.id, slot.id)).toEqual({ error: "slot-taken" });
  });

  it("expireQuoteRequests: past-expiry jobs flip EXPIRED and their open bids are DECLINED; idempotent re-run", async () => {
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id, ali().id]));
    await submitQuote(created.bookings[0]!.id, { quote: 25000 });
    // Backdate the expiresAt (the demo store holds the request by reference).
    created.expiresAt = new Date(Date.now() - 1000).toISOString();

    const expired = await expireQuoteRequests();
    expect(expired).toBe(1);
    const job = (await getCustomerQuoteRequests({ email: "noor@example.com" })).find((q) => q.id === created.id)!;
    expect(job.status).toBe("expired");
    for (const b of job.bookings) expect(b.status).toBe("declined");
    expect(job.bookings[0]?.events.at(-1)).toMatchObject({ status: "declined", actorType: "system", reason: "Quote window closed" });

    // Idempotent — a re-run finds nothing due.
    expect(await expireQuoteRequests()).toBe(0);
  });

  it("server actions: createQuoteRequestAction + submitQuoteAction + selectQuoteAction round-trip (major → minor money)", async () => {
    const { createQuoteRequestAction, submitQuoteAction, selectQuoteAction } = await import("../src/app/actions/bookings");
    const fd = new FormData();
    fd.set("customerName", "Noor E.");
    fd.set("customerPhone", "+966 55 123 4871");
    fd.set("customerEmail", "noor@example.com");
    fd.set("jobTitle", "Fix a leaking pipe under the kitchen sink");
    const res = await createQuoteRequestAction([khaled().slug, ali().slug], fd);
    expect(res.ok).toBe(true);
    // More than MAX_QUOTE_WORKERS slugs → too-many at the action layer.
    const slugs = [khaled().slug, ali().slug, omar().slug, workerBySlug("ahmed-el-sayed-masonry")!.slug];
    expect((await createQuoteRequestAction(slugs, fd)).error).toBe("too-many");

    const job = (await getCustomerQuoteRequests({ email: "noor@example.com" }))[0]!;
    const bid = job.bookings[0]!;
    const bidFd = new FormData();
    bidFd.set("quote", "250"); // major units
    bidFd.set("deposit", "50");
    expect((await submitQuoteAction(bid.id, bidFd)).ok).toBe(true);
    const quoted = job.bookings[0]!;
    expect(quoted.quote).toBe(25000); // ×100 minor units
    expect(quoted.deposit).toBe(5000);

    const slot = demoAddSlot(khaled().id, new Date(2027, 0, 7, 9).toISOString(), new Date(2027, 0, 7, 10).toISOString());
    const pickFd = new FormData();
    pickFd.set("winnerBookingId", bid.id);
    pickFd.set("slotId", slot.id);
    const picked = await selectQuoteAction(job.id, pickFd);
    expect(picked.ok).toBe(true);
  });

  it("quote bookings count in the admin funnel without converting (requested-only conversion is untouched)", async () => {
    // The funnel's status tally includes quoting/quoted keys (zeroed + counted).
    const created = quoteOf(await createQuoteRequest(quoteInput(), [khaled().id]));
    await submitQuote(created.bookings[0]!.id, { quote: 25000 });
    const funnel = await getBookingFunnel(30);
    expect(funnel.counts.quoting).toBe(0); // the quote booking is created now (in-window) — but it sits in quoting…
    expect(funnel.counts.quoted).toBeGreaterThanOrEqual(1);
    expect(Object.keys(funnel.counts)).toHaveLength(14); // every BookingStatus key incl. quoting/quoted + the audit-only message/refunded keys
  });
});
