/**
 * Payment workflow v2 — persistence (docs/PAYMENTS.md §Workflow v2).
 *
 * Holds what the pure rules in payment-workflow.ts decide:
 *  - the never-pruned money audit trail (PaymentAuditEvent);
 *  - payment tranches — each amount finance actually received, with its
 *    unique OMT/Whish transaction number and the maker–checker approval;
 *  - refund cash-out state (due → sent) on the Payment row;
 *  - per-booking workflow stamps (balance due date, dunning stage, write-off,
 *    the customer's answer to a "settled directly" declaration).
 *
 * Dual adapter like every store: Prisma when DEMO_MODE=false + DATABASE_URL,
 * an in-process map otherwise (demo and unit tests).
 */
import { randomUUID } from "node:crypto";

function realEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

async function db() {
  return (await import("@/lib/server/prisma")).getPrisma();
}

/* ───────────────────────────── Demo state ───────────────────────────── */

interface DemoState {
  audit: PaymentAuditEvent[];
  tranches: PaymentTranche[];
  refunds: Map<string, PaymentRefund>;
  bookings: Map<string, BookingWorkflow>;
}

const GLOBAL_KEY = "__workersArenaPaymentWorkflow";
const g = globalThis as Record<string, unknown>;
const STATE: DemoState =
  (g[GLOBAL_KEY] as DemoState | undefined) ??
  (g[GLOBAL_KEY] = { audit: [], tranches: [], refunds: new Map(), bookings: new Map() } satisfies DemoState) as DemoState;

/** Reset the demo store (tests). */
export function resetPaymentWorkflowStore(): void {
  STATE.audit.length = 0;
  STATE.tranches.length = 0;
  STATE.refunds.clear();
  STATE.bookings.clear();
}

/* ──────────────────────────── Audit trail ──────────────────────────── */

export type PaymentAuditAction =
  | "tranche.recorded"
  | "tranche.approved"
  | "tranche.rejected"
  | "tranche.unmatched"
  | "payment.confirmed"
  | "payment.partial"
  | "payment.overpaid"
  | "payment.expired"
  | "payment.reminded"
  | "refund.due"
  | "refund.sent"
  | "settlement.dunning"
  | "settlement.written-off"
  | "settlement.outside-confirmed"
  | "settlement.outside-disputed";

export interface PaymentAuditEvent {
  id: string;
  paymentId?: string;
  reference?: string;
  action: PaymentAuditAction;
  actorId?: string;
  actorName?: string;
  amountMinor?: number;
  detail?: Record<string, unknown>;
  createdAt: string;
}

/** Append one money event. Never throws: an audit failure is logged, not fatal
 * to the money move it records (which has already committed). */
