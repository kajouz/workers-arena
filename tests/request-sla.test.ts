import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoAddSlot,
  demoCreateBookingRequest,
  demoGetWorkerBookings,
  demoGetWorkerSlots,
  demoRunRequestSla,
  resetBookingsStore,
  resetRequestSla,
} from "../src/lib/data/bookings";
import { getNotifications } from "../src/lib/data/notifications";
import { workerBySlug } from "../src/lib/data/workers";
import {
  BOOKING_SLA_EXPIRE_HOURS,
  BOOKING_SLA_NUDGE_HOURS,
  requestSlaExpiryMs,
  slaExpireDue,
  slaNudgeDue,
  type Booking,
} from "../src/lib/data/types";

const DEMO_WORKER = "khaled-al-harbi-plumbing";
const HOUR = 60 * 60 * 1000;
// Fixed clock so the SLA windows are deterministic (the demo engine takes a
// `now` argument; the seeded slots sit at 10:00/14:00, clear of the 36h window).
const NOW = new Date("2026-08-10T09:00:00.000Z");

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

/** Create a REQUESTED booking whose first event is backdated `ageMs` ago.
 * `hourOffset` gives each caller a distinct slot window (the overlap guard
 * rejects two requests on the same window). */
async function staleRequest(ageMs: number, hourOffset = 36): Promise<Booking> {
  const w = khaled();
  const start = new Date(NOW.getTime() + hourOffset * HOUR);
  const slot = demoAddSlot(w.id, start.toISOString(), new Date(start.getTime() + HOUR).toISOString(), "available");
  const created = await demoCreateBookingRequest({
    workerId: w.id,
    slotId: slot.id,
    customerName: "Noor E.",
    customerPhone: "+966 55 123 4871",
    customerEmail: "noor@example.com",
    jobTitle: "Fix a leaking pipe under the kitchen sink",
  });
  if ("error" in created) throw new Error(`create failed: ${created.error}`);
  created.events[0]!.time = new Date(NOW.getTime() - ageMs).toISOString();
  return created;
}

function typeCount(type: string) {
  return getNotifications().then((list) => list.filter((n) => n.type === type).length);
}

beforeEach(() => {
  resetBookingsStore();
  resetRequestSla();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Request SLA — pure window helpers", () => {
  it("nudge fires at exactly BOOKING_SLA_NUDGE_HOURS, not a millisecond before", () => {
    const boundary = BOOKING_SLA_NUDGE_HOURS * HOUR;
    expect(slaNudgeDue(NOW.getTime() - boundary, NOW.getTime())).toBe(true);
    expect(slaNudgeDue(NOW.getTime() - boundary + 1, NOW.getTime())).toBe(false);
  });

  it("expire fires at exactly BOOKING_SLA_EXPIRE_HOURS, not a millisecond before", () => {
    const boundary = BOOKING_SLA_EXPIRE_HOURS * HOUR;
    expect(slaExpireDue(NOW.getTime() - boundary, NOW.getTime())).toBe(true);
    expect(slaExpireDue(NOW.getTime() - boundary + 1, NOW.getTime())).toBe(false);
  });

  it("requestSlaExpiryMs = creation (first audit event) + the expire window", () => {
    const b = {
      events: [{ status: "requested" as const, actorType: "customer", time: "2026-08-08T09:00:00.000Z" }],
      startAt: "2026-08-10T09:00:00.000Z",
    };
    expect(requestSlaExpiryMs(b)).toBe(Date.parse("2026-08-08T09:00:00.000Z") + BOOKING_SLA_EXPIRE_HOURS * HOUR);
  });
});

