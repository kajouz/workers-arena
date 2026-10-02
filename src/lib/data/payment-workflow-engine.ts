/**
 * Payment workflow v2 — the engine (docs/PAYMENTS.md §Workflow v2).
 *
 * Orchestrates the pure rules (payment-workflow.ts) over the data seams in
 * repo.ts and the workflow store. Both adapters (demo and Prisma) run the same
 * code: every read and write here goes through a seam.
 *
 *  - recordManualPayment / approveTranche / rejectTranche — finance records the
 *    amount actually received with its OMT/Whish transaction number; the
 *    payment activates only when approved money covers it (maker–checker
 *    above the threshold or without a receipt; short and over payments have
 *    defined outcomes; a payment that is no longer pending lands in the
 *    unmatched queue instead of being lost).
 *  - sendRefund / resolveUnmatched — refunds are "due" until finance records
 *    the transfer that returned the money.
 *  - runPaymentExpirySweep — unpaid deposits release the slot at their
 *    deadline; unpaid upgrades lapse; the payer is reminded at half-time.
 *  - runSettlementDunning — the balance reference is minted automatically when
 *    a job completes unpaid, then the D+1/3/7/14/30 ladder runs.
 *  - customerReliability — the payment-reliability score that decides how
 *    much deposit a customer must pay, or whether they may book at all.
 *  - declareSettledOutside / answerSettledOutside / feeClaimBlock — the cash
 *    settlement controls.
 */
import {
  cancelBooking,
  cancelPendingPurchase,
  confirmBookingPayment,
  confirmBookingSettlement,
  confirmCampaignPayment,
  confirmPurchase,
  createBookingSettlementCheckout,
  getAllBookings,
  getBookingById,
  getBookingSettlement,
  getBookingSettlementPayment,
  getCustomerBookings,
  getManualPaymentReconciliation,
  getPendingManualPayments,
  getWorkerBookings,
  markBookingSettledOutside,
} from "./repo";
import { ACTION_CODES, logAdminActivity } from "./activity";
import { lockPaymentReceipt, receiptUploadTimes } from "./payment-receipts";
import { settlementNeedsCollection } from "./booking-settlement";
import {
  allocate,
  canApprove,
  depositDeadline,
  feeClaimBlocks,
  needsSecondApproval,
  nextDunningStage,
  normalizeTxnId,
  paymentWorkflowConfig,
  purchaseDeadline,
  reliabilityScore,
  reminderDue,
  shouldExpire,
  type ReliabilityTier,
} from "./payment-workflow";
import {
  createTranche,
  decideTranche,
  getBookingWorkflow,
  getBookingWorkflows,
  getPaymentRefund,
  getTranche,
  listPaymentAudit,
  listTranches,
  markRefundDue,
  markRefundSent,
  patchBookingWorkflow,
  receivedFrom,
  recordPaymentAudit,
  resolveUnmatchedTranche,
  type PaymentTranche,
} from "./payment-workflow-store";
import { PURCHASE_SCOPES, type Booking, type PendingManualPayment } from "./types";

/** Lazy — the notifications module wires the WhatsApp ledger at import time,
 * and the action modules that import this engine must not pay for (or, in
 * tests that mock the dispatcher, trip over) that side effect. */
async function pushNotification(...args: Parameters<typeof import("./notifications").pushNotification>) {
  return (await import("./notifications")).pushNotification(...args);
}

/** The cancel reason stamped on a deposit that lapsed — the reliability score
 * counts these. */
export const PAYMENT_TIMEOUT_REASON = "Deposit not paid in time";

const HOUR = 60 * 60 * 1000;

export interface Actor {
  id?: string;
  name?: string;
}

/* ──────────────────────────── Payment lookup ──────────────────────────── */

export type ManualPaymentStatus = "pending" | "paid" | "cancelled" | "refunded" | "failed";

export interface ManualPaymentView {
  paymentId: string;
  reference: string;
  status: ManualPaymentStatus;
  scope: PendingManualPayment["scope"];
  leg?: "deposit" | "settlement";
  entityId: string;
  labelEn: string;
  labelAr: string;
  method: "omt" | "whish";
  amountMinor: number;
  currency: string;
  createdAt: string;
  /** Σ approved tranches. */
  receivedMinor: number;
  /** Σ tranches waiting for a second approver. */
  awaitingApprovalMinor: number;
  /** What the payer still has to send (0 once covered). */
  remainingMinor: number;
  /** When an unpaid reference lapses (deposits and upgrades only). */
  deadline?: string;
}

function isPurchaseScope(scope: string): boolean {
  return (PURCHASE_SCOPES as readonly string[]).includes(scope);
}

