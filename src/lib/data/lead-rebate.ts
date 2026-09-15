/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD REBATE — what a converted lead gives back (§11)
 * ────────────────────────────────────────────────────────────────────────────
 * The pricing is pure (`leadRebateFor` in `lead-market.ts`); THIS module is the
 * resolution half: given a COMPLETED booking, work out whether it came from a
 * lead this worker bought, what that cost, and how much of the platform fee on
 * it comes back.
 *
 * Two rules make it safe:
 *   • Attribution is the PURCHASED OFFER, not a guess. The offer records both
 *     the worker and the lead (`QuoteRequest.id`), and a booking carries the
 *     `quoteRequestId` it came from, so the join is exact and a worker can only
 *     benefit from a lead they actually paid for.
 *   • The rebate is bounded by the fee that produced it, so the platform never
 *     pays out more than it earned on the job.
 *
 * Nothing here writes money. It returns a priced, self-describing `LeadRebate`
 * record plus the adjustments the caller must make; the completion transaction
 * (or the demo adapter) applies them atomically, which is what keeps a retried
 * completion from rebating twice.
 */

import {
  leadRebateFor,
  leadMarketConfig,
  type LeadRebateConfig,
  type LeadRebateLimit,
} from "./lead-market";
import { loadActiveFeeRuleSet } from "./fee-rules-store";
import { purchasedLeadOfferSync } from "./lead-market-store";
import type { FeeRuleSet } from "./fee-rules";

/** An applied rebate — the audit record (LeadRebate row / demo store entry). */
export interface LeadRebate {
  id: string;
  bookingId: string;
  /** The QuoteRequest (lead) the job came from. */
  leadId: string;
  /** The LeadOffer the worker bought. */
  offerId: string;
  workerId: string;
  leadCostCredits: number;
  /** The lead's price as money, minor units (credits × 100). */
  leadCostMinor: number;
  /** The platform fee stamped on the job, minor units. */
  feeMinor: number;
  rebateMinor: number;
  /** feeMinor − rebateMinor — what the platform actually kept. */
  effectiveFeeMinor: number;
  pctBps: number;
  maxMinor: number | null;
  limitedBy: LeadRebateLimit;
  ruleId: string;
  ruleVersion: number;
  currency: string;
  createdAt: string;
}

/** What the completion path needs to apply: the record + the money to credit. */
export interface LeadRebateResolution {
  rebate: LeadRebate;
  /** The amount to ADD to the worker's earnings for this job (0 = none). */
  creditMinor: number;
}

/** The purchased-offer facts the resolver needs (structural). */
export interface PurchasedLead {
  offerId: string;
  leadId: string;
  priceCredits: number;
}

/** Mirrors the other stores' gate (and repo.ts): real data needs both. */
function realLeadRebateDataEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

/* ───────────────────────────── Demo (globalThis) ───────────────────────────── */

interface LeadRebateStore {
  seq: number;
  rebates: LeadRebate[];
}

const GLOBAL_KEY = "__workersArenaLeadRebates";
const g = globalThis as Record<string, unknown>;
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;
const STORE: LeadRebateStore =
  (g[GLOBAL_KEY] as LeadRebateStore | undefined) ?? (g[GLOBAL_KEY] = { seq: 0, rebates: [] } as LeadRebateStore);

if (FIRST_INSTANCE) {
  STORE.seq = 0;
  STORE.rebates = [];
}

/** Reset the demo rebate store (tests). */
export function resetLeadRebateStore(): void {
  STORE.seq = 0;
  STORE.rebates = [];
}

/** Record a rebate in the demo store (idempotent per booking, like the row). */
export function demoRecordLeadRebate(rebate: Omit<LeadRebate, "id">): LeadRebate | null {
  if (STORE.rebates.some((r) => r.bookingId === rebate.bookingId)) return null;
  STORE.seq += 1;
  const entry: LeadRebate = { ...rebate, id: `lreb-${STORE.seq}` };
  STORE.rebates.push(entry);
  return entry;
}


/* ─────────────────────────────── Resolution ─────────────────────────────── */

/**
 * Price the rebate for one completed booking. Returns null when there is
 * nothing to rebate — no lead, no purchase, the feature off, or a zero result —
 * so callers can treat null as "charge the stamped fee in full".
 *
 * `purchasedOffer` lets the Prisma adapter pass the offer it read INSIDE its
 * transaction (so the attribution and the write share one isolation boundary);
 * omit it and the demo store (or a fresh read) is used.
 */
