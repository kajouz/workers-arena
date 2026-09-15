/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLATFORM CREDIT LEDGER — the honest half of §20 (prepaid worker credits)
 * ────────────────────────────────────────────────────────────────────────────
 * The promotion engine can promise "+50 credits with your plan this month".
 * This module is what makes that promise real: an APPEND-ONLY ledger of whole
 * platform credits per worker, with a derived balance — never a stored number
 * that can drift from its history.
 *
 * Scope, deliberately small for this wave:
 *   • kinds: grant | spend | expire | adjustment (signed amounts)
 *   • the only writer TODAY is the promotion grant at plan purchase/renewal
 *     (§5 campaigns → §24 promotions), idempotent per (worker, promotion)
 *   • spending them (leads, featured placement, ads, fee settlement) arrives
 *     with the lead marketplace / §21 cash settlement — this ledger is the
 *     account those features will debit
 *
 * Money-like discipline, even though these are credits and not currency:
 * balances are DERIVED from the entries, entries are never updated or deleted,
 * and every grant leaves an audit row (who/what/why, with the promotion id).
 * The `revenue-settings.ts` "credits" stream remains a catalog/pricing facade —
 * it describes packages; THIS module is the account.
 */

import { promotionBonusFor, type FeePromotion } from "./fee-rules";
import { loadActiveFeeRuleSet } from "./fee-rules-store";

export type CreditEntryKind = "grant" | "spend" | "expire" | "adjustment";

/** One immutable ledger row. `amount` is SIGNED whole credits (grants +,
 * spends/expiries −), and `balanceAfter` snapshots the running balance. */
export interface CreditLedgerEntry {
  id: string;
  workerId: string;
  kind: CreditEntryKind;
  amount: number;
  balanceAfter: number;
  reason: string;
  promotionId?: string;
  /** The lead offer this entry paid for (a spend) — also its idempotency key,
   * so a retried purchase can never double-charge. */
  offerId?: string;
  createdBy?: string;
  createdAt: string;
}

/** A worker's credit position, derived from their entries. */
export interface WorkerCreditBalance {
  workerId: string;
  /** Spendable platform credits (never negative). */
  balance: number;
  /** Lifetime credits granted (promotions, adjustments, purchases). */
  granted: number;
  /** Lifetime credits consumed. */
  spent: number;
  /** Lifetime credits returned by a positive admin ADJUSTMENT (a refund or a
   * correction), reported separately from promotions so a worker can tell
   * "we gave you credits" apart from "we put credits back". */
  refunded: number;
  /** ISO of the most recent entry, when there is one. */
  lastActivityAt?: string;
}

/** Derive a balance from a worker's entries (oldest → newest). Pure. */
export function creditBalanceFrom(entries: CreditLedgerEntry[]): WorkerCreditBalance {
  let granted = 0;
  let spent = 0;
  let refunded = 0;
  let last: string | undefined;
  for (const entry of entries) {
    if (entry.amount >= 0) granted += entry.amount;
    else spent += -entry.amount;
    if (entry.amount > 0 && entry.kind === "adjustment") refunded += entry.amount;
    if (!last || entry.createdAt > last) last = entry.createdAt;
  }
  // Balance is the SUM of the signed amounts — the same definition the payout
  // ledger uses, so a reversed/expired grant reduces it without rewriting rows.
  const balance = entries.reduce((sum, e) => sum + e.amount, 0);
  return {
    workerId: entries[0]?.workerId ?? "",
    balance: Math.max(0, balance),
    granted,
    spent,
    refunded,
    ...(last ? { lastActivityAt: last } : {}),
  };
}

export interface GrantCreditsInput {
  workerId: string;
  amount: number;
  kind?: CreditEntryKind;
  reason: string;
  promotionId?: string;
  offerId?: string;
  createdBy?: string;
  /** ISO stamp (defaults to now; pass it for deterministic tests). */
  at?: string;
}

/** Result of a debit: the entry, or the reason it could not be charged. */
export type SpendCreditsResult =
  | { ok: true; entry: CreditLedgerEntry }
  | { ok: false; error: "insufficient-credits" | "already-charged" | "invalid-amount" };

/** Idempotency key of an entry: whichever reference it carries. */
function entryKey(entry: Pick<CreditLedgerEntry, "workerId" | "promotionId" | "offerId">): string | null {
  if (entry.promotionId) return `${entry.workerId}:promo:${entry.promotionId}`;
  if (entry.offerId) return `${entry.workerId}:offer:${entry.offerId}`;
  return null;
}

/* ───────────────────────────── Adapter selection ───────────────────────────── */

/** Mirrors the fee-rule store's gate (and repo.ts): real data needs both. */
function realCreditDataEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

function creditPrisma() {
  return import("./credit-ledger-prisma");
}

/* ───────────────────────────── Demo (globalThis) ───────────────────────────── */

interface CreditStore {
  seq: number;
  entries: CreditLedgerEntry[];
}

const GLOBAL_KEY = "__workersArenaCreditLedger";
const g = globalThis as Record<string, unknown>;
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;
const STORE: CreditStore =
  (g[GLOBAL_KEY] as CreditStore | undefined) ?? (g[GLOBAL_KEY] = { seq: 0, entries: [] } as CreditStore);

