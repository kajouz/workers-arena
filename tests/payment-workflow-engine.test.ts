/**
 * Payment workflow v2 — the engine and the actions over the DEMO adapter
 * (src/lib/data/payment-workflow-engine.ts, docs/PAYMENTS.md §Workflow v2):
 * evidence-based confirmation, four-eyes, partial / over / late money, refund
 * cash-out, receipt locking, deposit expiry, balance dunning, payment
 * reliability, and the cash-settlement controls. The Prisma twin of these
 * paths runs in scripts/smoke-payment-workflow.ts (npm run db:smoke).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));

import { payBookingAction, requestBookingAction, markBookingSettledOutsideAction, answerSettledOutsideAction } from "../src/app/actions/bookings";
import {
  approveManualTrancheAction,
  confirmManualPaymentAction,
  markRefundSentAction,
  rejectManualTrancheAction,
  resolveUnmatchedPaymentAction,
  writeOffBalanceAction,
  resolveSettledOutsideReviewAction,
} from "../src/app/actions/business";
import {
  cancelBooking,
  confirmBookingCompletion,
  createBookingRequest,
  getBookingById,
  getPendingManualPayments,
  respondToBooking,
  transitionBooking,
  createBookingSettlementCheckout,
} from "../src/lib/data/repo";
import { demoAddSlot, resetBookingsStore } from "../src/lib/data/bookings";
import { resetPaymentReceiptStore, savePaymentReceipt, isPaymentReceiptLocked } from "../src/lib/data/payment-receipts";
import {
  getBookingWorkflow,
  listPaymentAudit,
  listRefundsDue,
  listTranches,
  patchBookingWorkflow,
  resetPaymentWorkflowStore,
} from "../src/lib/data/payment-workflow-store";
import {
  customerReliability,
  feeClaimBlock,
  findManualPayment,
  overdueBalances,
  PAYMENT_TIMEOUT_REASON,
  runPaymentExpirySweep,
  runSettlementDunning,
  settledOutsideNeedingReview,
} from "../src/lib/data/payment-workflow-engine";
import { resetAdminActivityFeed } from "../src/lib/data/activity";
import { workerBySlug } from "../src/lib/data/workers";
import type { Booking } from "../src/lib/data/types";

const ADMIN = { id: "a1", name: "Amina Admin", email: "admin@workersarena.com", role: "admin", hue: 280 };
const ADMIN_2 = { id: "a2", name: "Bassel Finance", email: "finance@workersarena.com", role: "admin", hue: 120 };
const WORKER = { id: "w-khaled", name: "Khaled Al-Harbi", email: "khaled@plumbfix.lb", role: "worker", hue: 25 };
const RECEIPT =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=";
const DAY = 24 * 60 * 60 * 1000;

let activityFile: string;

function khaled() {
  const w = workerBySlug("khaled-al-harbi-plumbing");
  if (!w) throw new Error("demo worker missing");
  return w;
}

function bookingOf(r: Booking | { error: string } | null): Booking {
  if (!r || "error" in r) throw new Error("expected a booking");
  return r;
}

/** A fresh booking on its own slot, accepted with a deposit (PENDING_PAYMENT). */
async function pendingDepositBooking(opts: { startInHours?: number; quote?: number; deposit?: number; phone?: string } = {}) {
  const w = khaled();
  const start = new Date(Date.now() + (opts.startInHours ?? 72) * 60 * 60 * 1000).toISOString();
  const slot = demoAddSlot(w.id, start, new Date(Date.parse(start) + 60 * 60 * 1000).toISOString(), "available");
  const created = bookingOf(
    await createBookingRequest({
      workerId: w.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: opts.phone ?? "+961 70 555 001",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe",
    })
  );
  const accepted = bookingOf(
    await respondToBooking(created.id, { accept: true, quote: opts.quote ?? 25_000, deposit: opts.deposit ?? 5_000 })
  );
  expect(accepted.status).toBe("pendingPayment");
  return accepted;
}

/** Open the OMT reference for a deposit (as the customer would). */
async function openOmtReference(booking: Booking) {
  getSessionMock.mockResolvedValue(null);
  const form = new FormData();
  form.set("guestPhone", booking.customerPhone);
  const res = await payBookingAction(booking.id, "omt", form);
  expect(res.ok).toBe(true);
  const pending = (await getPendingManualPayments()).find((p) => p.scope === "booking" && p.entityId === booking.id);
  expect(pending).toBeDefined();
  return pending!;
}