/** Find a manual (OMT/Whish) payment by id or reference, in any state. */
export async function findManualPayment(by: { paymentId?: string; reference?: string }): Promise<ManualPaymentView | null> {
  if (!by.paymentId && !by.reference) return null;
  const match = (p: { id: string; reference: string }) =>
    (by.paymentId ? p.id === by.paymentId : true) && (by.reference ? p.reference === by.reference : true);
  const pending = (await getPendingManualPayments()).find(match);
  let base: Omit<ManualPaymentView, "receivedMinor" | "awaitingApprovalMinor" | "remainingMinor" | "deadline"> | null = null;
  if (pending) {
    base = {
      paymentId: pending.id,
      reference: pending.reference,
      status: "pending",
      scope: pending.scope,
      ...(pending.leg ? { leg: pending.leg } : {}),
      entityId: pending.entityId,
      labelEn: pending.labelEn,
      labelAr: pending.labelAr,
      method: pending.method,
      amountMinor: pending.amount,
      currency: pending.currency,
      createdAt: pending.createdAt,
    };
  } else {
    const rec = (await getManualPaymentReconciliation()).find(match);
    if (!rec) return null;
    base = {
      paymentId: rec.id,
      reference: rec.reference,
      status: rec.status,
      scope: rec.scope,
      entityId: rec.entityId,
      labelEn: rec.labelEn,
      labelAr: rec.labelAr,
      method: rec.method,
      amountMinor: rec.amount,
      currency: rec.currency,
      createdAt: rec.createdAt,
    };
  }
  const tranches = await listTranches({ paymentId: base.paymentId });
  const received = receivedFrom(tranches);
  const awaiting = tranches.filter((t) => t.status === "pending-approval").reduce((s, t) => s + t.amountMinor, 0);
  let deadline: string | undefined;
  if (base.status === "pending") {
    if (base.scope === "booking" && base.leg !== "settlement") {
      const booking = await getBookingById(base.entityId);
      deadline = depositDeadline({ requestedAt: base.createdAt, startAt: booking?.startAt ?? null }).toISOString();
    } else if (isPurchaseScope(base.scope)) {
      deadline = purchaseDeadline(base.createdAt).toISOString();
    }
  }
  return {
    ...base,
    receivedMinor: received,
    awaitingApprovalMinor: awaiting,
    remainingMinor: Math.max(0, base.amountMinor - received),
    ...(deadline ? { deadline } : {}),
  };
}

/** Attach received / awaiting-approval totals to the admin queue rows. */
export async function withPaymentProgress<T extends { id: string; receivedMinor?: number; awaitingApprovalMinor?: number }>(
  payments: T[]
): Promise<T[]> {
  if (payments.length === 0) return payments;
  const tranches = await listTranches({ paymentIds: payments.map((p) => p.id) });
  return payments.map((p) => {
    const mine = tranches.filter((t) => t.paymentId === p.id);
    const received = receivedFrom(mine);
    const awaiting = mine.filter((t) => t.status === "pending-approval").reduce((s, t) => s + t.amountMinor, 0);
    return received > 0 || awaiting > 0 ? { ...p, receivedMinor: received, awaitingApprovalMinor: awaiting } : p;
  });
}

/* ─────────────────────── Recording money received ─────────────────────── */

export type RecordOutcome =
  | { ok: true; outcome: "confirmed"; excessMinor: number }
  | { ok: true; outcome: "partial"; remainingMinor: number }
  | { ok: true; outcome: "awaiting-approval"; trancheId: string }
  | { ok: true; outcome: "unmatched"; trancheId: string }
  | {
      ok: false;
      error: "invalid-txn" | "invalid-amount" | "not-found" | "duplicate-txn" | "same-admin" | "confirm-failed";
    };

/**
 * Finance records an amount received against a manual payment. The OMT/Whish
 * transaction number is mandatory and unique across all payments and refunds.
 */
