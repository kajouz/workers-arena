import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server action imports next/cache — mock it so the action layer is
// testable (the demo adapter underneath stays real).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { confirmPaymentAction, payBookingAction } from "../src/app/actions/bookings";
import {
  cancelBooking,
  confirmBookingPayment,
  createBookingCheckout,
  createBookingRequest,
  getCustomerBookings,
  getWorkerBookings,
  respondToBooking,
} from "../src/lib/data/repo";
import { demoAddSlot, resetBookingsStore } from "../src/lib/data/bookings";
import { getPaymentProvider } from "../src/lib/payments/registry";
import { simulatedProvider } from "../src/lib/payments/simulated";
import { workerBySlug } from "../src/lib/data/workers";
import type { Booking } from "../src/lib/data/types";

const DEMO_WORKER = "khaled-al-harbi-plumbing";

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

function bookingOf(r: Booking | { error: string }): Booking {
  if ("error" in r) throw new Error(`expected booking, got error ${r.error}`);
  return r;
}

beforeEach(() => {
  resetBookingsStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Accept bk-1001 with a deposit → PENDING_PAYMENT + a Payment row. */
async function acceptWithDeposit(deposit = 5000): Promise<Booking> {
  const result = await respondToBooking("bk-1001", { accept: true, quote: 25000, deposit });
  const booking = bookingOf(result ?? { error: "not-found" });
  expect(booking.status).toBe("pendingPayment");
  expect(booking.deposit).toBe(deposit);
  expect(booking.paymentId).toBeTruthy();
  return booking;
}

/**
 * Build a fresh PAID booking on a slot with an explicit startAt — the
 * cancellation-policy tests need deterministic timing (the seeded bk-1001
 * sits at "tomorrow 10:00", which a 24h refund window would straddle
 * depending on the clock). Returns the confirmed booking.
 */
async function paidBookingOnSlot(startAt: string): Promise<Booking> {
  const w = khaled();
  const slot = demoAddSlot(
    w.id,
    startAt,
    new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
    "available"
  );
  const created = bookingOf(
    await createBookingRequest({
      workerId: w.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe",
    })
  );
  await respondToBooking(created.id, { accept: true, quote: 25000, deposit: 5000 });
  const confirmed = bookingOf(
    (await confirmBookingPayment(created.id, `sim_pay-${created.id}`)) ?? { error: "not-found" }
  );
  expect(confirmed.status).toBe("confirmed");
  return confirmed;
}

describe("M3 demo adapter — deposit checkout", () => {
  it("creates a Payment row + paymentId on accept-with-deposit", async () => {
    const booking = await acceptWithDeposit();
    expect(booking.paymentId).toBe("pay-bk-1001");
  });

  it("accept-without-deposit has no payment", async () => {
    const result = await respondToBooking("bk-1001", { accept: true, quote: 25000 });
    const booking = bookingOf(result ?? { error: "not-found" });
    expect(booking.status).toBe("confirmed");
    expect(booking.paymentId).toBeUndefined();
  });

  it("createBookingCheckout returns a simulated checkout URL and is idempotent", async () => {
    await acceptWithDeposit();
    const first = await createBookingCheckout("bk-1001");
    expect(first).not.toBeNull();
    expect(first!.url).toContain("/api/payments/simulate");
    const second = await createBookingCheckout("bk-1001");
    expect(second!.url).toBe(first!.url);
  });

  it("returns null for a booking that isn't awaiting payment", async () => {
    const checkout = await createBookingCheckout("bk-1001"); // still REQUESTED
    expect(checkout).toBeNull();
  });

  it("confirmBookingPayment flips PENDING_PAYMENT → CONFIRMED + notifies the customer", async () => {
    await acceptWithDeposit();
    const booking = bookingOf((await confirmBookingPayment("bk-1001", "sim_pay-bk-1001")) ?? { error: "not-found" });
    expect(booking.status).toBe("confirmed");
    expect(booking.events.at(-1)).toMatchObject({ status: "confirmed", actorType: "system" });

    const inbox = await getCustomerNotifications();
    expect(inbox.some((n) => n.type === "bookingPaid" && n.href === "/bookings")).toBe(true);
  });

  it("is idempotent — a second webhook delivery no-ops", async () => {
    await acceptWithDeposit();
    await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");
    const again = await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");
    expect(again).not.toBeNull();
    const booking = bookingOf(again ?? { error: "not-found" });
    expect(booking.status).toBe("confirmed");
    // Only one CONFIRMED event appended.
    expect(booking.events.filter((e) => e.status === "confirmed")).toHaveLength(1);
  });

  it("returns null when the booking isn't awaiting payment", async () => {
    const result = await confirmBookingPayment("bk-1001", "sim_pay-bk-1001"); // REQUESTED
    expect(result).toBeNull();
  });
});

describe("M3 invoice row (signed-in customers only)", () => {
  // The seeded bk-1001 is Sara's (demo user u-customer / sara@example.com), so
  // accept-with-deposit → confirm must mint her receipt; guest bookings (no
  // customerId) must not.
  it("creates a WA-YYYY-NNNNN invoice for a signed-in customer on confirm", async () => {
    await acceptWithDeposit();
    const booking = bookingOf((await confirmBookingPayment("bk-1001", "sim_pay-bk-1001")) ?? { error: "not-found" });
    expect(booking.invoice).toBeDefined();
    expect(booking.invoice?.number).toMatch(/^WA-\d{4}-\d{5}$/);
    expect(booking.invoice?.amount).toBe(5000); // minor units, as-is
    expect(booking.invoice?.currency).toBe("SAR");
    expect(booking.invoice?.status).toBe("paid");
  });

  it("skips the invoice for guest (phone-keyed) bookings", async () => {
    const far = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const booking = await paidBookingOnSlot(far()); // no customerId
    expect(booking.invoice).toBeUndefined();
  });

  it("a redelivered webhook doesn't create a second invoice", async () => {
    await acceptWithDeposit();
    await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");
    const again = bookingOf((await confirmBookingPayment("bk-1001", "sim_pay-bk-1001")) ?? { error: "not-found" });
    // The second delivery no-ops before the invoice step — the receipt stays
    // the single one from the first confirm.
    expect(again.invoice?.number).toMatch(/^WA-\d{4}-\d{5}$/);
    expect(again.invoice?.amount).toBe(5000);
  });

  it("invoices the customer lookup so the /bookings page can render it", async () => {
    await acceptWithDeposit();
    await confirmBookingPayment("bk-1001", "sim_pay-bk-1001");
    const found = (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001");
    expect(found?.invoice?.number).toMatch(/^WA-\d{4}-\d{5}$/);
  });

  it("sequences the number per year — the second signed-in invoice is 00002", async () => {
    // The store resets in beforeEach, so the first signed-in confirm is 00001.
    await acceptWithDeposit();
    const first = bookingOf((await confirmBookingPayment("bk-1001", "sim_pay-bk-1001")) ?? { error: "not-found" });
    const year = new Date().getFullYear();
    expect(first.invoice?.number).toBe(`WA-${year}-00001`);

    // A second signed-in booking on a custom slot → the next sequence value.
    const w = khaled();
    const far = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const slot = demoAddSlot(w.id, far(), new Date(new Date(far()).getTime() + 60 * 60 * 1000).toISOString(), "available");
    const created = bookingOf(
      await createBookingRequest({
        workerId: w.id,
        slotId: slot.id,
        customerId: "u-customer",
        customerName: "Sara Customer",
        customerPhone: "+966 50 000 0000",
        customerEmail: "sara2@example.com",
        jobTitle: "Second receipt",
      })
    );
    await respondToBooking(created.id, { accept: true, quote: 15000, deposit: 3000 });
    const second = bookingOf(
      (await confirmBookingPayment(created.id, `sim_pay-${created.id}`)) ?? { error: "not-found" }
    );
    expect(second.invoice?.number).toBe(`WA-${year}-00002`);
    expect(second.invoice?.number).not.toBe(first.invoice?.number);
  });
});

describe("M3 demo adapter — refund on cancel (M4 policy window)", () => {
  // Deterministic offsets: FAR sits outside the 24h refund window, NEAR inside
  // it — the policy (BOOKING_CANCEL_REFUND_WINDOW_MS) is what the branch tests
  // below pin down. The simulated provider is the registry's default, so
  // spying on its refund method observes whether the adapter actually called
  // the gateway — pin the registry to simulated first (a dev with
  // STRIPE_SECRET_KEY exported would otherwise get stripeProvider and the spy
  // would miss).
  const FAR = () => new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const NEAR = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("refunds a paid deposit when the worker cancels > 24h before start", async () => {
    const booking = await paidBookingOnSlot(FAR());
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await cancelBooking(booking.id, { by: "worker", reason: "Equipment issue" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).toHaveBeenCalledTimes(1);
  });

  it("KEEPS the deposit when the worker cancels within 24h of start", async () => {
    const booking = await paidBookingOnSlot(NEAR());
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await cancelBooking(booking.id, { by: "worker", reason: "Last-minute" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it("customer cancel always refunds, even within the window", async () => {
    const booking = await paidBookingOnSlot(NEAR());
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await cancelBooking(booking.id, { by: "customer", reason: "Change of plans" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).toHaveBeenCalledTimes(1);
  });

  it("cancel of a pending (unpaid) deposit doesn't refund anything", async () => {
    await acceptWithDeposit();
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const cancelled = await cancelBooking("bk-1001", { by: "worker" });
    expect(cancelled!.status).toBe("cancelled");
    expect(refundSpy).not.toHaveBeenCalled();
  });
});

describe("M3 server actions", () => {
  it("payBookingAction returns the checkout URL", async () => {
    await acceptWithDeposit();
    const res = await payBookingAction("bk-1001");
    expect(res.ok).toBe(true);
    expect(res.url).toContain("/api/payments/simulate");
  });

  it("payBookingAction errors for a non-pending booking", async () => {
    const res = await payBookingAction("bk-1001"); // REQUESTED
    expect(res).toEqual({ ok: false, error: "not-found" });
  });

  it("confirmPaymentAction confirms + revalidates", async () => {
    await acceptWithDeposit();
    const res = await confirmPaymentAction("bk-1001", "sim_pay-bk-1001");
    expect(res).toEqual({ ok: true });
    const booking = bookingOf(
      (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001") ?? {
        error: "not-found",
      }
    );
    expect(booking.status).toBe("confirmed");
  });
});

describe("M3 payment provider seam", () => {
  it("the registry returns the simulated provider when no Stripe keys are set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getPaymentProvider().method).toBe("SIMULATED");
  });

  it("simulated createCheckout → verifyWebhook round-trips with a valid signature", async () => {
    const result = await simulatedProvider.createCheckout({
      paymentId: "pay-x",
      bookingId: "bk-x",
      amountMinor: 5000,
      currency: "SAR",
      description: "BK-1001 — Fix sink",
      successUrl: "https://app.example.com/bookings",
      cancelUrl: "https://app.example.com/bookings",
    });
    expect(result.url).toContain("/api/payments/simulate");
    expect(result.providerRef).toBe("sim_pay-x");

    const parsed = new URL(result.url, "http://localhost");
    const verified = await simulatedProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({
        bookingId: parsed.searchParams.get("bookingId"),
        paymentId: parsed.searchParams.get("paymentId"),
        ref: parsed.searchParams.get("ref"),
        amount: Number(parsed.searchParams.get("amount")),
        sig: parsed.searchParams.get("sig"),
      })
    );
    expect(verified).toMatchObject({ bookingId: "bk-x", providerRef: "sim_pay-x", amountMinor: 5000 });
  });

  it("simulated verifyWebhook rejects a tampered signature", async () => {
    const verified = await simulatedProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({ bookingId: "bk-x", paymentId: "pay-x", ref: "sim_pay-x", amount: 5000, sig: "bad" })
    );
    expect(verified).toBeNull();
  });

  it("simulated refund returns a refund id", async () => {
    expect(await simulatedProvider.refund("sim_pay-x", 5000)).toBe("refund_sim_pay-x");
  });
});

describe("M3 webhook route", () => {
  it("confirms the booking from a valid simulated webhook body", async () => {
    await acceptWithDeposit();
    const checkout = await createBookingCheckout("bk-1001");
    const parsed = new URL(checkout!.url, "http://localhost");
    const { POST } = await import("../src/app/api/payments/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        body: JSON.stringify({
          bookingId: parsed.searchParams.get("bookingId"),
          paymentId: parsed.searchParams.get("paymentId"),
          ref: parsed.searchParams.get("ref"),
          amount: Number(parsed.searchParams.get("amount")),
          sig: parsed.searchParams.get("sig"),
        }),
      })
    );
    expect(res.status).toBe(200);
    const booking = bookingOf(
      (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001") ?? {
        error: "not-found",
      }
    );
    expect(booking.status).toBe("confirmed");
  });

  it("rejects an invalid signature", async () => {
    const { POST } = await import("../src/app/api/payments/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        body: JSON.stringify({ bookingId: "bk-1001", paymentId: "pay-x", ref: "x", amount: 1, sig: "nope" }),
      })
    );
    expect(res.status).toBe(400);
  });
});

/** Read the demo notification inbox (matches tests/bookings.test.ts). */
async function getCustomerNotifications(): Promise<{ type: string; href?: string }[]> {
  const { getNotificationsList } = await import("../src/lib/data/repo");
  return (await getNotificationsList()).filter((n) => n.href === "/bookings");
}
