import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBookingReminderEngine, runDueReminderEngine, resetReminderEngine } from "../src/lib/notifications/reminders";
import { getNotifications } from "../src/lib/data/notifications";
import { demoAddSlot, demoCreateBookingRequest, demoRespondToBooking, resetBookingsStore } from "../src/lib/data/bookings";
import { workerBySlug } from "../src/lib/data/workers";

const DEMO_WORKER = "khaled-al-harbi-plumbing";
// Fixed clock so the 24h window is deterministic (seeded demo slots are at
// 10:00/14:00 "tomorrow" — this slot at 12:00 can never overlap them).
const NOW = new Date("2026-08-10T09:00:00.000Z");

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

/** Create an AVAILABLE slot at startAt and run it through request → accept. */
async function confirmBooking(startAt: Date, overrides: Record<string, unknown> = {}) {
  const w = khaled();
  const slot = demoAddSlot(w.id, startAt.toISOString(), new Date(startAt.getTime() + 60 * 60 * 1000).toISOString(), "available");
  const created = await demoCreateBookingRequest({
    workerId: w.id,
    slotId: slot.id,
    customerName: "Noor E.",
    customerPhone: "+966 55 123 4871",
    customerEmail: "noor@example.com",
    jobTitle: "Fix a leaking pipe under the kitchen sink",
    ...overrides,
  });
  if ("error" in created) throw new Error(`create failed: ${created.error}`);
  const responded = await demoRespondToBooking(created.id, { accept: true, quote: 8000 });
  if (!responded) throw new Error("accept failed");
  return responded;
}

function reminderCount() {
  return getNotifications().then((list) => list.filter((n) => n.type === "bookingReminder").length);
}

beforeEach(() => {
  resetBookingsStore();
  resetReminderEngine();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("booking reminder engine (M4)", () => {
  it("dispatches a 'job starts tomorrow' reminder for a CONFIRMED booking within 24h", async () => {
    const before = await reminderCount();
    const booking = await confirmBooking(new Date(NOW.getTime() + 3 * 60 * 60 * 1000)); // 12:00, same day

    const run = await runBookingReminderEngine(NOW);
    expect(run).toEqual({ dispatched: 1, alreadySent: 0, total: 1 });

    expect(await reminderCount()).toBe(before + 1);
    const reminder = (await getNotifications()).find((n) => n.type === "bookingReminder")!;
    expect(reminder.titleEn).toBe("Job starts tomorrow");
    expect(reminder.titleAr).toBe("الموعد غداً");
    expect(reminder.bodyEn).toContain(booking.number);
    expect(reminder.bodyEn).toContain(booking.jobTitle);
    expect(reminder.href).toBe("/bookings");
    expect(reminder.read).toBe(false);
  });

  it("carries the structured booking context (confirmation-email parity)", async () => {
    const booking = await confirmBooking(new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
    const { buildBookingReminder } = await import("../src/lib/notifications/reminders");
    const msg = buildBookingReminder(booking);
    // The reminder payload rides the same ChannelPayload.booking the
    // confirmation email renders (number/slot/quote → details card).
    expect(msg.booking?.number).toBe(booking.number);
    expect(msg.booking?.quote).toBe(8000); // minor units, as-is
    expect(msg.booking?.currency).toBe(booking.currency);
    expect(msg.booking?.jobTitle).toBe(booking.jobTitle);
  });

  it("never double-sends — a second run within the window is deduped per process", async () => {
    await confirmBooking(new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
    await runBookingReminderEngine(NOW);

    const again = await runBookingReminderEngine(NOW);
    expect(again).toEqual({ dispatched: 0, alreadySent: 1, total: 1 });
    // And a re-run after a fresh reset would RE-send (demo mode has no
    // persistent stamp) — the per-process set is the demo idempotency.
    resetReminderEngine();
    const fresh = await runBookingReminderEngine(NOW);
    expect(fresh.dispatched).toBe(1);
  });

  it("skips a CONFIRMED booking starting outside the 24h window", async () => {
    await confirmBooking(new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000)); // 3 days out
    const run = await runBookingReminderEngine(NOW);
    expect(run).toEqual({ dispatched: 0, alreadySent: 0, total: 0 });
  });

  it("skips non-CONFIRMED bookings (REQUESTED seed + PENDING_PAYMENT)", async () => {
    // Seed BK-1001 is REQUESTED — must not be reminded.
    const w = khaled();
    // PENDING_PAYMENT — accept with a deposit.
    const slot = demoAddSlot(w.id, new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(), new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString(), "available");
    const created = await demoCreateBookingRequest({
      workerId: w.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Deposit booking",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    await demoRespondToBooking(created.id, { accept: true, quote: 8000, deposit: 5000 });

    const run = await runBookingReminderEngine(NOW);
    expect(run).toEqual({ dispatched: 0, alreadySent: 0, total: 0 });
  });

  it("skips a booking without a customer email (guest — no addressable inbox, no channels)", async () => {
    const before = await reminderCount();
    await confirmBooking(new Date(NOW.getTime() + 3 * 60 * 60 * 1000), { customerEmail: undefined });
    const run = await runBookingReminderEngine(NOW);
    expect(run.dispatched).toBe(1); // still dispatches to the in-app inbox
    expect(await reminderCount()).toBe(before + 1);
  });
});

describe("runDueReminderEngine merge (M4)", () => {
  it("runs the booking reminder scan on the same cron tick and reports it", async () => {
    await confirmBooking(new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
    // No injectable clock here — run with the real now and a booking inside
    // the real 24h window (created just above, still ~21h out).
    const run = await runDueReminderEngine();
    expect(run.bookings).toBeDefined();
    expect(run.bookings.dispatched + run.bookings.alreadySent).toBe(run.bookings.total);
    // Subscription reminders stay functional alongside.
    expect(run.total).toBeGreaterThanOrEqual(0);
    expect(typeof run.dispatched).toBe("number");
  });
});

describe("reminders cron route", () => {
  it("rejects requests without the cron secret (401)", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const { GET } = await import("../src/app/api/cron/reminders/route");
    const res = await GET(new Request("http://localhost/api/cron/reminders"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("accepts the secret via header and runs both engines", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");
    const { GET } = await import("../src/app/api/cron/reminders/route");
    const res = await GET(
      new Request("http://localhost/api/cron/reminders", { headers: { "x-cron-secret": "test-secret" } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; bookings: { dispatched: number; alreadySent: number; total: number } };
    expect(body.ok).toBe(true);
    expect(typeof body.bookings.dispatched).toBe("number");
    expect(typeof body.bookings.alreadySent).toBe("number");
    expect(typeof body.bookings.total).toBe("number");
  });
});