describe("Request SLA — demo engine", () => {
  it("nudges the worker once a request sits past the nudge window, leaving it requested", async () => {
    const booking = await staleRequest((BOOKING_SLA_NUDGE_HOURS + 1) * HOUR); // past nudge, before expire
    const before = await typeCount("bookingRequestNudge");

    const run = await demoRunRequestSla(NOW);
    expect(run.nudged).toBe(1);
    expect(run.expired).toBe(0);
    expect(run.expiredNumbers).toEqual([]);

    expect(await typeCount("bookingRequestNudge")).toBe(before + 1);
    const nudge = (await getNotifications()).find((n) => n.type === "bookingRequestNudge")!;
    expect(nudge.titleEn).toBe("Booking request needs a response");
    expect(nudge.titleAr).toBe("طلب الحجز ينتظر ردّك");
    expect(nudge.bodyEn).toContain(booking.customerName);
    expect(nudge.href).toBe("/dashboard");
    expect(nudge.read).toBe(false);

    // Still REQUESTED, slot still reserved — the nudge only reminds.
    expect(booking.status).toBe("requested");
  });

  it("auto-expires a request past the expire window: cancelled, slot freed, customer notified", async () => {
    const booking = await staleRequest((BOOKING_SLA_EXPIRE_HOURS + 1) * HOUR);
    const before = await typeCount("bookingRequestExpired");

    const run = await demoRunRequestSla(NOW);
    expect(run.expired).toBe(1);
    expect(run.expiredNumbers).toEqual([booking.number]);

    expect(booking.status).toBe("cancelled");
    expect(booking.events.at(-1)).toMatchObject({
      status: "cancelled",
      actorType: "system",
      reason: "Request auto-expired — no worker response within the SLA window",
    });
    const slot = demoGetWorkerSlots(khaled().id).find((s) => s.startAt === new Date(NOW.getTime() + 36 * HOUR).toISOString());
    expect(slot?.status).toBe("available");
    expect(slot?.bookingId).toBeUndefined();

    expect(await typeCount("bookingRequestExpired")).toBe(before + 1);
    const expired = (await getNotifications()).find((n) => n.type === "bookingRequestExpired")!;
    expect(expired.titleEn).toBe("Booking request expired");
    expect(expired.bodyEn).toContain(booking.number);
    expect(expired.href).toBe("/bookings");
  });

  it("handles a mixed batch in one pass — nudge for the young, expire for the stale", async () => {
    await staleRequest((BOOKING_SLA_NUDGE_HOURS + 1) * HOUR);
    await staleRequest((BOOKING_SLA_EXPIRE_HOURS + 1) * HOUR, 37);

    const run = await demoRunRequestSla(NOW);
    expect(run.nudged).toBe(1);
    expect(run.expired).toBe(1);
  });

  it("the worker read stamps slaNudgeSent once the cron has nudged (§2.2 surface)", async () => {
    const booking = await staleRequest((BOOKING_SLA_NUDGE_HOURS + 1) * HOUR); // past nudge, before expire
    expect((await demoGetWorkerBookings(khaled().id)).find((b) => b.id === booking.id)?.slaNudgeSent).toBeUndefined();
    await demoRunRequestSla(NOW);
    expect((await demoGetWorkerBookings(khaled().id)).find((b) => b.id === booking.id)?.slaNudgeSent).toBe(true);
    // The nudge never flipped the request — still requested.
    expect(booking.status).toBe("requested");
  });

  it("is idempotent — a second pass re-nudges nothing and expires nothing", async () => {
    await staleRequest((BOOKING_SLA_NUDGE_HOURS + 1) * HOUR);
    await staleRequest((BOOKING_SLA_EXPIRE_HOURS + 1) * HOUR, 37);
    const nudgeBefore = await typeCount("bookingRequestNudge");
    const expiredBefore = await typeCount("bookingRequestExpired");

    await demoRunRequestSla(NOW);
    const again = await demoRunRequestSla(NOW);
    expect(again.nudged).toBe(0);
    expect(again.expired).toBe(0);

    // Exactly one nudge + one expiry notification from this test's bookings.
    expect(await typeCount("bookingRequestNudge")).toBe(nudgeBefore + 1);
    expect(await typeCount("bookingRequestExpired")).toBe(expiredBefore + 1);
  });
});