export async function resolveLeadRebate(input: {
  bookingId: string;
  workerId: string;
  /** The QuoteRequest this job came from (null for a direct booking). */
  leadId?: string | null;
  /** The fee stamped on the job, minor units. */
  feeMinor: number;
  currency?: string;
  at?: string;
  ruleSet?: FeeRuleSet;
  purchasedOffer?: PurchasedLead | null;
}): Promise<LeadRebateResolution | null> {
  if (!input.leadId) return null;
  const feeMinor = Math.max(0, Math.trunc(input.feeMinor));
  if (feeMinor === 0) return null;

  const ruleSet = input.ruleSet ?? (await loadActiveFeeRuleSet());
  const config = leadMarketConfig(ruleSet).rebate;
  if (!config.enabled) return null;

  const offer =
    input.purchasedOffer ??
    (realLeadRebateDataEnabled()
      ? await (await import("./lead-rebate-prisma")).prismaFindPurchasedLeadOffer(input.workerId, input.leadId)
      : purchasedLeadOfferSync(input.workerId, input.leadId));
  if (!offer) return null;

  return priceLeadRebate({ config, offer, bookingId: input.bookingId, workerId: input.workerId, feeMinor, ruleSet, currency: input.currency, at: input.at });
}

/** The pure-ish half: price it and shape the record (no I/O). */
export function priceLeadRebate(input: {
  config: LeadRebateConfig;
  offer: PurchasedLead;
  bookingId: string;
  workerId: string;
  feeMinor: number;
  ruleSet: FeeRuleSet;
  currency?: string;
  at?: string;
  id?: string;
}): LeadRebateResolution | null {
  const leadCostMinor = Math.max(0, Math.trunc(input.offer.priceCredits)) * 100;
  const { rebateMinor, effectiveFeeMinor, limitedBy } = leadRebateFor({
    config: input.config,
    leadCostMinor,
    feeMinor: input.feeMinor,
  });
  if (rebateMinor <= 0) return null;
  return {
    rebate: {
      id: input.id ?? `lreb-${input.bookingId}`,
      bookingId: input.bookingId,
      leadId: input.offer.leadId,
      offerId: input.offer.offerId,
      workerId: input.workerId,
      leadCostCredits: input.offer.priceCredits,
      leadCostMinor,
      feeMinor: input.feeMinor,
      rebateMinor,
      effectiveFeeMinor,
      pctBps: input.config.pctBps,
      maxMinor: input.config.maxMinor,
      limitedBy,
      ruleId: input.ruleSet.id,
      ruleVersion: input.ruleSet.version,
      currency: input.currency ?? input.ruleSet.currency,
      createdAt: input.at ?? new Date().toISOString(),
    },
    creditMinor: rebateMinor,
  };
}

/** Persist a rebate in real mode (inside the caller's transaction). */
export async function saveLeadRebate(rebate: LeadRebate): Promise<LeadRebate> {
  return (await import("./lead-rebate-prisma")).prismaSaveLeadRebate(rebate);
}

/* ──────────────────────────────── Reads ──────────────────────────────── */

/** Recent rebates, newest first (admin audit list). */
export async function listLeadRebates(limit = 50): Promise<LeadRebate[]> {
  if (realLeadRebateDataEnabled()) return (await import("./lead-rebate-prisma")).prismaListLeadRebates(limit);
  return [...STORE.rebates]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.trunc(limit)));
}

/** One booking's rebate, when it had one. */
export async function getLeadRebateForBooking(bookingId: string): Promise<LeadRebate | null> {
  if (realLeadRebateDataEnabled()) return (await import("./lead-rebate-prisma")).prismaGetLeadRebateForBooking(bookingId);
  return STORE.rebates.find((r) => r.bookingId === bookingId) ?? null;
}

/** A worker's rebates — the "what did my leads give back?" list. */
export async function getWorkerLeadRebates(workerId: string, limit = 50): Promise<LeadRebate[]> {
  const rows = await listLeadRebates(Math.max(limit * 4, 200));
  return rows.filter((r) => r.workerId === workerId).slice(0, Math.max(1, Math.trunc(limit)));
}

/** Per-lead rebate totals (the lead board marks a lead that paid for itself). */
export async function leadRebateTotalsByLead(limit = 200): Promise<Record<string, { rebateMinor: number; count: number }>> {
  const rows = await listLeadRebates(limit);
  const totals: Record<string, { rebateMinor: number; count: number }> = {};
  for (const row of rows) {
    const current = totals[row.leadId] ?? { rebateMinor: 0, count: 0 };
    totals[row.leadId] = { rebateMinor: current.rebateMinor + row.rebateMinor, count: current.count + 1 };
  }
  return totals;
}

/** Aggregate for the admin panel: how much of the fee the rebate has given back. */
export async function leadRebateSummary(): Promise<{
  count: number;
  rebateMinor: number;
  feeMinor: number;
  effectiveFeeMinor: number;
}> {
  const rows = await listLeadRebates(500);
  return rows.reduce(
    (sum, row) => ({
      count: sum.count + 1,
      rebateMinor: sum.rebateMinor + row.rebateMinor,
      feeMinor: sum.feeMinor + row.feeMinor,
      effectiveFeeMinor: sum.effectiveFeeMinor + row.effectiveFeeMinor,
    }),
    { count: 0, rebateMinor: 0, feeMinor: 0, effectiveFeeMinor: 0 }
  );
}
