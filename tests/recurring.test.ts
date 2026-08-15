import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  demoCancelRecurringContract,
  demoCreateRecurringRequest,
  demoGetCustomerRecurrings,
  demoGetWorkerRecurrings,
  demoRespondToRecurring,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { RECURRING_OCCURRENCE_COUNT, generateRecurringOccurrences } from "../src/lib/data/recurring";
import { workerBySlug } from "../src/lib/data/workers";
import type { Booking, RecurringBooking } from "../src/lib/data/types";

const DEMO_WORKER = "khaled-al-harbi-plumbing";

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

function request(slotId: string, frequency: "weekly" | "biweekly" | "monthly" = "weekly") {
  return {
    workerId: khaled().id,
    slotId,
    customerName: "Noor E.",
    customerPhone: "+966 55 123 4871",
    customerEmail: "noor@example.com",
    jobTitle: "Monthly AC maintenance",
    frequency,
  };
}

function bookingOf(r: { recurring: unknown; booking: Booking } | { error: string }): Booking {
  if ("error" in r) throw new Error(`expected booking, got error ${r.error}`);
  return r.booking;
}

function recurringOf(r: { recurring: RecurringBooking } | { error: string }): RecurringBooking {
  if ("error" in r) throw new Error(`expected recurring, got error ${r.error}`);
  return r.recurring;
}

describe("generateRecurringOccurrences (pure cadence)", () => {
  it("weekly advances exactly 7 days, preserving time-of-day", () => {
    const out = generateRecurringOccurrences("2026-03-02T09:00:00.000Z", "weekly", 3);
    expect(out).toEqual([
      "2026-03-09T09:00:00.000Z",
      "2026-03-16T09:00:00.000Z",
      "2026-03-23T09:00:00.000Z",
    ]);
  });

  it("biweekly advances exactly 14 days", () => {
    const out = generateRecurringOccurrences("2026-03-02T09:00:00.000Z", "biweekly", 2);
    expect(out).toEqual(["2026-03-16T09:00:00.000Z", "2026-03-30T09:00:00.000Z"]);
  });

  it("monthly keeps the day-of-month, clamping month ends (Jan 31 → Feb 28 → Mar 28)", () => {
    const out = generateRecurringOccurrences("2026-01-31T10:30:00.000Z", "monthly", 2);
    expect(out).toEqual(["2026-02-28T10:30:00.000Z", "2026-03-28T10:30:00.000Z"]);
  });

  it("count 0 returns an empty list", () => {
    expect(generateRecurringOccurrences("2026-03-02T09:00:00.000Z", "weekly", 0)).toEqual([]);
  });
});