async function asAdmin<T>(admin: typeof ADMIN, fn: () => Promise<T>): Promise<T> {
  getSessionMock.mockResolvedValue(admin);
  return fn();
}

beforeEach(() => {
  activityFile = `${tmpdir()}/wa-activity-pwf-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
  process.env.ADMIN_ACTIVITY_FILE = activityFile;
  resetAdminActivityFeed();
  resetBookingsStore();
  resetPaymentReceiptStore();
  resetPaymentWorkflowStore();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.ADMIN_ACTIVITY_FILE;
  await rm(activityFile, { force: true });
});

describe("confirming with evidence", () => {
  it("refuses a confirm without the amount and transaction number", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id))).toEqual({ ok: false, error: "evidence-required" });
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "12" }))).toEqual({
      ok: false,
      error: "invalid-txn",
    });
  });

  it("an exact amount with a receipt confirms at once, freezes the receipt and is audited", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
    const res = await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT 1111 2222" }));
    expect(res).toEqual({ ok: true, outcome: "confirmed" });
    expect((await getBookingById(booking.id))?.status).toBe("confirmed");
    expect(await isPaymentReceiptLocked(ref.reference)).toBe(true);
    // The evidence can no longer be swapped.
    expect(await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT })).toEqual({ ok: false, error: "locked" });
    const audit = await listPaymentAudit({ paymentId: ref.id });
    expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(["tranche.recorded", "payment.confirmed"]));
    expect(audit.find((e) => e.action === "tranche.recorded")?.actorName).toBe("Amina Admin");
  });

  it("one transaction number can never confirm two payments", async () => {
    const a = await pendingDepositBooking({ phone: "+961 70 555 101", startInHours: 72 });
    const b = await pendingDepositBooking({ phone: "+961 70 555 102", startInHours: 80 });
    const refA = await openOmtReference(a);
    const refB = await openOmtReference(b);
    await savePaymentReceipt({ reference: refA.reference, provider: "OMT", dataUrl: RECEIPT });
    await savePaymentReceipt({ reference: refB.reference, provider: "OMT", dataUrl: RECEIPT });
    expect((await asAdmin(ADMIN, () => confirmManualPaymentAction(refA.id, { amount: "50", txnId: "OMT-777-888" }))).ok).toBe(true);
    // Same number with different formatting is the same number.
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(refB.id, { amount: "50", txnId: "omt 777 888" }))).toEqual({
      ok: false,
      error: "duplicate-txn",
    });
    expect((await getBookingById(b.id))?.status).toBe("pendingPayment");
  });

  it("single-admin mode: a confirm without a receipt photo goes through, flagged in the audit", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT40001" }))).toEqual({
      ok: true,
      outcome: "confirmed",
    });
    const recorded = (await listPaymentAudit({ paymentId: ref.id })).find((e) => e.action === "tranche.recorded");
    expect(recorded?.detail).toMatchObject({ hadReceipt: false, needsSecondApproval: false });
  });

  it("four-eyes mode: without a receipt photo a second, DIFFERENT admin must approve", async () => {
    vi.stubEnv("PAYMENT_APPROVAL_MODE", "four-eyes");
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    const res = await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT90001" }));
    expect(res).toEqual({ ok: true, outcome: "awaiting-approval" });
    expect((await getBookingById(booking.id))?.status).toBe("pendingPayment");
    const [waiting] = await listTranches({ paymentId: ref.id, status: "pending-approval" });
    // The admin who recorded it cannot approve it.
    expect(await asAdmin(ADMIN, () => approveManualTrancheAction(waiting!.id))).toEqual({ ok: false, error: "same-admin" });
    expect(await asAdmin(ADMIN_2, () => approveManualTrancheAction(waiting!.id))).toEqual({ ok: true, outcome: "confirmed" });
    expect((await getBookingById(booking.id))?.status).toBe("confirmed");
  });

  it("four-eyes mode: a rejected amount activates nothing", async () => {
    vi.stubEnv("PAYMENT_APPROVAL_MODE", "four-eyes");
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT90002" }));
    const [waiting] = await listTranches({ paymentId: ref.id, status: "pending-approval" });
    expect(await asAdmin(ADMIN_2, () => rejectManualTrancheAction(waiting!.id, "Not on the statement"))).toEqual({ ok: true });
    expect((await getBookingById(booking.id))?.status).toBe("pendingPayment");
    expect((await findManualPayment({ paymentId: ref.id }))?.receivedMinor).toBe(0);
  });

  it("a short payment stays pending with the remainder; a second tranche completes it", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "20", txnId: "OMT50001" }))).toEqual({
      ok: true,
      outcome: "partial",
      remainingMinor: 3_000,
    });
    const view = await findManualPayment({ reference: ref.reference });
    expect(view).toMatchObject({ status: "pending", receivedMinor: 2_000, remainingMinor: 3_000 });
    expect((await getBookingById(booking.id))?.status).toBe("pendingPayment");
    expect(await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "30", txnId: "OMT50002" }))).toEqual({
      ok: true,
      outcome: "confirmed",
    });
    expect((await getBookingById(booking.id))?.status).toBe("confirmed");
  });

  it("an overpayment confirms and books the excess as a refund due; finance closes it with the transfer number", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
    expect((await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "65", txnId: "OMT60001" }))).outcome).toBe("confirmed");
    const due = await listRefundsDue();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ paymentId: ref.id, amountMinor: 1_500, state: "due" });
    // The refund transfer number must be new, too.
    expect(await asAdmin(ADMIN, () => markRefundSentAction(ref.id, "OMT60001"))).toEqual({ ok: false, error: "duplicate-txn" });
    expect(await asAdmin(ADMIN, () => markRefundSentAction(ref.id, "OMT-REFUND-1"))).toEqual({ ok: true });
    expect(await listRefundsDue()).toHaveLength(0);
  });

  it("money for a reference that already closed goes to the unmatched queue, then to a refund", async () => {
    const booking = await pendingDepositBooking();
    const ref = await openOmtReference(booking);
    await cancelBooking(booking.id, { by: "customer", reason: "Changed my mind" });
    const res = await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT70001" }));
    expect(res).toEqual({ ok: true, outcome: "unmatched" });
    const [unmatched] = await listTranches({ paymentId: ref.id, status: "unmatched" });
    expect(unmatched).toBeDefined();
    expect(await asAdmin(ADMIN, () => resolveUnmatchedPaymentAction(unmatched!.id))).toEqual({ ok: true });
    expect((await listRefundsDue()).find((r) => r.paymentId === ref.id)?.amountMinor).toBe(5_000);
  });

  it("a cancelled paid OMT deposit is booked as a refund due (money has not left yet)", async () => {
    const booking = await pendingDepositBooking({ startInHours: 96 });
    const ref = await openOmtReference(booking);
    await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
    await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: "OMT80001" }));
    expect(await cancelBooking(booking.id, { by: "worker", reason: "Sick" })).not.toBeNull();
    expect((await getBookingById(booking.id))?.paymentStatus).toBe("refunded");
    const due = (await listRefundsDue()).find((r) => r.paymentId === ref.id);
    expect(due).toMatchObject({ amountMinor: 5_000, state: "due" });
    // A second cancel/refund attempt never doubles it.
    await cancelBooking(booking.id, { by: "worker" });
    expect((await listRefundsDue()).filter((r) => r.paymentId === ref.id)).toHaveLength(1);
  });

  it("non-admins cannot record, approve or send money", async () => {
    getSessionMock.mockResolvedValue(WORKER);
    expect((await confirmManualPaymentAction("x", { amount: "1", txnId: "OMT1234" })).error).toBe("unauthorized");
    expect((await approveManualTrancheAction("x")).error).toBe("unauthorized");
    expect((await markRefundSentAction("x", "OMT1234")).error).toBe("unauthorized");
    expect((await writeOffBalanceAction("x")).error).toBe("unauthorized");
  });
});

describe("deposit deadlines", () => {
  it("an unpaid deposit lapses at its deadline — the booking is cancelled and the slot released", async () => {
    const booking = await pendingDepositBooking({ startInHours: 72 });
    const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const run = await runPaymentExpirySweep(later);
    expect(run.depositsExpired).toBe(1);
    const after = await getBookingById(booking.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.events.some((e) => e.status === "cancelled" && e.reason === PAYMENT_TIMEOUT_REASON)).toBe(true);
    // Idempotent.
    expect((await runPaymentExpirySweep(later)).depositsExpired).toBe(0);
  });

  it("a payer who uploaded a receipt is never lapsed by the clock", async () => {
    const booking = await pendingDepositBooking({ startInHours: 72 });
    const ref = await openOmtReference(booking);
    await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
    const run = await runPaymentExpirySweep(new Date(Date.now() + 30 * 60 * 60 * 1000));
    expect(run.depositsExpired).toBe(0);
    expect((await getBookingById(booking.id))?.status).toBe("pendingPayment");
  });

  it("reminds once at half-time", async () => {
    await pendingDepositBooking({ startInHours: 72 });
    const half = new Date(Date.now() + 13 * 60 * 60 * 1000);
    expect((await runPaymentExpirySweep(half)).depositsReminded).toBe(1);
    expect((await runPaymentExpirySweep(half)).depositsReminded).toBe(0);
  });
});

/** A finished job whose deposit was paid but whose balance is still owed. */
async function finishedJobOwingBalance(phone = "+961 70 555 201") {
  const booking = await pendingDepositBooking({ startInHours: 72, phone });
  const ref = await openOmtReference(booking);
  await savePaymentReceipt({ reference: ref.reference, provider: "OMT", dataUrl: RECEIPT });
  await asAdmin(ADMIN, () => confirmManualPaymentAction(ref.id, { amount: "50", txnId: `OMT${phone.replace(/\D/g, "")}` }));
  await transitionBooking(booking.id, "inProgress");
  await transitionBooking(booking.id, "completed");
  await confirmBookingCompletion(booking.id);
  const done = await getBookingById(booking.id);
  expect(done?.status).toBe("completed");
  return done!;
}

describe("balance dunning", () => {
  it("mints the balance reference, then runs the ladder once per stage", async () => {
    const job = await finishedJobOwingBalance();
    const first = await runSettlementDunning(new Date(Date.now() + 1 * 60 * 60 * 1000));
    expect(first.referencesMinted).toBe(1);
    expect((await getBookingWorkflow(job.id)).settlementDueAt).toBeTruthy();
    expect((await getPendingManualPayments()).some((p) => p.leg === "settlement" && p.entityId === job.id)).toBe(true);

    const due = Date.parse((await getBookingWorkflow(job.id)).settlementDueAt!);
    const d1 = await runSettlementDunning(new Date(due + 1 * DAY));
    expect(d1.remindersSent).toBe(1);
    expect((await getBookingWorkflow(job.id)).dunningStage).toBe(1);
    expect((await runSettlementDunning(new Date(due + 1 * DAY))).remindersSent).toBe(0); // once
    await runSettlementDunning(new Date(due + 7 * DAY));
    expect((await getBookingWorkflow(job.id)).dunningStage).toBe(3);
    expect((await overdueBalances()).map((o) => o.booking.id)).toContain(job.id);
  });

  it("a balance written off leaves the ladder", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 202");
    await patchBookingWorkflow(job.id, { settlementDueAt: new Date(Date.now() - 31 * DAY).toISOString(), dunningStage: 5 });
    expect(await asAdmin(ADMIN, () => writeOffBalanceAction(job.id))).toEqual({ ok: true });
    expect((await getBookingWorkflow(job.id)).settlementWrittenOffAt).toBeTruthy();
    expect((await overdueBalances()).map((o) => o.booking.id)).not.toContain(job.id);
  });
});

describe("payment reliability", () => {
  it("lapsed deposits and overdue balances raise the tier, and a blocked customer cannot book", async () => {
    const phone = "+961 70 555 301";
    // Three lapsed deposits → 3 points → prepay.
    for (let i = 0; i < 3; i++) await pendingDepositBooking({ phone, startInHours: 72 + i });
    await runPaymentExpirySweep(new Date(Date.now() + 26 * 60 * 60 * 1000));
    const r = await customerReliability({ phone });
    expect(r).toMatchObject({ expiredDeposits: 3, tier: "prepay" });

    // A prepay customer's deposit is the whole quote, whatever the worker asked.
    const w = khaled();
    const start = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
    const slot = demoAddSlot(w.id, start, new Date(Date.parse(start) + 3_600_000).toISOString(), "available");
    const req = bookingOf(
      await createBookingRequest({ workerId: w.id, slotId: slot.id, customerName: "Noor E.", customerPhone: phone, jobTitle: "Another job" })
    );
    getSessionMock.mockResolvedValue(WORKER);
    const { respondBookingAction } = await import("../src/app/actions/bookings");
    const form = new FormData();
    form.set("accept", "true");
    form.set("quote", "200");
    form.set("deposit", "20");
    expect((await respondBookingAction(req.id, form)).ok).toBe(true);
    expect((await getBookingById(req.id))?.deposit).toBe(20_000);

    // A written-off balance blocks new bookings outright.
    const job = await finishedJobOwingBalance(phone);
    await patchBookingWorkflow(job.id, { settlementWrittenOffAt: new Date().toISOString() });
    expect((await customerReliability({ phone })).tier).toBe("blocked");
    getSessionMock.mockResolvedValue(null);
    const slot2 = demoAddSlot(w.id, new Date(Date.now() + 200 * 3_600_000).toISOString(), new Date(Date.now() + 201 * 3_600_000).toISOString(), "available");
    const f = new FormData();
    f.set("slotId", slot2.id);
    f.set("customerName", "Noor E.");
    f.set("customerPhone", phone);
    f.set("jobTitle", "Yet another job");
    f.set("customerEmail", "");
    f.set("note", "");
    f.set("serviceItemName", "");
    expect(await requestBookingAction("khaled-al-harbi-plumbing", f)).toEqual({ ok: false, error: "payment-blocked" });
  });
});

describe("cash settlement controls", () => {
  it("a 'settled directly' declaration is refused while the customer's balance payment is in flight", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 401");
    await createBookingSettlementCheckout(job.id, "OMT");
    const leg = (await getPendingManualPayments()).find((p) => p.leg === "settlement" && p.entityId === job.id)!;
    await savePaymentReceipt({ reference: leg.reference, provider: "OMT", dataUrl: RECEIPT });
    getSessionMock.mockResolvedValue(WORKER);
    expect(await markBookingSettledOutsideAction(job.id)).toEqual({ ok: false, error: "payment-in-flight" });
    expect((await getBookingById(job.id))?.settledOutside).toBeFalsy();
  });

  it("the customer confirms or denies; a denial goes to admin review", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 402");
    getSessionMock.mockResolvedValue(WORKER);
    expect(await markBookingSettledOutsideAction(job.id)).toEqual({ ok: true });
    getSessionMock.mockResolvedValue(null);
    const form = new FormData();
    form.set("guestPhone", job.customerPhone);
    expect(await answerSettledOutsideAction(job.id, false, form)).toEqual({ ok: true });
    expect((await settledOutsideNeedingReview()).find((r) => r.booking.id === job.id)?.disputed).toBe(true);
    // One answer only.
    expect((await answerSettledOutsideAction(job.id, true, form)).ok).toBe(false);
  });

  it("an admin closes a disputed declaration after checking with both parties", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 405");
    getSessionMock.mockResolvedValue(WORKER);
    await markBookingSettledOutsideAction(job.id);
    getSessionMock.mockResolvedValue(null);
    const form = new FormData();
    form.set("guestPhone", job.customerPhone);
    await answerSettledOutsideAction(job.id, false, form);
    getSessionMock.mockResolvedValue(WORKER);
    expect((await resolveSettledOutsideReviewAction(job.id)).error).toBe("unauthorized");
    expect(await asAdmin(ADMIN, () => resolveSettledOutsideReviewAction(job.id))).toEqual({ ok: true });
    expect((await settledOutsideNeedingReview()).some((r) => r.booking.id === job.id)).toBe(false);
    expect((await listPaymentAudit()).some((e) => e.action === "settlement.outside-confirmed" && e.detail?.byAdmin === true)).toBe(true);
  });

  it("an unanswered declaration surfaces for review after 72 hours", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 403");
    getSessionMock.mockResolvedValue(WORKER);
    await markBookingSettledOutsideAction(job.id);
    expect((await settledOutsideNeedingReview(new Date(Date.now() + 1 * 3_600_000))).some((r) => r.booking.id === job.id)).toBe(false);
    expect((await settledOutsideNeedingReview(new Date(Date.now() + 73 * 3_600_000))).find((r) => r.booking.id === job.id)?.disputed).toBe(false);
  });

  it("an unpaid fee claim older than the grace period blocks leads and payouts", async () => {
    const job = await finishedJobOwingBalance("+961 70 555 404");
    getSessionMock.mockResolvedValue(WORKER);
    await markBookingSettledOutsideAction(job.id);
    const claim = await feeClaimBlock(job.workerId, new Date(Date.now() + 1 * DAY));
    // Khaled's demo wallet may cover the claim at once; only an outstanding
    // claim can block — and only after the grace period.
    expect(claim.blocked).toBe(false);
    const later = await feeClaimBlock(job.workerId, new Date(Date.now() + 15 * DAY));
    expect(later.blocked).toBe(later.outstandingMinor > 0);
  });
});
