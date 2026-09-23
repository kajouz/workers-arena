/**
 * §Guest → account claim — the demo half of the lifecycle (docs/guest-claim.md).
 *
 * The engine tests prove the RULES. These prove the seam honours them against
 * the real store: a guest booking made with a formatted phone is found by the
 * bare number the account registered, it becomes visible to the owner's
 * `/bookings` lookup, a second run links nothing new, and a booking that belongs
 * to somebody else is left exactly where it was.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  demoAddSlot,
  demoClaimGuestHistory,
  demoClaimableGuestRecords,
  demoCreateBookingRequest,
  demoCreateRecurringRequest,
  demoGetCustomerBookings,
  demoGetCustomerRecurrings,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { workerBySlug } from "../src/lib/data/workers";

const W_SLUG = "khaled-al-harbi-plumbing";
// A number the seeded guest booking (BK-1001) does NOT use, so each assertion
// counts only the fixture this test created. The seeded row is the subject of
// its own test below.
const PHONE_FORMATTED = "+961 71 555 000";
const PHONE_BARE = "+96171555000";
const HOUR = 60 * 60 * 1000;

function khaled() {
  const w = workerBySlug(W_SLUG);
  if (!w) throw new Error("demo worker missing");
  return w;
}

/** A guest request: name + phone, no customerId — the shape the claim targets. */
async function guestBooking(hourOffset: number) {
  const w = khaled();
  const start = new Date(Date.now() + hourOffset * HOUR);
  const slot = demoAddSlot(w.id, start.toISOString(), new Date(start.getTime() + HOUR).toISOString(), "available");
  const created = await demoCreateBookingRequest({
    workerId: w.id,
    slotId: slot.id,
    customerName: "Noor E.",
    customerPhone: PHONE_FORMATTED,
    jobTitle: "Fix a leaking pipe under the kitchen sink",
  });
  if ("error" in created) throw new Error(`create failed: ${created.error}`);
  return created;
}

beforeEach(() => {
  resetBookingsStore();
});

describe("demoClaimGuestHistory", () => {
  it("links a guest booking found through the normalized phone", async () => {
    const booking = await guestBooking(30);
    expect(booking.customerId).toBeUndefined();

    const result = demoClaimGuestHistory("u-new", { phone: PHONE_BARE });
    expect(result.linked).toBe(1);
    expect(result.bookings.claimable).toEqual([booking.id]);

    // Visible to the OWNER's lookup (the /bookings page's identifier), and
    // stamped so the surface can say when it happened.
    const mine = demoGetCustomerBookings({ customerId: "u-new" });
    expect(mine.map((b) => b.id)).toEqual([booking.id]);
    expect(mine[0]!.customerId).toBe("u-new");
    expect(typeof mine[0]!.claimedAt).toBe("string");
  });

  it("is idempotent — a second sign-in links nothing and does not re-stamp", async () => {
    const booking = await guestBooking(30);
    const first = demoClaimGuestHistory("u-new", { phone: PHONE_BARE });
    const stampedAt = demoGetCustomerBookings({ customerId: "u-new" })[0]!.claimedAt;

    const second = demoClaimGuestHistory("u-new", { phone: PHONE_BARE });
    expect(first.linked).toBe(1);
    expect(second.linked).toBe(0);
    expect(second.alreadyLinked).toBe(1);
    expect(second.bookings.alreadyOwned).toEqual([booking.id]);
    // The original timestamp survives, so the surface never rewrites history.
    expect(demoGetCustomerBookings({ customerId: "u-new" })[0]!.claimedAt).toBe(stampedAt);
  });

  it("never takes a booking that belongs to another account", async () => {
    const booking = await guestBooking(30);
    demoClaimGuestHistory("u-first", { phone: PHONE_BARE });

    const intruder = demoClaimGuestHistory("u-second", { phone: PHONE_BARE });
    expect(intruder.linked).toBe(0);
    expect(intruder.ownedElsewhere).toBe(1);
    expect(intruder.bookings.foreign).toEqual([booking.id]);
    expect(demoGetCustomerBookings({ customerId: "u-second" })).toEqual([]);
    expect(demoGetCustomerBookings({ customerId: "u-first" })).toHaveLength(1);
  });

  it("links nothing when the account has no phone to prove itself with", async () => {
    await guestBooking(30);
    const result = demoClaimGuestHistory("u-new", { phone: null, email: "noor@example.com" });
    expect(result.linked).toBe(0);
    expect(demoGetCustomerBookings({ customerId: "u-new" })).toEqual([]);
  });

  it("claims the recurring contract booked as a guest alongside the booking", async () => {
    const w = khaled();
    const start = new Date(Date.now() + 30 * HOUR);
    const slot = demoAddSlot(w.id, start.toISOString(), new Date(start.getTime() + HOUR).toISOString(), "available");
    const created = await demoCreateRecurringRequest({
      workerId: w.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: PHONE_FORMATTED,
      jobTitle: "Monthly AC maintenance",
      frequency: "weekly",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const result = demoClaimGuestHistory("u-new", { phone: PHONE_BARE });
    expect(result.recurrings.claimable).toEqual([created.recurring.id]);
    const mine = demoGetCustomerRecurrings({ customerId: "u-new" });
    expect(mine.map((r) => r.id)).toEqual([created.recurring.id]);
    expect(mine[0]!.claimedAt).toBeTruthy();
  });

  it("finds the seeded guest booking through the bare form of its number", () => {
    // The demo seed's BK-1001 is a guest booking (`customerId` unset) made with
    // "+961 70 123 456" — the exact shape the claim exists for. This is the
    // end-to-end proof that a real dataset is matched, not just a fixture.
    const preview = demoClaimableGuestRecords({ userId: "u-newcomer", phone: "+96170123456" });
    expect(preview.bookings.claimable.length).toBeGreaterThan(0);
    expect(preview.linked).toBe(preview.bookings.claimable.length);
  });

  it("reports what WOULD be linked without writing anything", async () => {
    await guestBooking(30);
    const preview = demoClaimableGuestRecords({ userId: "u-new", phone: PHONE_BARE });
    expect(preview.linked).toBe(1);
    // Nothing was written: the booking is still a guest record.
    expect(demoGetCustomerBookings({ customerId: "u-new" })).toEqual([]);
    expect(demoGetCustomerBookings({ phone: PHONE_FORMATTED })).toHaveLength(1);
  });
});
