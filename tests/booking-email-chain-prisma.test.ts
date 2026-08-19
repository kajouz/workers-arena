import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPayload } from "../src/lib/notifications/types";

/**
 * Prisma mirror of tests/booking-email-chain.test.ts: LIVE-DB booking →
 * prisma adapter → pushNotification → dispatch → renderBookingEmail. The
 * outbound seam is mocked so the fire-and-forget dispatch exposes the
 * ChannelPayload, then we assert the bookingConfirmed payload's booking
 * context matches the booking (number, slot, quote) — the SAME shape the demo
 * chain test asserts, proving both adapters dispatch an identical contract.
 *
 * The repo seam's realDataEnabled is a module-load snapshot, so (like the demo
 * chain test importing demo adapters directly) we import the prisma adapters
 * directly. The whole describe is gated on a live DATABASE_URL — the
 * fixture-only host skips it; run it explicitly against the local Postgres:
 *   DATABASE_URL=postgresql://… DEMO_MODE=false npx vitest run tests/booking-email-chain-prisma.test.ts
 */
const { dispatched } = vi.hoisted(() => ({ dispatched: [] as ChannelPayload[] }));

vi.mock("../src/lib/notifications/dispatcher", () => ({
  // Synchronous capture: the mock body runs during the dispatch() call.
  dispatch: (payload: ChannelPayload) => {
    dispatched.push(payload);
    return Promise.resolve([]);
  },
  getEnabledChannels: () => [],
  resetChannels: () => {},
}));

import {
  prismaCancelBooking,
  prismaConfirmBookingPayment,
  prismaCreateBookingCheckout,
  prismaCreateBookingRequest,
  prismaRespondToBooking,
} from "../src/lib/data/prisma-repo";
import { getPrisma } from "../src/lib/server/prisma";
import { renderBookingEmail } from "../src/lib/notifications/templates";

// Live-DB gate — the prisma path needs a reachable Postgres (mirrors the
// smoke's real-mode requirement). Skipped in the fixture-only test host.
const hasLiveDb = Boolean(process.env.DATABASE_URL);
const describeLive = hasLiveDb ? describe : describe.skip;

// The prisma inbox adapter requires demo mode OFF (runtime reads env per call).
process.env.DEMO_MODE = "false";
// The shared setup default (tests/setup-jsdom.ts) redirects the activity feed
// to a temp file — the prisma activity adapter needs it UNSET to select
// prisma mode, so clear it here (activityAdapterMode treats a truthy value as
// file mode even in real mode).
delete process.env.ADMIN_ACTIVITY_FILE;

const TEST_EMAIL = "chain-prisma@test.sa";
const TEST_AR_EMAIL = "chain-prisma-ar@test.sa";

let slotId: string | null = null;
let bookingId: string | null = null;

beforeEach(() => {
  dispatched.length = 0;
});

afterEach(async () => {
  if (!hasLiveDb) return;
  const prisma = getPrisma();
  if (bookingId) {
    await prisma.bookingEvent.deleteMany({ where: { bookingId } }).catch(() => {});
    // M3 deposit bookings mint a Payment row linked via metadata.bookingId
    // (no FK — booking delete can't cascade it; same cleanup as the smoke).
    await prisma.payment
      .deleteMany({ where: { metadata: { path: ["bookingId"], equals: bookingId } } })
      .catch(() => {});
    bookingId = null;
  }
  await prisma.booking
    .deleteMany({ where: { customerEmail: { in: [TEST_EMAIL, TEST_AR_EMAIL] } } })
    .catch(() => {});
  if (slotId) {
    await prisma.bookingSlot.deleteMany({ where: { id: slotId } }).catch(() => {});
    slotId = null;
  }
  // The seed creates no Notification rows — wiping the types we emit restores
  // it exactly (the smoke uses the same type-keyed cleanup). BOOKING_PAID
  // covers the deposit-confirm's customer-paid notification.
  await prisma.notification.deleteMany({
    where: {
      type: { in: ["BOOKING_REQUEST", "BOOKING_CONFIRMED", "BOOKING_CANCELLED", "BOOKING_PAID", "BOOKING_REFUND"] },
    },
  }).catch(() => {});
});

