import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoAddSlot,
  demoAutoConfirmCompletions,
  demoConfirmBookingCompletion,
  demoCreateBookingRequest,
  demoGetWorkerBalance,
  demoRespondToBooking,
  demoTransitionBooking,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { getNotifications } from "../src/lib/data/notifications";
import { workerBySlug } from "../src/lib/data/workers";
import {
  BOOKING_COMPLETION_CONFIRM_GRACE_HOURS,
  completionGraceElapsed,
  type Booking,
} from "../src/lib/data/types";

const DEMO_WORKER = "khaled-al-harbi-plumbing";
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-08-10T09:00:00.000Z");

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

/** Request → accept (quote) → start → stage completion. `hourOffset` gives
 * each caller a distinct slot window (the overlap guard rejects two requests
 * on the same window). */
async function stagedBooking(quote = 8000, hourOffset = 36): Promise<Booking> {
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
  await demoRespondToBooking(created.id, { accept: true, quote });
  await demoTransitionBooking(created.id, "inProgress");
  const staged = await demoTransitionBooking(created.id, "completed");
  if (!staged) throw new Error("stage failed");
  return staged;
}

function typeCount(type: string) {
  return getNotifications().then((list) => list.filter((n) => n.type === type).length);
}

beforeEach(() => {
  resetBookingsStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("completion grace window (pure)", () => {
  it("elapses at exactly BOOKING_COMPLETION_CONFIRM_GRACE_HOURS, not a millisecond before", () => {
    const boundary = BOOKING_COMPLETION_CONFIRM_GRACE_HOURS * HOUR;
    expect(completionGraceElapsed(NOW.getTime() - boundary, NOW.getTime())).toBe(true);
    expect(completionGraceElapsed(NOW.getTime() - boundary + 1, NOW.getTime())).toBe(false);
  });
});

describe("customer-confirms-completion — demo lifecycle (§2.3)", () => {
  it("a worker 'completed' flip is STAGED (completionPending), not completed", async () => {
    const staged = await stagedBooking();
    expect(staged.status).toBe("completionPending");
    expect(staged.events.at(-1)).toMatchObject({ status: "completionPending", actorType: "worker" });
    // Earnings NOT credited at the staged flip.
    expect((await demoGetWorkerBalance(khaled().id)).availableMinor).toBe(0);
  });

  it("customer confirm → completed: earnings credit + worker notified; re-confirm is a no-op", async () => {
    const staged = await stagedBooking(8000); // fee 560 → net 7440
    const confirmed = await demoConfirmBookingCompletion(staged.id);
    expect(confirmed?.status).toBe("completed");
    expect(confirmed!.events.at(-1)).toMatchObject({ status: "completed", actorType: "customer" });
    expect((await demoGetWorkerBalance(khaled().id)).availableMinor).toBe(7440);

    const inbox = await getNotifications();
    expect(inbox.some((n) => n.type === "bookingCompletionConfirmed" && n.href === "/dashboard")).toBe(true);
    expect(await demoConfirmBookingCompletion(staged.id)).toBeNull(); // already completed
    // No double-credit.
    expect((await demoGetWorkerBalance(khaled().id)).availableMinor).toBe(7440);
  });

  it("confirming a non-staged booking is rejected", async () => {
    const w = khaled();
    const start = new Date(NOW.getTime() + 36 * HOUR);
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
    // REQUESTED — not staged.
    expect(await demoConfirmBookingCompletion(created.id)).toBeNull();
  });

  it("the grace cron auto-confirms stale staged completions: earnings credit + customer receipt", async () => {
    const staged = await stagedBooking(8000);
    // Backdate the staged event past the grace window.
    const stagedEvent = [...staged.events].reverse().find((e) => e.status === "completionPending")!;
    stagedEvent.time = new Date(NOW.getTime() - (BOOKING_COMPLETION_CONFIRM_GRACE_HOURS + 1) * HOUR).toISOString();

    expect(await demoAutoConfirmCompletions(NOW)).toBe(1);
    expect(staged.status).toBe("completed");
    expect(staged.events.at(-1)).toMatchObject({ status: "completed", actorType: "system" });
    expect((await demoGetWorkerBalance(khaled().id)).availableMinor).toBe(7440);
    const inbox = await getNotifications();
    expect(inbox.some((n) => n.type === "bookingCompleted" && n.href === "/bookings")).toBe(true);
  });

  it("the grace cron skips fresh staged completions and is idempotent", async () => {
    await stagedBooking(); // staged now → not yet due
    expect(await demoAutoConfirmCompletions(NOW)).toBe(0);
    expect((await demoGetWorkerBalance(khaled().id)).availableMinor).toBe(0);
    // Idempotent re-run after the grace passes: the completed booking is gone
    // from the scan.
    const again = await stagedBooking(8000, 37);
    const ev = [...again.events].reverse().find((e) => e.status === "completionPending")!;
    ev.time = new Date(NOW.getTime() - (BOOKING_COMPLETION_CONFIRM_GRACE_HOURS + 1) * HOUR).toISOString();
    expect(await demoAutoConfirmCompletions(NOW)).toBe(1);
    expect(await demoAutoConfirmCompletions(NOW)).toBe(0);
  });
});