describe("demo recurring adapter (M1)", () => {
  beforeEach(() => resetBookingsStore());
  afterEach(() => resetBookingsStore());

  it("creates a contract whose first occurrence is a normal REQUESTED booking (slot RESERVED)", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const booking = bookingOf(r);
    const recurring = recurringOf(r);

    expect(booking.status).toBe("requested");
    expect(booking.recurringId).toBe(recurring.id);
    expect(recurring.frequency).toBe("weekly");
    expect(recurring.status).toBe("active");
    expect(recurring.occurrences).toHaveLength(1);
    expect(recurring.occurrences[0].id).toBe(booking.id);

    // The slot flipped to RESERVED exactly like a one-shot request.
    const slots = await (await import("../src/lib/data/bookings")).demoGetWorkerSlots(khaled().id, {});
    const slot = slots.find((s) => s.id === "slot-khaled-9");
    expect(slot?.status).toBe("reserved");
    expect(slot?.bookingId).toBe(booking.id);
  });

  it("refuses a slot that is no longer AVAILABLE (slot-taken)", async () => {
    // slot-khaled-10 is RESERVED by the seeded BK-1001; slot-khaled-14 is BLOCKED.
    const a = await demoCreateRecurringRequest(request("slot-khaled-10"));
    const b = await demoCreateRecurringRequest(request("slot-khaled-14"));
    expect("error" in a && a.error).toBe("slot-taken");
    expect("error" in b && b.error).toBe("slot-taken");
  });

  it("accept confirms the contract and materializes the cadence with the same terms", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const booking = bookingOf(r);
    const recurring = recurringOf(r);

    const accepted = await demoRespondToRecurring(recurring.id, { accept: true, quote: 10000 });
    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe("active");
    expect(accepted!.occurrences).toHaveLength(1 + RECURRING_OCCURRENCE_COUNT);

    const [first, ...future] = accepted!.occurrences;
    expect(first.status).toBe("confirmed");
    expect(first.quote).toBe(10000);
    // Take-rate stamped on the first occurrence (7% of 10000 = 700 minor).
    expect(first.platformFee).toBe(700);
    expect(first.platformFeeRateBps).toBe(700);

    // The future occurrences keep the cadence, the quote and the contract link.
    expect(future).toHaveLength(RECURRING_OCCURRENCE_COUNT);
    future.forEach((occ, i) => {
      expect(occ.recurringId).toBe(recurring.id);
      expect(occ.status).toBe("confirmed");
      expect(occ.quote).toBe(10000);
      expect(occ.platformFee).toBe(700);
      const expected = generateRecurringOccurrences(first.startAt!, "weekly", RECURRING_OCCURRENCE_COUNT);
      expect(occ.startAt).toBe(expected[i]);
    });
  });

  it("accept with a deposit lands the first occurrence in PENDING_PAYMENT", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "monthly"));
    const recurring = recurringOf(r);
    const accepted = await demoRespondToRecurring(recurring.id, { accept: true, quote: 8000, deposit: 4000 });
    expect(accepted!.occurrences[0].status).toBe("pendingPayment");
    expect(accepted!.occurrences[0].deposit).toBe(4000);
    expect(accepted!.occurrences[1].status).toBe("confirmed");
  });

  it("decline cancels the contract, declines the first occurrence and frees the slot", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const recurring = recurringOf(r);

    const declined = await demoRespondToRecurring(recurring.id, { accept: false, declineReason: "No capacity" });
    expect(declined!.status).toBe("cancelled");
    expect(declined!.occurrences[0].status).toBe("declined");

    const slots = await (await import("../src/lib/data/bookings")).demoGetWorkerSlots(khaled().id, {});
    expect(slots.find((s) => s.id === "slot-khaled-9")?.status).toBe("available");
  });

  it("respond on a cancelled contract is a no-op (null)", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9"));
    const recurring = recurringOf(r);
    await demoRespondToRecurring(recurring.id, { accept: false });
    expect(await demoRespondToRecurring(recurring.id, { accept: true })).toBeNull();
  });

  it("getWorkerRecurrings lists contracts scoped to the worker (a blocked-slot request never lands)", async () => {
    await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    // slot-khaled-14 is BLOCKED — the second request must fail and add nothing.
    await demoCreateRecurringRequest(request("slot-khaled-14", "monthly"));
    const list = demoGetWorkerRecurrings(khaled().id);
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe("RC-1001");
    expect(list[0].frequency).toBe("weekly");
  });

  it("getCustomerRecurrings matches by email and by normalized phone", async () => {
    await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const byEmail = demoGetCustomerRecurrings({ email: "NOOR@example.com" });
    expect(byEmail).toHaveLength(1);
    const byPhone = demoGetCustomerRecurrings({ phone: "+966 55 123-4871" });
    expect(byPhone).toHaveLength(1);
    expect(demoGetCustomerRecurrings({ phone: "+966 50 000 0000" })).toHaveLength(0);
    expect(demoGetCustomerRecurrings({})).toHaveLength(0);
  });

  it("customer cancel frees the anchor slot and stops the cadence", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const recurring = recurringOf(r);
    await demoRespondToRecurring(recurring.id, { accept: true, quote: 10000 });

    const cancelled = await demoCancelRecurringContract(recurring.id, "Moving abroad");
    expect(cancelled).not.toBeNull();
    expect(cancelled!.status).toBe("cancelled");
    // The anchor occurrence went through the normal cancel path; the future
    // occurrences flipped in place — every occurrence is now terminal.
    for (const occ of cancelled!.occurrences) {
      expect(occ.status).toBe("cancelled");
      expect(occ.events.at(-1)?.actorType).toBe("customer");
    }
    const slots = await (await import("../src/lib/data/bookings")).demoGetWorkerSlots(khaled().id, {});
    expect(slots.find((s) => s.id === "slot-khaled-9")?.status).toBe("available");
    expect(slots.find((s) => s.id === "slot-khaled-9")?.bookingId).toBeUndefined();
  });

  it("cancel on an already-cancelled contract is a no-op (null)", async () => {
    const r = await demoCreateRecurringRequest(request("slot-khaled-9", "weekly"));
    const recurring = recurringOf(r);
    await demoCancelRecurringContract(recurring.id);
    expect(await demoCancelRecurringContract(recurring.id)).toBeNull();
  });
});