describeLive("prisma booking email chain (live DB → prisma adapter → dispatcher → renderer)", () => {
  it("prismaRespondToBooking dispatches a bookingConfirmed payload that renderBookingEmail renders", async () => {
    const prisma = getPrisma();
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) throw new Error("demo worker missing");

    // Fresh AVAILABLE slot, clear of the seeded 09:00/10:00/14:00 rows.
    const startAt = new Date(Date.now() + 40 * 60 * 60 * 1000);
    const slot = await prisma.bookingSlot.create({
      data: { workerId: worker.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), status: "AVAILABLE" },
    });
    slotId = slot.id;

    const created = await prismaCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Chain Prisma Tester",
      customerPhone: "+966 50 111 2222",
      customerEmail: TEST_EMAIL,
      jobTitle: "Chain test plumbing job",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    bookingId = created.id;

    const booking = await prismaRespondToBooking(created.id, { accept: true, quote: 8000 });
    expect(booking).not.toBeNull();
    expect(booking!.status).toBe("confirmed");

    // The request notification went to the worker, the confirmation to the
    // customer — identical to the demo chain test's expectations.
    const requestPayload = dispatched.find((p) => p.type === "bookingRequest");
    expect(requestPayload).toBeDefined();
    expect(requestPayload!.href).toBe("/dashboard");
    expect(requestPayload!.booking?.number).toBe(created.number);

    const emailPayload = dispatched.find((p) => p.type === "bookingConfirmed");
    expect(emailPayload).toBeDefined();
    expect(emailPayload!.href).toBe("/bookings");
    expect(emailPayload!.recipient?.email).toBe(TEST_EMAIL);

    // ChannelPayload.booking matches the booking: number, slot times, quote,
    // and the M5 fee snapshot (khaled is premium in the seed → 7% of 8000
    // minor = 560) — identical shape to the demo chain test.
    expect(emailPayload!.booking).toMatchObject({
      number: created.number,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      quote: 8000, // minor units, as-is
      currency: "SAR",
      jobTitle: "Chain test plumbing job",
      platformFee: 560,
    });

    // And the confirmation email renders that same booking — including the
    // platform-fee line, so the real-mode receipt matches the booking row.
    const email = renderBookingEmail(emailPayload!, "en");
    expect(email.subject).toContain(created.number);
    expect(email.html).toContain("Booking details");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain("Platform fee");
    expect(email.html).toContain("SAR 6"); // 560 minor → 5.6, display-rounded
    expect(email.text).toContain("Platform fee: SAR 6");
    expect(email.html).toContain(`/admin/bookings/${created.number}`);
  });

  it("prismaRespondToBooking dispatches the customer email in the customer's User.locale (not always EN)", async () => {
    const prisma = getPrisma();
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) throw new Error("demo worker missing");

    // A signed-in customer who prefers Arabic — the exact row the
    // Booking.customer relation resolves at dispatch (User.locale).
    const arEmail = TEST_AR_EMAIL;
    const user = await prisma.user.create({
      data: {
        name: "Chain AR Customer",
        email: arEmail,
        passwordHash: "x",
        role: "CUSTOMER",
        locale: "ar",
      },
    });

    const startAt = new Date(Date.now() + 44 * 60 * 60 * 1000);
    const slot = await prisma.bookingSlot.create({
      data: { workerId: worker.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), status: "AVAILABLE" },
    });
    slotId = slot.id;

    const created = await prismaCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerId: user.id,
      customerName: "Chain AR Customer",
      customerPhone: "+966 50 222 3333",
      customerEmail: arEmail,
      jobTitle: "Chain test plumbing job",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    bookingId = created.id;

    await prismaRespondToBooking(created.id, { accept: true, quote: 8000 });

    const emailPayload = dispatched.find((p) => p.type === "bookingConfirmed");
    expect(emailPayload).toBeDefined();
    // The recipient rides the customer's stored language — the same rule the
    // campaign adapter uses, never a hardcoded "en".
    expect(emailPayload!.recipient?.locale).toBe("ar");
    // The AR email renders Arabic copy through the same renderer.
    const email = renderBookingEmail(emailPayload!, "ar");
    expect(email.subject).toContain("تأكيد الحجز");
    expect(email.html).toContain("تفاصيل الحجز");
    expect(email.html).not.toContain("Booking details");

    await prisma.user.deleteMany({ where: { email: arEmail } }).catch(() => {});
  });

  it("a customer cancel dispatches a bookingCancelled payload (to the worker) that renderBookingEmail renders", async () => {
    const prisma = getPrisma();
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) throw new Error("demo worker missing");

    // Fresh AVAILABLE slot, clear of the seeded 09:00/10:00/14:00 rows.
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const slot = await prisma.bookingSlot.create({
      data: { workerId: worker.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), status: "AVAILABLE" },
    });
    slotId = slot.id;

    const created = await prismaCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Chain Prisma Tester",
      customerPhone: "+966 50 111 2222",
      customerEmail: TEST_EMAIL,
      jobTitle: "Chain test cancel booking",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    bookingId = created.id;

    await prismaRespondToBooking(created.id, { accept: true, quote: 8000 });

    const cancelled = await prismaCancelBooking(created.id, { by: "customer", reason: "Changed my mind" });
    expect(cancelled?.status).toBe("cancelled");
    // Rule 3 — cancellation frees the slot back to AVAILABLE.
    const slotAfter = await prisma.bookingSlot.findUnique({ where: { id: slot.id } });
    expect(slotAfter?.status).toBe("AVAILABLE");

    // Customer cancel notifies the WORKER — bookingCancelled → /dashboard,
    // addressed to the seeded worker's email (mirrors the demo test).
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/dashboard");
    expect(cancelPayload!.recipient?.email).toBe("khaled@plumbfix.sa");

    // Same payload shape as the confirm test — the ORIGINAL slot survives cancel.
    expect(cancelPayload!.booking).toMatchObject({
      number: created.number,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      quote: 8000, // minor units, as-is
      currency: "SAR",
      jobTitle: "Chain test cancel booking",
    });

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(created.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${created.number}`);
  });

  it("a worker cancel refunds the paid deposit and dispatches a customer-addressed bookingCancelled payload that renderBookingEmail renders", async () => {
    const prisma = getPrisma();
    // Pin the provider to simulated for the WHOLE flow (checkout + refund) — a
    // dev shell with STRIPE_SECRET_KEY set would otherwise mint a real checkout
    // and make the refund assertion non-deterministic.
    delete process.env.STRIPE_SECRET_KEY;
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) throw new Error("demo worker missing");

    // Fresh AVAILABLE slot, 72h out — outside the 24h refund window, so the
    // worker-cancel branch exercises the M4 refund path.
    const startAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const slot = await prisma.bookingSlot.create({
      data: { workerId: worker.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), status: "AVAILABLE" },
    });
    slotId = slot.id;

    const created = await prismaCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Chain Prisma Tester",
      customerPhone: "+966 50 111 2222",
      customerEmail: TEST_EMAIL,
      jobTitle: "Chain test deposit booking",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    bookingId = created.id;

    // M3 deposit path: accept-with-deposit → PENDING_PAYMENT → checkout (mints
    // providerRef) → webhook confirm → PAID/CONFIRMED.
    const pending = await prismaRespondToBooking(created.id, { accept: true, quote: 8000, deposit: 3000 });
    expect(pending?.status).toBe("pendingPayment");
    const checkout = await prismaCreateBookingCheckout(created.id);
    expect(checkout).not.toBeNull();
    const payRow = await prisma.booking.findUnique({ where: { id: created.id }, include: { payment: true } });
    const paid = await prismaConfirmBookingPayment(created.id, payRow!.payment!.providerRef!);
    expect(paid?.status).toBe("confirmed");

    // Worker cancels > 24h before start → the paid deposit is refunded.
    const cancelled = await prismaCancelBooking(created.id, { by: "worker", reason: "Machine broke" });
    expect(cancelled?.status).toBe("cancelled");
    const payAfter = await prisma.booking.findUnique({ where: { id: created.id }, include: { payment: true } });
    expect(payAfter?.payment?.status).toBe("REFUNDED"); // refund-window path exercised
    expect(payAfter?.payment?.refundedAt).not.toBeNull();
    const slotAfter = await prisma.bookingSlot.findUnique({ where: { id: slot.id } });
    expect(slotAfter?.status).toBe("AVAILABLE"); // rule 3 — slot freed

    // The worker's cancel notifies the CUSTOMER — bookingCancelled → /bookings,
    // addressed to the booking's email (mirrors the demo test).
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/bookings");
    expect(cancelPayload!.recipient?.email).toBe(TEST_EMAIL);

    // Same payload shape as the other branches — the ORIGINAL slot survives cancel.
    expect(cancelPayload!.booking).toMatchObject({
      number: created.number,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      quote: 8000, // minor units, as-is
      currency: "SAR",
      jobTitle: "Chain test deposit booking",
    });

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(created.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${created.number}`);

    // The refund also dispatches a bookingRefund email to the customer with
    // the refunded amount + reason (M4 refund notification).
    const refundPayload = dispatched.find((p) => p.type === "bookingRefund");
    expect(refundPayload).toBeDefined();
    expect(refundPayload!.href).toBe("/bookings");
    expect(refundPayload!.recipient?.email).toBe(TEST_EMAIL);
    expect(refundPayload!.booking?.refund).toMatchObject({ amount: 3000, reason: "Machine broke" });

    const refundEmail = renderBookingEmail(refundPayload!, "en");
    expect(refundEmail.subject).toContain(created.number);
    expect(refundEmail.html).toContain("Deposit refunded");
    expect(refundEmail.html).toContain("SAR 30"); // refund 3000 minor → 30 major
    expect(refundEmail.html).toContain("Machine broke"); // reason row in the card
    expect(refundEmail.html).toContain(`/admin/bookings/${created.number}`);
  });

  it("a worker cancel within 24h KEEPS the paid deposit but still dispatches the customer-addressed bookingCancelled payload", async () => {
    const prisma = getPrisma();
    // Pin the provider to simulated (the checkout mints a session; the keep
    // branch never calls refund, but determinism is the point).
    delete process.env.STRIPE_SECRET_KEY;
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) throw new Error("demo worker missing");

    // Fresh AVAILABLE slot, 2h out — INSIDE the 24h cancellation-policy
    // window, so the worker-cancel branch exercises the KEEP path (the payment
    // stays PAID, no refund markers). The seeded 09:00/10:00/14:00 demo slots
    // (AVAILABLE/RESERVED/BLOCKED) make a FIXED offset collide depending on the
    // wall clock — the overlap guard rejects a request whose window crosses a
    // RESERVED/BOOKED/BLOCKED slot, so a "+2h" slot fails whenever the suite
    // runs between ~07:00 and ~13:00 local. Scan forward to the first hour
    // clear of the worker's claimed slots (bounded at +22h, so the KEEP-branch
    // semantics stay inside the 24h window no matter when the suite runs).
    const claimed = await prisma.bookingSlot.findMany({
      where: { workerId: worker.id, status: { in: ["RESERVED", "BOOKED", "BLOCKED"] } },
      select: { startAt: true, endAt: true },
    });
    let startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    scan: for (let i = 0; i < 20; i++) {
      const end = new Date(startAt.getTime() + 60 * 60 * 1000);
      for (const c of claimed) {
        if (c.startAt.getTime() < end.getTime() && startAt.getTime() < c.endAt.getTime()) {
          startAt = new Date(startAt.getTime() + 60 * 60 * 1000);
          continue scan;
        }
      }
      break;
    }
    const slot = await prisma.bookingSlot.create({
      data: { workerId: worker.id, startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000), status: "AVAILABLE" },
    });
    slotId = slot.id;

    const created = await prismaCreateBookingRequest({
      workerId: worker.id,
      slotId: slot.id,
      customerName: "Chain Prisma Tester",
      customerPhone: "+966 50 111 2222",
      customerEmail: TEST_EMAIL,
      jobTitle: "Chain test kept deposit",
    });
    if ("error" in created) throw new Error(`create failed: ${created.error}`);
    bookingId = created.id;

    // M3 deposit path to a PAID/CONFIRMED booking.
    await prismaRespondToBooking(created.id, { accept: true, quote: 8000, deposit: 3000 });
    const checkout = await prismaCreateBookingCheckout(created.id);
    expect(checkout).not.toBeNull();
    const payRow = await prisma.booking.findUnique({ where: { id: created.id }, include: { payment: true } });
    const paid = await prismaConfirmBookingPayment(created.id, payRow!.payment!.providerRef!);
    expect(paid?.status).toBe("confirmed");

    // Worker cancels within the window → the deposit is KEPT (payment stays
    // PAID, no refundRef/refundedAt) but the slot still frees (rule 3).
    const cancelled = await prismaCancelBooking(created.id, { by: "worker", reason: "Client changed scope" });
    expect(cancelled?.status).toBe("cancelled");
    const payAfter = await prisma.booking.findUnique({ where: { id: created.id }, include: { payment: true } });
    expect(payAfter?.payment?.status).toBe("PAID"); // keep-branch: no refund
    expect(payAfter?.payment?.refundRef).toBeNull();
    expect(payAfter?.payment?.refundedAt).toBeNull();
    const slotAfter = await prisma.bookingSlot.findUnique({ where: { id: slot.id } });
    expect(slotAfter?.status).toBe("AVAILABLE");

    // The cancellation STILL notifies the customer with the booking context.
    const cancelPayload = dispatched.find((p) => p.type === "bookingCancelled");
    expect(cancelPayload).toBeDefined();
    expect(cancelPayload!.href).toBe("/bookings");
    expect(cancelPayload!.recipient?.email).toBe(TEST_EMAIL);
    expect(cancelPayload!.booking).toMatchObject({
      number: created.number,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      quote: 8000, // minor units, as-is
      currency: "SAR",
      jobTitle: "Chain test kept deposit",
    });

    // No refund notification fired.
    expect(dispatched.find((p) => p.type === "bookingRefund")).toBeUndefined();

    // And the cancellation email renders that same booking.
    const email = renderBookingEmail(cancelPayload!, "en");
    expect(email.subject).toContain(created.number);
    expect(email.html).toContain("Booking cancelled");
    expect(email.html).toContain("SAR 80"); // quote 8000 minor → 80 major
    expect(email.html).toContain(`/admin/bookings/${created.number}`);
  });
});
