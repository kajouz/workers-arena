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

/**
 * The prepaid wallet's two pots (revenue plan Step 2). PAID credits are money
 * the worker topped up (1 credit = $1) and pay for anything on the platform;
 * FREE credits were given (allowance, promotions, referrals, pack bonuses) and
 * buy leads only. A row moves one pot — `any` is a lead purchase, which spends
 * free credits first, then paid. Wallet money is not withdrawable.
 */
export type CreditFund = "paid" | "free" | "any";

/** The pot a row moves when the caller does not say: debits of a lead
 * purchase draw from `any`, expiries from `free`, and grants land in `free`. */
export function defaultFund(kind: CreditEntryKind, amount: number): CreditFund {
  if (amount < 0) return kind === "expire" ? "free" : "any";
  return "free";
}

/** One immutable ledger row. `amount` is SIGNED whole credits (grants +,
 * spends/expiries −), and `balanceAfter` snapshots the running balance. */
export interface CreditLedgerEntry {
  id: string;
  workerId: string;
  kind: CreditEntryKind;
  /** The pot this row moves (see CreditFund); absent on rows written before
   * the wallet, which read through `defaultFund`. */
  fund?: CreditFund;
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
  /** Spendable platform credits (never negative) = paid + free. */
  balance: number;
  /** The wallet: topped-up money, spendable on anything. */
  paidBalance: number;
  /** Given credits, spendable on leads only. */
  freeBalance: number;
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

/**
 * Replay a worker's rows (oldest → newest) into the two pots. Credits land in
 * their row's pot; a `paid` debit draws from paid, a `free` debit (an expiry)
 * from free, and an `any` debit (a lead) from free first, then paid. A pot
 * never goes below zero — a debit larger than its pot is simply capped.
 */
export function creditFundsFrom(entries: CreditLedgerEntry[]): { paid: number; free: number } {
  let paid = 0;
  let free = 0;
  const ordered = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of ordered) {
    const fund = e.fund ?? defaultFund(e.kind, e.amount);
    if (e.amount >= 0) {
      if (fund === "paid") paid += e.amount;
      else free += e.amount;
      continue;
    }
    let debit = -e.amount;
    if (fund === "paid") {
      paid = Math.max(0, paid - debit);
    } else if (fund === "free") {
      free = Math.max(0, free - debit);
    } else {
      const fromFree = Math.min(free, debit);
      free -= fromFree;
      debit -= fromFree;
      paid = Math.max(0, paid - debit);
    }
  }
  return { paid, free };
}

/** Derive a balance from a worker's entries. Pure. */
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
  // The balance is still derived from the rows, never stored; the pots are a
  // replay of the same rows, so a reversed/expired grant reduces them without
  // rewriting anything.
  const funds = creditFundsFrom(entries);
  return {
    workerId: entries[0]?.workerId ?? "",
    balance: funds.paid + funds.free,
    paidBalance: funds.paid,
    freeBalance: funds.free,
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
  /** The pot this row moves; defaults by kind/sign (defaultFund). */
  fund?: CreditFund;
  reason: string;
  promotionId?: string;
  offerId?: string;
  createdBy?: string;
  /** ISO stamp (defaults to now; pass it for deterministic tests). */
  at?: string;
}

/**
 * What a confirmed wallet top-up grants: the pack's credits into the PAID pot
 * (money the worker paid — 1 credit = $1) and its bonus into the FREE pot
 * (promotional, leads only). Keyed on the payment, so re-confirming it can
 * never grant twice. A payment minted before packs were recorded falls back
 * to amount / 100 paid credits and no bonus.
 */
export function topUpGrantsFor(input: {
  workerId: string;
  paymentId: string;
  amountMinor: number;
  credits?: number;
  bonusCredits?: number;
  method?: string;
  createdBy?: string;
}): GrantCreditsInput[] {
  const paid = Math.max(0, Math.trunc(input.credits ?? input.amountMinor / 100));
  const bonus = Math.max(0, Math.trunc(input.bonusCredits ?? 0));
  const by = input.createdBy ? { createdBy: input.createdBy } : {};
  const grants: GrantCreditsInput[] = [];
  if (paid > 0) {
    grants.push({
      workerId: input.workerId,
      amount: paid,
      kind: "grant",
      fund: "paid",
      reason: `Credit top-up: $${paid} purchased (${input.method ?? "manual"})`,
      promotionId: `topup:${input.paymentId}`,
      ...by,
    });
  }
  if (bonus > 0) {
    grants.push({
      workerId: input.workerId,
      amount: bonus,
      kind: "grant",
      fund: "free",
      reason: `Top-up bonus: ${bonus} free lead credits`,
      promotionId: `topup-bonus:${input.paymentId}`,
      ...by,
    });
  }
  return grants;
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
    fund: input.fund ?? defaultFund(input.kind ?? "grant", amount),
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
  /** Idempotency key for a non-lead debit (e.g. a wallet payment). */
  promotionId?: string;
  /** "any" (default) = a lead: free credits first, then paid. "paid" = the
   * wallet only (renewals, upgrades, commission) — free credits never pay. */
  fund?: "any" | "paid";
  at?: string;
}): Promise<SpendCreditsResult> {
  const amount = Math.trunc(input.amount);
  if (amount <= 0) return { ok: false, error: "invalid-amount" };
  if (input.offerId) {
    const existing = (await listCreditLedger(200, input.workerId)).find((e) => e.offerId === input.offerId);
    if (existing) return { ok: false, error: "already-charged" };
  }
  if (input.promotionId) {
    const existing = (await listCreditLedger(1000, input.workerId)).find((e) => e.promotionId === input.promotionId);
    if (existing) return { ok: false, error: "already-charged" };
  }
  const fund = input.fund ?? "any";
  const balance = await getWorkerCreditBalance(input.workerId);
  const available = fund === "paid" ? balance.paidBalance : balance.balance;
  if (available < amount) return { ok: false, error: "insufficient-credits" };
  const entry = await grantCredits({ ...input, fund, amount: -amount, kind: "spend" });
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