export async function recordManualPayment(input: {
  paymentId: string;
  amountMinor: number;
  txnId: string;
  note?: string;
  actor: Actor;
}): Promise<RecordOutcome> {
  const txn = normalizeTxnId(input.txnId);
  if (!txn) return { ok: false, error: "invalid-txn" };
  const amount = Math.trunc(Number(input.amountMinor));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid-amount" };
  const view = await findManualPayment({ paymentId: input.paymentId });
  if (!view) return { ok: false, error: "not-found" };

  // Late or orphan money — the reference expired, was cancelled, or is already
  // paid. Never lost: it waits in the unmatched queue for a refund decision.
  if (view.status !== "pending") {
    const created = await createTranche({
      paymentId: view.paymentId,
      reference: view.reference,
      amountMinor: amount,
      externalTxnId: txn,
      status: "unmatched",
      hadReceipt: false,
      ...(input.actor.id ? { enteredById: input.actor.id } : {}),
      ...(input.actor.name ? { enteredBy: input.actor.name } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    if (!created.ok) return created;
    await recordPaymentAudit({
      paymentId: view.paymentId,
      reference: view.reference,
      action: "tranche.unmatched",
      actorId: input.actor.id,
      actorName: input.actor.name,
      amountMinor: amount,
      detail: { txn, paymentStatus: view.status },
    });
    return { ok: true, outcome: "unmatched", trancheId: created.tranche.id };
  }

  const hasReceipt = (await receiptUploadTimes([view.reference])).has(view.reference);
  const second = needsSecondApproval({ paymentAmountMinor: view.amountMinor, hasReceipt });
  const created = await createTranche({
    paymentId: view.paymentId,
    reference: view.reference,
    amountMinor: amount,
    externalTxnId: txn,
    status: second ? "pending-approval" : "approved",
    hadReceipt: hasReceipt,
    ...(input.actor.id ? { enteredById: input.actor.id } : {}),
    ...(input.actor.name ? { enteredBy: input.actor.name } : {}),
    ...(input.note ? { note: input.note } : {}),
  });
  if (!created.ok) return created;
  await recordPaymentAudit({
    paymentId: view.paymentId,
    reference: view.reference,
    action: "tranche.recorded",
    actorId: input.actor.id,
    actorName: input.actor.name,
    amountMinor: amount,
    detail: { txn, needsSecondApproval: second, hadReceipt: hasReceipt },
  });
  if (second) return { ok: true, outcome: "awaiting-approval", trancheId: created.tranche.id };
  return applyReceived(view.paymentId, input.actor);
}

/** A second, different admin approves a waiting tranche. */
export async function approveTranche(trancheId: string, actor: Actor): Promise<RecordOutcome> {
  const tranche = await getTranche(trancheId);
  if (!tranche || tranche.status !== "pending-approval") return { ok: false, error: "not-found" };
  if (!canApprove({ enteredById: tranche.enteredById, approverId: actor.id })) return { ok: false, error: "same-admin" };
  const decided = await decideTranche(trancheId, {
    status: "approved",
    ...(actor.id ? { approvedById: actor.id } : {}),
    ...(actor.name ? { approvedBy: actor.name } : {}),
  });
  if (!decided) return { ok: false, error: "not-found" };
  await recordPaymentAudit({
    paymentId: tranche.paymentId,
    reference: tranche.reference,
    action: "tranche.approved",
    actorId: actor.id,
    actorName: actor.name,
    amountMinor: tranche.amountMinor,
    detail: { txn: tranche.externalTxnId, enteredBy: tranche.enteredBy ?? null },
  });
  const view = await findManualPayment({ paymentId: tranche.paymentId });
  if (view && view.status !== "pending") {
    // The payment lapsed or was cancelled while the tranche waited — the money
    // is owed back.
    await markRefundDue({
      paymentId: tranche.paymentId,
      amountMinor: tranche.amountMinor,
      label: `${view.labelEn} — received after it closed`,
      reference: tranche.reference,
      method: view.method,
    });
    await recordPaymentAudit({ paymentId: tranche.paymentId, reference: tranche.reference, action: "refund.due", actorId: actor.id, actorName: actor.name, amountMinor: tranche.amountMinor });
    return { ok: true, outcome: "unmatched", trancheId };
  }
  return applyReceived(tranche.paymentId, actor);
}

/** Reject a waiting tranche (the money was not found on the statement). */
export async function rejectTranche(trancheId: string, actor: Actor, note?: string): Promise<boolean> {
  const tranche = await getTranche(trancheId);
  if (!tranche || tranche.status !== "pending-approval") return false;
  const decided = await decideTranche(trancheId, {
    status: "rejected",
    ...(actor.id ? { approvedById: actor.id } : {}),
    ...(actor.name ? { approvedBy: actor.name } : {}),
    ...(note ? { note } : {}),
  });
  if (!decided) return false;
  await recordPaymentAudit({
    paymentId: tranche.paymentId,
    reference: tranche.reference,
    action: "tranche.rejected",
    actorId: actor.id,
    actorName: actor.name,
    amountMinor: tranche.amountMinor,
    detail: { txn: tranche.externalTxnId, note: note ?? null },
  });
  return true;
}

/**
 * Re-evaluate a payment against its approved money: short → stays pending
 * (the remainder is shown to the payer); covered → the payment is confirmed
 * through the same path a provider webhook runs, the receipt is frozen, and
 * any excess is booked as a refund due.
 */
async function applyReceived(paymentId: string, actor: Actor): Promise<RecordOutcome> {
  const view = await findManualPayment({ paymentId });
  if (!view || view.status !== "pending") return { ok: false, error: "not-found" };
  const alloc = allocate({ amountMinor: view.amountMinor, receivedMinor: view.receivedMinor });
  if (alloc.state === "short") {
    await recordPaymentAudit({
      paymentId,
      reference: view.reference,
      action: "payment.partial",
      actorId: actor.id,
      actorName: actor.name,
      amountMinor: alloc.receivedMinor,
      detail: { remainingMinor: alloc.remainingMinor },
    });
    return { ok: true, outcome: "partial", remainingMinor: alloc.remainingMinor };
  }

  const opts = { ...(actor.name ? { by: actor.name } : {}), ...(actor.id ? { byId: actor.id } : {}) };
  let ok = false;
  if (view.scope === "booking") {
    ok =
      view.leg === "settlement"
        ? (await confirmBookingSettlement(view.entityId, view.reference, opts)) !== null
        : (await confirmBookingPayment(view.entityId, view.reference, opts)) !== null;
  } else if (view.scope === "campaign") {
    ok = (await confirmCampaignPayment(view.entityId, view.reference, opts)) !== null;
  } else {
    ok = await confirmPurchase(view.entityId, view.reference, opts);
  }
  if (!ok) return { ok: false, error: "confirm-failed" };

  await lockPaymentReceipt(view.reference);
  await recordPaymentAudit({
    paymentId,
    reference: view.reference,
    action: "payment.confirmed",
    actorId: actor.id,
    actorName: actor.name,
    amountMinor: alloc.receivedMinor,
    detail: { scope: view.scope, leg: view.leg ?? null },
  });
  if (alloc.state === "over") {
    await markRefundDue({
      paymentId,
      amountMinor: alloc.excessMinor,
      label: `${view.labelEn} — overpayment`,
      reference: view.reference,
      method: view.method,
    });
    await recordPaymentAudit({
      paymentId,
      reference: view.reference,
      action: "payment.overpaid",
      actorId: actor.id,
      actorName: actor.name,
      amountMinor: alloc.excessMinor,
    });
  }
  return { ok: true, outcome: "confirmed", excessMinor: alloc.excessMinor };
}

/* ─────────────────────────────── Refunds ─────────────────────────────── */

/** Book a decided refund as due (called after a cancellation or deposit refund
 * on a manual rail). Idempotent per amount owed: callers pass the refunded
 * payment's amount once, when the refund is decided. */
export async function bookRefundDue(input: {
  paymentId: string;
  amountMinor: number;
  label: string;
  reference?: string;
  method?: string;
  actor?: Actor;
}): Promise<void> {
  const existing = await getPaymentRefund(input.paymentId);
  if (existing) return; // already booked (due or sent) — a retried cancel must not double it
  const booked = await markRefundDue(input);
  if (booked) {
    await recordPaymentAudit({
      paymentId: input.paymentId,
      reference: input.reference,
      action: "refund.due",
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      amountMinor: input.amountMinor,
      detail: { label: input.label },
    });
  }
}

/** Finance records the OMT/Whish transfer that returned the money. */
export async function sendRefund(input: { paymentId: string; txnId: string; actor: Actor }) {
  const txn = normalizeTxnId(input.txnId);
  if (!txn) return { ok: false as const, error: "invalid-txn" as const };
  const sent = await markRefundSent({ paymentId: input.paymentId, refundTxnId: txn, by: input.actor.name });
  if (!sent.ok) return sent;
  await recordPaymentAudit({
    paymentId: input.paymentId,
    action: "refund.sent",
    actorId: input.actor.id,
    actorName: input.actor.name,
    amountMinor: sent.amountMinor,
    detail: { txn },
  });
  return { ok: true as const, amountMinor: sent.amountMinor };
}

/** Resolve an unmatched (late / orphan) receipt by booking its refund. */
export async function resolveUnmatched(trancheId: string, actor: Actor): Promise<boolean> {
  const tranche = await getTranche(trancheId);
  if (!tranche || tranche.status !== "unmatched") return false;
  const view = await findManualPayment({ paymentId: tranche.paymentId });
  const resolved = await resolveUnmatchedTranche(trancheId, actor);
  if (!resolved) return false;
  await markRefundDue({
    paymentId: tranche.paymentId,
    amountMinor: tranche.amountMinor,
    label: `${view?.labelEn ?? tranche.reference} — received after it closed`,
    reference: tranche.reference,
    ...(view ? { method: view.method } : {}),
  });
  await recordPaymentAudit({
    paymentId: tranche.paymentId,
    reference: tranche.reference,
    action: "refund.due",
    actorId: actor.id,
    actorName: actor.name,
    amountMinor: tranche.amountMinor,
    detail: { unmatchedTranche: trancheId },
  });
  return true;
}

/** The finance queues for the admin card. */
export async function getFinanceQueues(): Promise<{
  awaitingApproval: Array<PaymentTranche & { labelEn: string; labelAr: string }>;
  unmatched: Array<PaymentTranche & { labelEn: string; labelAr: string }>;
}> {
  const [waiting, unmatched] = await Promise.all([
    listTranches({ status: "pending-approval" }),
    listTranches({ status: "unmatched" }),
  ]);
  const label = async (t: PaymentTranche) => {
    const view = await findManualPayment({ paymentId: t.paymentId });
    return { ...t, labelEn: view?.labelEn ?? t.reference, labelAr: view?.labelAr ?? t.reference };
  };
  return {
    awaitingApproval: await Promise.all(waiting.map(label)),
    unmatched: await Promise.all(unmatched.map(label)),
  };
}

/* ─────────────────────────────── Expiry ─────────────────────────────── */

export interface ExpirySweepResult {
  depositsExpired: number;
  depositsReminded: number;
  purchasesExpired: number;
}

function depositRequestedAt(booking: Booking): string {
  // The accept that asked for the deposit is the latest pendingPayment event.
  const events = booking.events.filter((e) => e.status === "pendingPayment");
  return events.length > 0 ? events[events.length - 1]!.time : (booking.events[0]?.time ?? new Date().toISOString());
}

/**
 * Lapse unpaid deposits (the booking is cancelled by the system and its slot
 * released) and unpaid upgrade references; remind deposit payers at half-time.
 * A payer who uploaded a receipt, or whose money finance has started
 * recording, is never lapsed by the clock. Idempotent.
 */
export async function runPaymentExpirySweep(now: Date = new Date()): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = { depositsExpired: 0, depositsReminded: 0, purchasesExpired: 0 };
  const pending = await getPendingManualPayments();
  const receipts = await receiptUploadTimes(pending.map((p) => p.reference));
  const tranches = await listTranches({ paymentIds: pending.map((p) => p.id) });
  const hasTranche = (paymentId: string) => tranches.some((t) => t.paymentId === paymentId && t.status !== "rejected");

  // Deposits — every PENDING_PAYMENT booking, whether or not the customer ever
  // opened the pay page (no reference yet still holds the slot).
  const bookings = (await getAllBookings()).filter((b) => b.status === "pendingPayment");
  for (const booking of bookings) {
    const ref = pending.find((p) => p.scope === "booking" && p.leg !== "settlement" && p.entityId === booking.id);
    const requestedAt = depositRequestedAt(booking);
    const deadline = depositDeadline({ requestedAt, startAt: booking.startAt ?? null });
    const receipt = ref ? receipts.has(ref.reference) : false;
    const tranche = ref ? hasTranche(ref.id) : booking.paymentId ? hasTranche(booking.paymentId) : false;
    if (shouldExpire({ deadline, now, hasReceipt: receipt, hasTranche: tranche })) {
      const cancelled = await cancelBooking(booking.id, { by: "system", reason: PAYMENT_TIMEOUT_REASON });
      if (cancelled) {
        result.depositsExpired += 1;
        await recordPaymentAudit({
          ...(booking.paymentId ? { paymentId: booking.paymentId } : {}),
          ...(ref ? { reference: ref.reference } : {}),
          action: "payment.expired",
          actorName: "system",
          ...(booking.deposit ? { amountMinor: booking.deposit } : {}),
          detail: { bookingId: booking.id, number: booking.number, deadline: deadline.toISOString() },
        });
      }
      continue;
    }
    if (!receipt && !tranche && booking.paymentId && reminderDue({ requestedAt: new Date(requestedAt), deadline, now })) {
      const already = (await listPaymentAudit({ paymentId: booking.paymentId, limit: 50 })).some((e) => e.action === "payment.reminded");
      if (!already) {
        await recordPaymentAudit({ paymentId: booking.paymentId, action: "payment.reminded", actorName: "system", detail: { bookingId: booking.id } });
        await pushNotification(
          {
            type: "system",
            titleEn: `Deposit due — ${booking.number}`,
            titleAr: `العربون مستحق — ${booking.number}`,
            bodyEn: `Pay the deposit before ${deadline.toISOString().slice(0, 16).replace("T", " ")} UTC or the booking is released.`,
            bodyAr: `ادفع العربون قبل ${deadline.toISOString().slice(0, 16).replace("T", " ")} (UTC) وإلا يُلغى الحجز.`,
            href: "/bookings",
          },
          booking.customerEmail || booking.customerPhone
            ? { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone, locale: booking.customerLocale ?? "en" }
            : undefined
        );
        result.depositsReminded += 1;
      }
    }
  }

  // Upgrades / credit top-ups — the reference lapses (nothing is held).
  for (const p of pending) {
    if (!isPurchaseScope(p.scope)) continue;
    if (!shouldExpire({ deadline: purchaseDeadline(p.createdAt), now, hasReceipt: receipts.has(p.reference), hasTranche: hasTranche(p.id) })) continue;
    if (await cancelPendingPurchase(p.id)) {
      result.purchasesExpired += 1;
      await recordPaymentAudit({ paymentId: p.id, reference: p.reference, action: "payment.expired", actorName: "system", amountMinor: p.amount, detail: { scope: p.scope } });
    }
  }
  return result;
}

/* ─────────────────────────── Balance dunning ─────────────────────────── */

export interface DunningRunResult {
  referencesMinted: number;
  remindersSent: number;
  escalated: number;
}

/** The balance falls due this long after the job completes. */
const BALANCE_DUE_AFTER_MS = 48 * HOUR;

function completedAtOf(booking: Booking): string | null {
  const done = booking.events.filter((e) => e.status === "completed");
  return done.length > 0 ? done[done.length - 1]!.time : null;
}

/**
 * For every completed job whose balance is still owed: stamp the due date,
 * mint the balance reference if the customer has none (on the deposit's rail,
 * OMT by default) and run the dunning ladder. Each stage fires once (CAS on
 * the stage). Idempotent.
 */
export async function runSettlementDunning(now: Date = new Date()): Promise<DunningRunResult> {
  const out: DunningRunResult = { referencesMinted: 0, remindersSent: 0, escalated: 0 };
  const completed = (await getAllBookings()).filter((b) => b.status === "completed" && !b.settledOutside);
  const workflows = await getBookingWorkflows(completed.map((b) => b.id));
  for (const booking of completed) {
    const wf = workflows.get(booking.id) ?? { dunningStage: 0 };
    if (wf.settlementWrittenOffAt) continue;
    const settlement = await getBookingSettlement(booking.id);
    if (!settlement || !settlementNeedsCollection(settlement)) continue;
    const doneAt = completedAtOf(booking);
    if (!doneAt) continue;

    let dueAt = wf.settlementDueAt;
    if (!dueAt) {
      dueAt = new Date(Date.parse(doneAt) + BALANCE_DUE_AFTER_MS).toISOString();
      await patchBookingWorkflow(booking.id, { settlementDueAt: dueAt });
    }
    // The customer needs a reference to pay with — mint it on the rail they
    // already used (OMT unless the deposit went through Whish).
    const leg = await getBookingSettlementPayment(booking.id);
    if (settlement.state !== "awaiting-confirmation" && (!leg || leg.status !== "pending")) {
      const method = booking.paymentMethod === "whish" ? "WHISH" : "OMT";
      if (await createBookingSettlementCheckout(booking.id, method)) {
        out.referencesMinted += 1;
        await pushNotification(
          {
            type: "system",
            titleEn: `Balance due — ${booking.number}`,
            titleAr: `الرصيد المستحق — ${booking.number}`,
            bodyEn: `The job is done. Please pay the remaining $${(settlement.outstandingMinor / 100).toFixed(2)} by ${dueAt.slice(0, 10)} — it releases the worker's pay and activates your guarantee.`,
            bodyAr: `اكتمل العمل. يرجى دفع المبلغ المتبقي $${(settlement.outstandingMinor / 100).toFixed(2)} قبل ${dueAt.slice(0, 10)} — الدفع يحرّر أجر العامل ويفعّل الضمان.`,
            href: "/bookings",
          },
          { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone, locale: booking.customerLocale ?? "en" }
        );
      }
    }

    const stage = nextDunningStage({ dueAt: new Date(dueAt), now, stage: wf.dunningStage });
    if (!stage) continue;
    const advanced = await patchBookingWorkflow(
      booking.id,
      { dunningStage: stage, dunningAt: now.toISOString() },
      { expectStage: wf.dunningStage }
    );
    if (!advanced) continue; // another run took this stage
    await recordPaymentAudit({
      action: "settlement.dunning",
      actorName: "system",
      amountMinor: settlement.outstandingMinor,
      detail: { bookingId: booking.id, number: booking.number, stage },
    });
    const amount = `$${(settlement.outstandingMinor / 100).toFixed(2)}`;
    const customer = { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone, locale: booking.customerLocale ?? ("en" as const) };
    if (stage <= 2) {
      await pushNotification(
        {
          type: "system",
          titleEn: `Reminder: balance due — ${booking.number}`,
          titleAr: `تذكير: رصيد مستحق — ${booking.number}`,
          bodyEn: `${amount} is still owed for ${booking.jobTitle}. Pay it from your bookings page with the OMT/Whish reference.`,
          bodyAr: `ما زال ${amount} مستحقًا عن ${booking.jobTitle}. ادفعه من صفحة حجوزاتك باستخدام مرجع OMT/Whish.`,
          href: "/bookings",
        },
        customer
      );
      out.remindersSent += 1;
    }
    if (stage === 2 || stage === 4) {
      // The worker sees the platform chasing (no contact details change hands).
      await pushNotification({
        type: "system",
        titleEn: `We are collecting your balance — ${booking.number}`,
        titleAr: `نحن نحصّل رصيدك — ${booking.number}`,
        bodyEn: stage === 2 ? `The customer has been reminded about ${amount}.` : `The customer's account is now restricted until ${amount} is paid.`,
        bodyAr: stage === 2 ? `تم تذكير العميل بمبلغ ${amount}.` : `حساب العميل مقيّد الآن حتى دفع ${amount}.`,
        href: "/dashboard",
      });
    }
    if (stage >= 3) {
      out.escalated += 1;
      await logAdminActivity({
        code: ACTION_CODES.BALANCE_OVERDUE,
        actionEn:
          stage === 3
            ? `Balance overdue 7 days — follow up ${booking.number} (${amount})`
            : stage === 4
              ? `Balance overdue 14 days — customer restricted (${booking.number}, ${amount})`
              : `Balance overdue 30 days — decide write-off for ${booking.number} (${amount})`,
        actionAr:
          stage === 3
            ? `رصيد متأخر 7 أيام — متابعة ${booking.number} (${amount})`
            : stage === 4
              ? `رصيد متأخر 14 يومًا — تقييد العميل (${booking.number}، ${amount})`
              : `رصيد متأخر 30 يومًا — قرار الشطب لـ ${booking.number} (${amount})`,
        actor: "system",
        type: "payment",
        bookingNo: booking.number,
      });
    }
  }
  return out;
}

/** Balances at the D+14 stage or later, not yet written off — the admin's
 * follow-up / write-off list. */
export async function overdueBalances(): Promise<Array<{ booking: Booking; outstandingMinor: number; stage: number }>> {
  const completed = (await getAllBookings()).filter((b) => b.status === "completed" && !b.settledOutside);
  const workflows = await getBookingWorkflows(completed.map((b) => b.id));
  const out: Array<{ booking: Booking; outstandingMinor: number; stage: number }> = [];
  for (const b of completed) {
    const wf = workflows.get(b.id);
    if (!wf || wf.dunningStage < 3 || wf.settlementWrittenOffAt) continue;
    const s = await getBookingSettlement(b.id);
    if (!s || !settlementNeedsCollection(s)) continue;
    out.push({ booking: b, outstandingMinor: s.outstandingMinor, stage: wf.dunningStage });
  }
  return out.sort((a, b) => b.stage - a.stage);
}

/** An admin writes the remaining balance off (stage 5 decision). */
export async function writeOffBalance(bookingId: string, actor: Actor): Promise<boolean> {
  const wf = await getBookingWorkflow(bookingId);
  if (wf.settlementWrittenOffAt) return false;
  const settlement = await getBookingSettlement(bookingId);
  if (!settlement || !settlementNeedsCollection(settlement)) return false;
  const ok = await patchBookingWorkflow(bookingId, { settlementWrittenOffAt: new Date().toISOString() });
  if (ok) {
    await logAdminActivity({
      code: ACTION_CODES.BALANCE_WRITTEN_OFF,
      actionEn: `${actor.name ?? "Admin"} wrote off $${(settlement.outstandingMinor / 100).toFixed(2)} on booking ${bookingId}`,
      actionAr: `${actor.name ?? "المشرف"} شطب $${(settlement.outstandingMinor / 100).toFixed(2)} على الحجز ${bookingId}`,
      actor: actor.name ?? "Platform Admin",
      ...(actor.id ? { actorId: actor.id } : {}),
      type: "payment",
    });
    await recordPaymentAudit({
      action: "settlement.written-off",
      actorId: actor.id,
      actorName: actor.name,
      amountMinor: settlement.outstandingMinor,
      detail: { bookingId },
    });
  }
  return ok;
}

/* ───────────────────────── Payment reliability ───────────────────────── */

export interface CustomerReliability {
  points: number;
  tier: ReliabilityTier;
  expiredDeposits: number;
  overdueBalances: number;
  writeOffs: number;
  paidJobs: number;
}

/** The customer's payment-reliability score across every booking they made. */
export async function customerReliability(identity: { customerId?: string; phone?: string; email?: string }): Promise<CustomerReliability> {
  const lookups = [
    identity.customerId ? getCustomerBookings({ customerId: identity.customerId }) : Promise.resolve([]),
    identity.phone ? getCustomerBookings({ phone: identity.phone }) : Promise.resolve([]),
  ];
  const seen = new Map<string, Booking>();
  for (const list of await Promise.all(lookups)) for (const b of list) seen.set(b.id, b);
  const bookings = [...seen.values()];
  const workflows = await getBookingWorkflows(bookings.map((b) => b.id));
  let expiredDeposits = 0;
  let overdueBalances = 0;
  let writeOffs = 0;
  let paidJobs = 0;
  for (const b of bookings) {
    if (b.status === "cancelled" && b.events.some((e) => e.status === "cancelled" && e.reason === PAYMENT_TIMEOUT_REASON)) {
      expiredDeposits += 1;
    }
    const wf = workflows.get(b.id);
    if (wf?.settlementWrittenOffAt) writeOffs += 1;
    else if ((wf?.dunningStage ?? 0) >= 3) overdueBalances += 1;
    if (b.status === "completed") {
      const s = await getBookingSettlement(b.id);
      if (s && (s.state === "funded" || s.state === "overpaid")) paidJobs += 1;
    }
  }
  const score = reliabilityScore({ expiredDeposits, overdueBalances, writeOffs, paidJobs });
  return { ...score, expiredDeposits, overdueBalances, writeOffs, paidJobs };
}

/* ─────────────────────────── Cash settlement ─────────────────────────── */

export type DeclareOutsideResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: "not-found" | "payment-in-flight" | "not-allowed" };

/**
 * The worker declares the job settled directly. Refused while the customer's
 * balance payment is in flight (a receipt was uploaded or finance has started
 * recording it): cancelling that reference would cancel money the customer
 * actually sent.
 */
export async function declareSettledOutside(
  bookingId: string,
  opts: { by?: "worker" | "admin"; reason?: string } = {}
): Promise<DeclareOutsideResult> {
  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "not-found" };
  const leg = await getBookingSettlementPayment(bookingId);
  if (leg?.providerRef) {
    const receipt = (await receiptUploadTimes([leg.providerRef])).has(leg.providerRef);
    const pendingTranches = (await listTranches({ paymentId: leg.id })).filter((t) => t.status !== "rejected");
    if (receipt || pendingTranches.length > 0) return { ok: false, error: "payment-in-flight" };
  }
  const result = await markBookingSettledOutside(bookingId, opts);
  if (!result) return { ok: false, error: "not-allowed" };
  if (opts.by === "admin") {
    await patchBookingWorkflow(bookingId, { settledOutsideConfirmedAt: new Date().toISOString() });
  } else {
    await pushNotification(
      {
        type: "system",
        titleEn: `Did you pay ${booking.number} directly?`,
        titleAr: `هل دفعت ${booking.number} مباشرة؟`,
        bodyEn: "The worker says you paid them directly. Please confirm on your bookings page — or tell us if you did not.",
        bodyAr: "يقول العامل إنك دفعت له مباشرة. يرجى التأكيد من صفحة حجوزاتك — أو أخبرنا إن لم تفعل.",
        href: "/bookings",
      },
      { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone, locale: booking.customerLocale ?? "en" }
    );
  }
  return { ok: true, booking: result };
}