export async function recordPaymentAudit(input: Omit<PaymentAuditEvent, "id" | "createdAt">): Promise<void> {
  try {
    if (realEnabled()) {
      await (await db()).paymentAuditEvent.create({
        data: {
          paymentId: input.paymentId ?? null,
          reference: input.reference ?? null,
          action: input.action,
          actorId: input.actorId ?? null,
          actorName: input.actorName ?? null,
          amountMinor: input.amountMinor ?? null,
          ...(input.detail ? { detail: input.detail as object } : {}),
        },
      });
      return;
    }
    STATE.audit.push({ ...input, id: `pae-${randomUUID()}`, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error("[payment-audit] could not record", input.action, err);
  }
}

/** The audit trail, newest first (optionally for one payment). */
export async function listPaymentAudit(opts: { paymentId?: string; limit?: number } = {}): Promise<PaymentAuditEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 2000);
  if (realEnabled()) {
    const rows = await (await db()).paymentAuditEvent.findMany({
      where: opts.paymentId ? { paymentId: opts.paymentId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      ...(r.paymentId ? { paymentId: r.paymentId } : {}),
      ...(r.reference ? { reference: r.reference } : {}),
      action: r.action as PaymentAuditAction,
      ...(r.actorId ? { actorId: r.actorId } : {}),
      ...(r.actorName ? { actorName: r.actorName } : {}),
      ...(r.amountMinor !== null ? { amountMinor: r.amountMinor } : {}),
      ...(r.detail ? { detail: r.detail as Record<string, unknown> } : {}),
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return STATE.audit
    .filter((e) => !opts.paymentId || e.paymentId === opts.paymentId)
    .slice()
    .reverse()
    .slice(0, limit);
}

/* ────────────────────────────── Tranches ────────────────────────────── */

export type TrancheStatus = "pending-approval" | "approved" | "rejected" | "unmatched";

export interface PaymentTranche {
  id: string;
  paymentId: string;
  reference: string;
  amountMinor: number;
  externalTxnId: string;
  status: TrancheStatus;
  hadReceipt: boolean;
  enteredById?: string;
  enteredBy?: string;
  approvedById?: string;
  approvedBy?: string;
  note?: string;
  createdAt: string;
  decidedAt?: string;
}

type TrancheRow = {
  id: string;
  paymentId: string;
  reference: string;
  amountMinor: number;
  externalTxnId: string;
  status: string;
  hadReceipt: boolean;
  enteredById: string | null;
  enteredBy: string | null;
  approvedById: string | null;
  approvedBy: string | null;
  note: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

function fromRow(r: TrancheRow): PaymentTranche {
  return {
    id: r.id,
    paymentId: r.paymentId,
    reference: r.reference,
    amountMinor: r.amountMinor,
    externalTxnId: r.externalTxnId,
    status: r.status as TrancheStatus,
    hadReceipt: r.hadReceipt,
    ...(r.enteredById ? { enteredById: r.enteredById } : {}),
    ...(r.enteredBy ? { enteredBy: r.enteredBy } : {}),
    ...(r.approvedById ? { approvedById: r.approvedById } : {}),
    ...(r.approvedBy ? { approvedBy: r.approvedBy } : {}),
    ...(r.note ? { note: r.note } : {}),
    createdAt: r.createdAt.toISOString(),
    ...(r.decidedAt ? { decidedAt: r.decidedAt.toISOString() } : {}),
  };
}

/** Is this transaction number already used — on any tranche or any refund? */
export async function txnIdInUse(externalTxnId: string): Promise<boolean> {
  if (realEnabled()) {
    const prisma = await db();
    const [t, r] = await Promise.all([
      prisma.paymentTranche.findUnique({ where: { externalTxnId }, select: { id: true } }),
      prisma.payment.findUnique({ where: { refundTxnId: externalTxnId }, select: { id: true } }),
    ]);
    return Boolean(t || r);
  }
  return (
    STATE.tranches.some((t) => t.externalTxnId === externalTxnId) ||
    [...STATE.refunds.values()].some((r) => r.refundTxnId === externalTxnId)
  );
}

/** Record an amount received. Refuses a transaction number already used. */
export async function createTranche(
  input: Omit<PaymentTranche, "id" | "createdAt" | "decidedAt" | "approvedById" | "approvedBy">
): Promise<{ ok: true; tranche: PaymentTranche } | { ok: false; error: "duplicate-txn" }> {
  if (await txnIdInUse(input.externalTxnId)) return { ok: false, error: "duplicate-txn" };
  const approvedNow = input.status === "approved";
  if (realEnabled()) {
    try {
      const row = await (await db()).paymentTranche.create({
        data: {
          paymentId: input.paymentId,
          reference: input.reference,
          amountMinor: input.amountMinor,
          externalTxnId: input.externalTxnId,
          status: input.status,
          hadReceipt: input.hadReceipt,
          enteredById: input.enteredById ?? null,
          enteredBy: input.enteredBy ?? null,
          note: input.note ?? null,
          ...(approvedNow ? { decidedAt: new Date() } : {}),
        },
      });
      return { ok: true, tranche: fromRow(row) };
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return { ok: false, error: "duplicate-txn" };
      throw err;
    }
  }
  const tranche: PaymentTranche = {
    ...input,
    id: `trn-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...(approvedNow ? { decidedAt: new Date().toISOString() } : {}),
  };
  STATE.tranches.push(tranche);
  return { ok: true, tranche };
}

export async function getTranche(id: string): Promise<PaymentTranche | null> {
  if (realEnabled()) {
    const row = await (await db()).paymentTranche.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }
  return STATE.tranches.find((t) => t.id === id) ?? null;
}

export async function listTranches(opts: { paymentId?: string; paymentIds?: string[]; status?: TrancheStatus } = {}): Promise<PaymentTranche[]> {
  const ids = opts.paymentIds ?? (opts.paymentId ? [opts.paymentId] : undefined);
  if (realEnabled()) {
    const rows = await (await db()).paymentTranche.findMany({
      where: {
        ...(ids ? { paymentId: { in: ids } } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(fromRow);
  }
  return STATE.tranches.filter((t) => (!ids || ids.includes(t.paymentId)) && (!opts.status || t.status === opts.status));
}

/** Approve or reject a pending tranche (compare-and-swap on its status). */
export async function decideTranche(
  id: string,
  decision: { status: "approved" | "rejected"; approvedById?: string; approvedBy?: string; note?: string }
): Promise<PaymentTranche | null> {
  if (realEnabled()) {
    const prisma = await db();
    const flipped = await prisma.paymentTranche.updateMany({
      where: { id, status: "pending-approval" },
      data: {
        status: decision.status,
        approvedById: decision.approvedById ?? null,
        approvedBy: decision.approvedBy ?? null,
        decidedAt: new Date(),
        ...(decision.note ? { note: decision.note } : {}),
      },
    });
    if (flipped.count === 0) return null;
    const row = await prisma.paymentTranche.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }
  const t = STATE.tranches.find((x) => x.id === id);
  if (!t || t.status !== "pending-approval") return null;
  t.status = decision.status;
  if (decision.approvedById) t.approvedById = decision.approvedById;
  if (decision.approvedBy) t.approvedBy = decision.approvedBy;
  if (decision.note) t.note = decision.note;
  t.decidedAt = new Date().toISOString();
  return t;
}

/** Move an unmatched tranche to "approved" bookkeeping once it is resolved
 * (refund booked) — it stays as evidence, never deleted. */
export async function resolveUnmatchedTranche(id: string, by: { id?: string; name?: string }): Promise<PaymentTranche | null> {
  if (realEnabled()) {
    const prisma = await db();
    const flipped = await prisma.paymentTranche.updateMany({
      where: { id, status: "unmatched" },
      data: { status: "rejected", approvedById: by.id ?? null, approvedBy: by.name ?? null, decidedAt: new Date(), note: "Resolved: refund due" },
    });
    if (flipped.count === 0) return null;
    const row = await prisma.paymentTranche.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }
  const t = STATE.tranches.find((x) => x.id === id);
  if (!t || t.status !== "unmatched") return null;
  t.status = "rejected";
  t.note = "Resolved: refund due";
  if (by.id) t.approvedById = by.id;
  if (by.name) t.approvedBy = by.name;
  t.decidedAt = new Date().toISOString();
  return t;
}

/** Σ approved tranche amounts for a payment. */
export function receivedFrom(tranches: PaymentTranche[]): number {
  return tranches.filter((t) => t.status === "approved").reduce((sum, t) => sum + t.amountMinor, 0);
}

/* ────────────────────────────── Refunds ────────────────────────────── */

export type RefundState = "due" | "sent";

export interface PaymentRefund {
  paymentId: string;
  state: RefundState;
  amountMinor: number;
  /** What the refund is for — shown in the finance queue. */
  label: string;
  reference?: string;
  method?: string;
  refundTxnId?: string;
  sentAt?: string;
  sentBy?: string;
  createdAt: string;
}

/**
 * Book a refund as DUE: the money is owed back but has not left yet. Adds to
 * any amount already due (an overpayment plus a later cancellation). A refund
 * already sent is never reopened.
 */
export async function markRefundDue(input: {
  paymentId: string;
  amountMinor: number;
  label: string;
  reference?: string;
  method?: string;
}): Promise<boolean> {
  const amount = Math.max(0, Math.trunc(input.amountMinor));
  if (amount === 0) return false;
  if (realEnabled()) {
    const prisma = await db();
    const row = await prisma.payment.findUnique({ where: { id: input.paymentId }, select: { refundState: true, refundAmount: true, metadata: true } });
    if (!row || row.refundState === "sent") return false;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    await prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        refundState: "due",
        refundAmount: (row.refundState === "due" ? row.refundAmount ?? 0 : 0) + amount,
        metadata: { ...meta, refundLabel: input.label } as object,
      },
    });
    return true;
  }
  const existing = STATE.refunds.get(input.paymentId);
  if (existing?.state === "sent") return false;
  STATE.refunds.set(input.paymentId, {
    paymentId: input.paymentId,
    state: "due",
    amountMinor: (existing?.amountMinor ?? 0) + amount,
    label: input.label,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.method ? { method: input.method } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
  return true;
}

/** Record the OMT/Whish transfer that returned the money (CAS due → sent). */
export async function markRefundSent(input: {
  paymentId: string;
  refundTxnId: string;
  by?: string;
}): Promise<{ ok: true; amountMinor: number } | { ok: false; error: "not-due" | "duplicate-txn" }> {
  if (await txnIdInUse(input.refundTxnId)) return { ok: false, error: "duplicate-txn" };
  if (realEnabled()) {
    const prisma = await db();
    try {
      const flipped = await prisma.payment.updateMany({
        where: { id: input.paymentId, refundState: "due" },
        data: { refundState: "sent", refundTxnId: input.refundTxnId, refundSentAt: new Date(), refundSentBy: input.by ?? null },
      });
      if (flipped.count === 0) return { ok: false, error: "not-due" };
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return { ok: false, error: "duplicate-txn" };
      throw err;
    }
    const row = await prisma.payment.findUnique({ where: { id: input.paymentId }, select: { refundAmount: true } });
    return { ok: true, amountMinor: row?.refundAmount ?? 0 };
  }
  const r = STATE.refunds.get(input.paymentId);
  if (!r || r.state !== "due") return { ok: false, error: "not-due" };
  r.state = "sent";
  r.refundTxnId = input.refundTxnId;
  r.sentAt = new Date().toISOString();
  if (input.by) r.sentBy = input.by;
  return { ok: true, amountMinor: r.amountMinor };
}

/** Refunds owed back and not yet sent — the finance queue, oldest first. */
export async function listRefundsDue(): Promise<PaymentRefund[]> {
  if (realEnabled()) {
    const rows = await (await db()).payment.findMany({
      where: { refundState: "due" },
      orderBy: { createdAt: "asc" },
      select: { id: true, refundAmount: true, providerRef: true, method: true, metadata: true, createdAt: true, refundedAt: true },
    });
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        paymentId: r.id,
        state: "due" as const,
        amountMinor: r.refundAmount ?? 0,
        label: typeof meta.refundLabel === "string" ? meta.refundLabel : r.id,
        ...(r.providerRef ? { reference: r.providerRef } : {}),
        method: r.method,
        createdAt: (r.refundedAt ?? r.createdAt).toISOString(),
      };
    });
  }
  return [...STATE.refunds.values()].filter((r) => r.state === "due").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The refund record for one payment, if any. */
export async function getPaymentRefund(paymentId: string): Promise<PaymentRefund | null> {
  if (realEnabled()) {
    const r = await (await db()).payment.findUnique({
      where: { id: paymentId },
      select: { id: true, refundState: true, refundAmount: true, refundTxnId: true, refundSentAt: true, refundSentBy: true, providerRef: true, method: true, metadata: true, createdAt: true },
    });
    if (!r?.refundState) return null;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      paymentId: r.id,
      state: r.refundState as RefundState,
      amountMinor: r.refundAmount ?? 0,
      label: typeof meta.refundLabel === "string" ? meta.refundLabel : r.id,
      ...(r.providerRef ? { reference: r.providerRef } : {}),
      method: r.method,
      ...(r.refundTxnId ? { refundTxnId: r.refundTxnId } : {}),
      ...(r.refundSentAt ? { sentAt: r.refundSentAt.toISOString() } : {}),
      ...(r.refundSentBy ? { sentBy: r.refundSentBy } : {}),
      createdAt: r.createdAt.toISOString(),
    };
  }
  return STATE.refunds.get(paymentId) ?? null;
}

/* ─────────────────────────── Booking stamps ─────────────────────────── */

export interface BookingWorkflow {
  settlementDueAt?: string;
  dunningStage: number;
  dunningAt?: string;
  settlementWrittenOffAt?: string;
  settledOutsideConfirmedAt?: string;
  settledOutsideDisputedAt?: string;
}

const EMPTY: BookingWorkflow = { dunningStage: 0 };

export async function getBookingWorkflow(bookingId: string): Promise<BookingWorkflow> {
  if (realEnabled()) {
    const r = await (await db()).booking.findUnique({
      where: { id: bookingId },
      select: {
        settlementDueAt: true,
        dunningStage: true,
        dunningAt: true,
        settlementWrittenOffAt: true,
        settledOutsideConfirmedAt: true,
        settledOutsideDisputedAt: true,
      },
    });
    if (!r) return { ...EMPTY };
    return {
      dunningStage: r.dunningStage,
      ...(r.settlementDueAt ? { settlementDueAt: r.settlementDueAt.toISOString() } : {}),
      ...(r.dunningAt ? { dunningAt: r.dunningAt.toISOString() } : {}),
      ...(r.settlementWrittenOffAt ? { settlementWrittenOffAt: r.settlementWrittenOffAt.toISOString() } : {}),
      ...(r.settledOutsideConfirmedAt ? { settledOutsideConfirmedAt: r.settledOutsideConfirmedAt.toISOString() } : {}),
      ...(r.settledOutsideDisputedAt ? { settledOutsideDisputedAt: r.settledOutsideDisputedAt.toISOString() } : {}),
    };
  }
  return { ...EMPTY, ...(STATE.bookings.get(bookingId) ?? {}) };
}

/** All bookings' stamps at once (the crons and the reliability score). */
export async function getBookingWorkflows(bookingIds: string[]): Promise<Map<string, BookingWorkflow>> {
  const ids = [...new Set(bookingIds)];
  const out = new Map<string, BookingWorkflow>();
  if (ids.length === 0) return out;
  if (realEnabled()) {
    const rows = await (await db()).booking.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        settlementDueAt: true,
        dunningStage: true,
        dunningAt: true,
        settlementWrittenOffAt: true,
        settledOutsideConfirmedAt: true,
        settledOutsideDisputedAt: true,
      },
    });
    for (const r of rows) {
      out.set(r.id, {
        dunningStage: r.dunningStage,
        ...(r.settlementDueAt ? { settlementDueAt: r.settlementDueAt.toISOString() } : {}),
        ...(r.dunningAt ? { dunningAt: r.dunningAt.toISOString() } : {}),
        ...(r.settlementWrittenOffAt ? { settlementWrittenOffAt: r.settlementWrittenOffAt.toISOString() } : {}),
        ...(r.settledOutsideConfirmedAt ? { settledOutsideConfirmedAt: r.settledOutsideConfirmedAt.toISOString() } : {}),
        ...(r.settledOutsideDisputedAt ? { settledOutsideDisputedAt: r.settledOutsideDisputedAt.toISOString() } : {}),
      });
    }
    return out;
  }
  for (const id of ids) out.set(id, { ...EMPTY, ...(STATE.bookings.get(id) ?? {}) });
  return out;
}

/**
 * Patch a booking's workflow stamps. `expectStage` makes a dunning advance a
 * compare-and-swap, so two overlapping cron runs cannot both send a stage.
 * Returns false when the CAS lost (or the booking is unknown).
 */
export async function patchBookingWorkflow(
  bookingId: string,
  patch: Partial<BookingWorkflow>,
  opts: { expectStage?: number } = {}
): Promise<boolean> {
  if (realEnabled()) {
    const data: Record<string, unknown> = {};
    if (patch.dunningStage !== undefined) data.dunningStage = patch.dunningStage;
    for (const k of ["settlementDueAt", "dunningAt", "settlementWrittenOffAt", "settledOutsideConfirmedAt", "settledOutsideDisputedAt"] as const) {
      if (k in patch) data[k] = patch[k] ? new Date(patch[k] as string) : null;
    }
    const res = await (await db()).booking.updateMany({
      where: { id: bookingId, ...(opts.expectStage !== undefined ? { dunningStage: opts.expectStage } : {}) },
      data,
    });
    return res.count > 0;
  }
  const current = { ...EMPTY, ...(STATE.bookings.get(bookingId) ?? {}) };
  if (opts.expectStage !== undefined && current.dunningStage !== opts.expectStage) return false;
  const next: BookingWorkflow = { ...current };
  for (const [k, v] of Object.entries(patch) as Array<[keyof BookingWorkflow, unknown]>) {
    if (v === undefined || v === null) delete (next as unknown as Record<string, unknown>)[k];
    else (next as unknown as Record<string, unknown>)[k] = v;
  }
  if (next.dunningStage === undefined) next.dunningStage = 0;
  STATE.bookings.set(bookingId, next);
  return true;
}
