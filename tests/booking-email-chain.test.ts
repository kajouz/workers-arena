import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPayload } from "../src/lib/notifications/types";

/**
 * E2E-ish chain test: demo adapter respondToBooking → pushNotification →
 * dispatch → renderBookingEmail. The outbound seam is mocked so the
 * fire-and-forget dispatch in pushNotification exposes the ChannelPayload
 * instead of swallowing it — then we assert the payload's booking context
 * matches the booking (number, slot, quote) and that the confirmation email
 * renders it. Lives in its own file because the vi.mock is file-scoped and
 * must not hijack the dispatcher for the rest of the suite.
 */
const { dispatched } = vi.hoisted(() => ({ dispatched: [] as ChannelPayload[] }));

vi.mock("../src/lib/notifications/dispatcher", () => ({
  // Synchronous capture: the mock body runs during the dispatch() call, so no
  // microtask flush is needed before asserting.
  dispatch: (payload: ChannelPayload) => {
    dispatched.push(payload);
    return Promise.resolve([]);
  },
  getEnabledChannels: () => [],
  resetChannels: () => {},
}));

import {
  demoAddSlot,
  demoCancelBooking,
  demoConfirmBookingPayment,
  demoCreateBookingRequest,
  demoRespondToBooking,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { simulatedProvider } from "../src/lib/payments/simulated";
import { workerBySlug } from "../src/lib/data/workers";
import { renderBookingEmail } from "../src/lib/notifications/templates";

beforeEach(() => {
  resetBookingsStore();
  dispatched.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("booking email chain (demo adapter → dispatcher → renderer)", () => {
  it("respondToBooking dispatches a bookingConfirmed payload that renderBookingEmail renders", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");

    // Request → accept on a fresh AVAILABLE slot (09:00–10:00).
    const slot = demoAddSlot(
      worker.id,
      "2026-08-20T09:00:00.000Z",
      "2026-08-20T10:00:00.000Z",
      "available"
    );
    const created = await demoCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Leaking kitchen sink repair",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const booking = await demoRespondToBooking(created.id, { accept: true, quote: 8000 });
    expect(booking).not.toBeNull();
    expect(booking!.status).toBe("confirmed");
    expect(booking!.quote).toBe(8000);

    // The request notification went to the worker, the confirmation to the
    // customer — both dispatched through the seam.
    const requestPayload = dispatched.find((p) => p.type === "bookingRequest");
    expect(requestPayload).toBeDefined();
    expect(requestPayload!.href).toBe("/dashboard");
    expect(requestPayload!.booking?.number).toBe(booking!.number);

    const emailPayload = dispatched.find((p) => p.type === "bookingConfirmed");
    expect(emailPayload).toBeDefined();
    expect(emailPayload!.href).toBe("/bookings");
    expect(emailPayload!.recipient?.email).toBe("noor@example.com");

    // ChannelPayload.booking matches the booking: number, slot times, quote,
    // and the M5 fee snapshot (premium worker, 7% of 8000 minor = 560).
    expect(emailPayload!.booking).toMatchObject({
      number: booking!.number,
      startAt: slot.startAt,
      endAt: slot.endAt,
      quote: booking!.quote,
      currency: booking!.currency,
      jobTitle: booking!.jobTitle,
      platformFee: 560,
    });

    // And the confirmation email renders that same booking — including the
    // platform-fee line, so the receipt matches the customer booking row.
    const email = renderBookingEmail(emailPayload!, "en");
    expect(email.subject).toContain(booking!.number);
    expect(email.html).toContain("Booking details");
    expect(email.html).toContain(booking!.number);
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain("Platform fee");
    expect(email.html).toContain("SAR 6"); // 560 minor → 5.6, display-rounded
    expect(email.text).toContain("Platform fee: SAR 6");
    expect(email.html).toContain("Leaking kitchen sink repair");
    expect(email.html).toContain(`/admin/bookings/${booking!.number}`);
  });

  it("an Enterprise worker's confirmation email shows a fee-waived line instead of an amount", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");
    const original = worker.subscription.plan;
    try {
      worker.subscription.plan = "enterprise";

      // Request → accept on a fresh AVAILABLE slot; exempt plan → fee 0.
      const slot = demoAddSlot(
        worker.id,
        "2026-08-23T09:00:00.000Z",
        "2026-08-23T10:00:00.000Z",
        "available"
      );
      const created = await demoCreateBookingRequest({
        workerId: worker.id,
        slotId: slot.id,
        customerName: "Noor E.",
        customerPhone: "+966 55 123 4871",
        customerEmail: "noor@example.com",
        jobTitle: "Pipe replacement",
      });
      if ("error" in created) throw new Error(`create failed: ${created.error}`);

      const booking = await demoRespondToBooking(created.id, { accept: true, quote: 8000 });
      expect(booking!.platformFee).toBe(0);

      const emailPayload = dispatched.find((p) => p.type === "bookingConfirmed");
      expect(emailPayload).toBeDefined();
      // The waived marker (0) rides the payload exactly like the booking row.
      expect(emailPayload!.booking?.platformFee).toBe(0);

      const email = renderBookingEmail(emailPayload!, "en");
      expect(email.html).toContain("Platform fee");
      expect(email.html).toContain("Waived by the worker's plan");
      expect(email.html).not.toContain("SAR 6"); // no amount — the fee is waived
      expect(email.text).toContain("Platform fee: Waived by the worker's plan");
    } finally {
      worker.subscription.plan = original;
    }
  });

  it("a declined response dispatches bookingDeclined instead", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");

    const slot = demoAddSlot(worker.id, "2026-08-21T14:00:00.000Z", "2026-08-21T15:00:00.000Z", "available");
    const created = await demoCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Sink repair",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const booking = await demoRespondToBooking(created.id, { accept: false, declineReason: "Too far" });
    expect(booking?.status).toBe("declined");

    const declined = dispatched.find((p) => p.type === "bookingDeclined");
    expect(declined).toBeDefined();
    expect(declined!.booking?.number).toBe(created.number);
    // The declined slot is freed, but the payload still carries the ORIGINAL
    // booking context (the slot the customer had requested).
    expect(declined!.booking?.startAt).toBe(slot.startAt);
  });

  it("a customer cancel dispatches a bookingCancelled payload (to the worker) that renderBookingEmail renders", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");

    // Request → accept → customer cancel on a fresh AVAILABLE slot.
    const slot = demoAddSlot(
      worker.id,
      "2026-08-22T11:00:00.000Z",
      "2026-08-22T12:00:00.000Z",
      "available"
    );
    const created = await demoCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Bathroom leak repair",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const confirmed = await demoRespondToBooking(created.id, { accept: true, quote: 8000 });
    expect(confirmed?.status).toBe("confirmed");

    const cancelled = await demoCancelBooking(created.id, {
      by: "customer",
      reason: "Found another provider",
    });
    expect(cancelled?.status).toBe("cancelled");
    // Rule 3 — cancellation frees the slot back to AVAILABLE.
    expect(slot.status).toBe("available");

    // The customer's cancel notifies the WORKER: type bookingCancelled,
    // deep-link /dashboard, addressed to the worker's email.
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/dashboard");
    expect(cancelPayload!.recipient?.email).toBe("khaled@plumbfix.sa");

    // The payload carries the ORIGINAL confirmed slot (cancel mutates only
    // status/slot, never the times or quote) — same shape as the confirm test.
    expect(cancelPayload!.booking).toMatchObject({
      number: cancelled!.number,
      startAt: slot.startAt,
      endAt: slot.endAt,
      quote: cancelled!.quote,
      currency: cancelled!.currency,
      jobTitle: cancelled!.jobTitle,
    });

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(cancelled!.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${cancelled!.number}`);
  });

  it("a worker cancel refunds the paid deposit and dispatches a customer-addressed bookingCancelled payload that renderBookingEmail renders", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");

    // Deposit accept → PENDING_PAYMENT → paid → CONFIRMED (M3 deposit path).
    // The slot is 72h out — DYNAMIC, not a fixed date: the refund assertion
    // below is time-sensitive (worker cancel > 24h before start refunds), so a
    // fixed date would silently flip to the keep-deposit branch after it
    // passes (same convention as tests/payments.test.ts's FAR()).
    const startAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const slot = demoAddSlot(
      worker.id,
      startAt,
      new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
      "available"
    );
    const created = await demoCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Water heater install",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const pending = await demoRespondToBooking(created.id, { accept: true, quote: 8000, deposit: 3000 });
    expect(pending?.status).toBe("pendingPayment");
    const paid = await demoConfirmBookingPayment(created.id, `sim_pay-${created.id}`);
    expect(paid?.status).toBe("confirmed");

    // Worker cancels > 24h before start → the paid deposit is refunded (M4
    // window). Pin the registry to the simulated provider so the spy observes
    // the adapter's refund call (same guard as tests/payments.test.ts).
    delete process.env.STRIPE_SECRET_KEY;
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await demoCancelBooking(created.id, { by: "worker", reason: "Machine broke" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).toHaveBeenCalledTimes(1); // refund-window path exercised
    expect(slot.status).toBe("available"); // rule 3 — slot freed

    // The worker's cancel notifies the CUSTOMER: type bookingCancelled,
    // deep-link /bookings, addressed to the customer's email.
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/bookings");
    expect(cancelPayload!.recipient?.email).toBe("noor@example.com");

    // The payload carries the ORIGINAL confirmed slot (cancel mutates only
    // status/slot, never the times or quote) — same shape as the other branches.
    expect(cancelPayload!.booking).toMatchObject({
      number: cancelled!.number,
      startAt: slot.startAt,
      endAt: slot.endAt,
      quote: cancelled!.quote,
      currency: cancelled!.currency,
      jobTitle: cancelled!.jobTitle,
    });

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(cancelled!.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${cancelled!.number}`);

    // The refund also dispatches a bookingRefund email to the customer with
    // the refunded amount + reason (M4 refund notification).
    const refundPayload = dispatched.find((p) => p.type === "bookingRefund");
    expect(refundPayload).toBeDefined();
    expect(refundPayload!.href).toBe("/bookings");
    expect(refundPayload!.recipient?.email).toBe("noor@example.com");
    expect(refundPayload!.booking?.refund).toMatchObject({ amount: 3000, reason: "Machine broke" });

    const refundEmail = renderBookingEmail(refundPayload!, "en");
    expect(refundEmail.subject).toContain(cancelled!.number);
    expect(refundEmail.html).toContain("Deposit refunded");
    expect(refundEmail.html).toContain("SAR 30"); // refund 3000 minor → 30 major
    expect(refundEmail.html).toContain("Machine broke"); // reason row in the card
    expect(refundEmail.html).toContain(`/admin/bookings/${cancelled!.number}`);
  });

  it("a worker cancel within 24h KEEPS the deposit but still dispatches the customer-addressed bookingCancelled payload", async () => {
    const worker = workerBySlug("khaled-al-harbi-plumbing");
    if (!worker) throw new Error("demo worker missing");

    // Deposit accept → paid → CONFIRMED. The slot sits 2h out — INSIDE the
    // 24h cancellation-policy window, so this exercises the KEEP branch. The
    // offset is dynamic (mirroring payments.test.ts's NEAR()) — a fixed date
    // would silently flip branches once it passes.
    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const slot = demoAddSlot(
      worker.id,
      startAt,
      new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
      "available"
    );
    const created = await demoCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Sump pump install",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);

    const pending = await demoRespondToBooking(created.id, { accept: true, quote: 8000, deposit: 3000 });
    expect(pending?.status).toBe("pendingPayment");
    const paid = await demoConfirmBookingPayment(created.id, `sim_pay-${created.id}`);
    expect(paid?.status).toBe("confirmed");

    // Worker cancels within the window → the deposit is KEPT (no refund call
    // and no bookingRefund email) — but the slot still frees (rule 3).
    delete process.env.STRIPE_SECRET_KEY;
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await demoCancelBooking(created.id, { by: "worker", reason: "Client changed scope" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).not.toHaveBeenCalled(); // keep-branch: no refund
    expect(slot.status).toBe("available");

    // The cancellation STILL notifies the customer with the booking context.
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/bookings");
    expect(cancelPayload!.recipient?.email).toBe("noor@example.com");
    expect(cancelPayload!.booking).toMatchObject({
      number: cancelled!.number,
      startAt: slot.startAt,
      endAt: slot.endAt,
      quote: cancelled!.quote,
      currency: cancelled!.currency,
      jobTitle: cancelled!.jobTitle,
    });

    // No refund notification fired.
    expect(dispatched.find((p) => p.type === "bookingRefund")).toBeUndefined();

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(cancelled!.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${cancelled!.number}`);
  });
});