/**
 * The customer answers a "settled directly" declaration. A confirmation closes
 * it; a denial flags the booking for admin review (the admin decides whether
 * to reopen the balance — the fee claim and any collected credits are
 * money-bearing, so this is never automatic).
 */
export async function answerSettledOutside(bookingId: string, confirmed: boolean): Promise<boolean> {
  const booking = await getBookingById(bookingId);
  if (!booking?.settledOutside) return false;
  const wf = await getBookingWorkflow(bookingId);
  if (wf.settledOutsideConfirmedAt || wf.settledOutsideDisputedAt) return false;
  const now = new Date().toISOString();
  const ok = await patchBookingWorkflow(bookingId, confirmed ? { settledOutsideConfirmedAt: now } : { settledOutsideDisputedAt: now });
  if (!ok) return false;
  await recordPaymentAudit({
    action: confirmed ? "settlement.outside-confirmed" : "settlement.outside-disputed",
    actorName: booking.customerName,
    detail: { bookingId, number: booking.number },
  });
  if (!confirmed) {
    await logAdminActivity({
      code: ACTION_CODES.SETTLED_OUTSIDE_DISPUTED,
      actionEn: `Customer DENIES paying ${booking.number} directly — review the worker's cash declaration`,
      actionAr: `العميل ينفي الدفع المباشر لـ ${booking.number} — راجع تصريح العامل`,
      actor: booking.customerName,
      type: "payment",
      bookingNo: booking.number,
    });
  }
  return true;
}