if (FIRST_INSTANCE) {
  STORE.seq = 0;
  STORE.entries = [];
}

/** Reset the demo ledger (tests). */
export function resetCreditLedgerStore(): void {
  STORE.seq = 0;
  STORE.entries = [];
}

function demoEntriesFor(workerId: string): CreditLedgerEntry[] {
  return STORE.entries
    .filter((e) => e.workerId === workerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Append a credit entry in the demo ledger. Returns null for a no-op amount.
 * A `promotionId` makes the grant idempotent per worker (one bonus per
 * campaign), mirroring the DB's unique constraint. */
export function demoGrantCredits(input: GrantCreditsInput): CreditLedgerEntry | null {
  const amount = Math.trunc(input.amount);
  if (!amount) return null;
  const key = entryKey({ workerId: input.workerId, promotionId: input.promotionId, offerId: input.offerId });
  if (key) {
    const existing = STORE.entries.find((e) => entryKey(e) === key);
    if (existing) return existing; // one entry per reference (no double grant/charge)
  }
  const before = creditBalanceFrom(demoEntriesFor(input.workerId));
  const entry: CreditLedgerEntry = {
    id: `cred-${(STORE.seq += 1)}`,
    workerId: input.workerId,
    kind: input.kind ?? "grant",
    amount,
    balanceAfter: before.balance + amount,
    reason: input.reason,
    ...(input.promotionId ? { promotionId: input.promotionId } : {}),
    ...(input.offerId ? { offerId: input.offerId } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    createdAt: input.at ?? new Date().toISOString(),
  };
  STORE.entries.push(entry);
  return entry;
}

/* ─────────────────────────────── Public API ─────────────────────────────── */

/** Append a ledger entry (idempotent when a promotion id is supplied). */
export async function grantCredits(input: GrantCreditsInput): Promise<CreditLedgerEntry | null> {
  if (realCreditDataEnabled()) return (await creditPrisma()).prismaGrantCredits(input);
  return demoGrantCredits(input);
}

/**
 * Debit credits. The guard is the point: a purchase that cannot be paid for
 * must NOT half-happen, so this returns a refusal instead of writing a
 * negative-balance row — callers treat a refusal as a failed purchase.
 *
 * An `offerId` makes the debit idempotent: retrying the same purchase returns
 * the ORIGINAL entry (already-charged) rather than charging again.
 */
export async function spendCredits(input: {
  workerId: string;
  amount: number;
  reason: string;
  offerId?: string;
  at?: string;
}): Promise<SpendCreditsResult> {
  const amount = Math.trunc(input.amount);
  if (amount <= 0) return { ok: false, error: "invalid-amount" };
  if (input.offerId) {
    const existing = (await listCreditLedger(200, input.workerId)).find((e) => e.offerId === input.offerId);
    if (existing) return { ok: false, error: "already-charged" };
  }
  const balance = await getWorkerCreditBalance(input.workerId);
  if (balance.balance < amount) return { ok: false, error: "insufficient-credits" };
  const entry = await grantCredits({ ...input, amount: -amount, kind: "spend" });
  if (!entry) return { ok: false, error: "invalid-amount" };
  return { ok: true, entry };
}

/** A worker's derived credit balance. */
export async function getWorkerCreditBalance(workerId: string): Promise<WorkerCreditBalance> {
  if (realCreditDataEnabled()) return (await creditPrisma()).prismaGetWorkerCreditBalance(workerId);
  const balance = creditBalanceFrom(demoEntriesFor(workerId));
  return { ...balance, workerId };
}

/** Ledger rows, newest first (admin audit list; optionally one worker's). */
export async function listCreditLedger(limit = 50, workerId?: string): Promise<CreditLedgerEntry[]> {
  if (realCreditDataEnabled()) return (await creditPrisma()).prismaListCreditLedger(limit, workerId);
  const rows = workerId ? demoEntriesFor(workerId) : [...STORE.entries];
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.trunc(limit)));
}

export { entryKey as creditEntryKey };

/**
 * THE grant path for §5/§24 promotions: when a worker buys (or renews) a plan,
 * reward any live campaign that promises a credit bonus. Idempotent per
 * (worker, promotion), so a re-confirmed payment can never double-grant.
 *
 * Returns the ledger entry, or null when no campaign applies. Never throws —
 * a bonus must not be able to break the purchase it rides on.
 */
export async function applyPromotionCreditGrant(input: {
  workerId: string;
  plan?: string | null;
  at?: string;
  createdBy?: string;
  /** Rule set override (tests / callers that already loaded it). */
  promotions?: FeePromotion[];
}): Promise<CreditLedgerEntry | null> {
  try {
    const promotions = input.promotions ?? (await loadActiveFeeRuleSet()).promotions;
    const match = promotionBonusFor(promotions, { plan: input.plan, at: input.at });
    if (!match) return null;
    return await grantCredits({
      workerId: input.workerId,
      amount: match.credits,
      kind: "grant",
      reason: `Promotion “${match.promotion.label}” — plan purchase bonus`,
      promotionId: match.promotion.id,
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      ...(input.at ? { at: input.at } : {}),
    });
  } catch (error) {
    console.error("[credits] promotion grant failed", error);
    return null;
  }
}