/** "Settled directly" declarations the customer has not answered in time, or
 * has denied — the admin review list. */
export async function settledOutsideNeedingReview(now: Date = new Date()): Promise<Array<{ booking: Booking; disputed: boolean }>> {
  const cfg = paymentWorkflowConfig();
  const declared = (await getAllBookings()).filter((b) => b.settledOutside);
  const workflows = await getBookingWorkflows(declared.map((b) => b.id));
  const out: Array<{ booking: Booking; disputed: boolean }> = [];
  for (const b of declared) {
    const wf = workflows.get(b.id);
    if (wf?.settledOutsideConfirmedAt) continue;
    if (wf?.settledOutsideDisputedAt) {
      out.push({ booking: b, disputed: true });
      continue;
    }
    const at = b.settledOutsideAt ? Date.parse(b.settledOutsideAt) : NaN;
    if (Number.isFinite(at) && now.getTime() - at >= cfg.settledOutsideConfirmHours * HOUR) out.push({ booking: b, disputed: false });
  }
  return out;
}

/**
 * Does an old, unpaid outside-platform fee claim block this worker's lead
 * purchases and payouts? Returns the outstanding amount when it does.
 */
export async function feeClaimBlock(workerId: string, now: Date = new Date()): Promise<{ blocked: boolean; outstandingMinor: number }> {
  const bookings = (await getWorkerBookings(workerId)).filter((b) => b.settledOutside);
  let outstanding = 0;
  let blocked = false;
  for (const b of bookings) {
    const s = await getBookingSettlement(b.id);
    if (!s || s.feeClaimOutstandingMinor <= 0) continue;
    outstanding += s.feeClaimOutstandingMinor;
    if (
      feeClaimBlocks({
        claimMinor: s.feeClaimMinor,
        collectedMinor: s.feeClaimCollectedMinor,
        declaredAt: b.settledOutsideAt ? new Date(b.settledOutsideAt) : null,
        now,
      })
    ) {
      blocked = true;
    }
  }
  return { blocked, outstandingMinor: outstanding };
}
