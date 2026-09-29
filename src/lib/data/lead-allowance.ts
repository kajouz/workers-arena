/**
 * ────────────────────────────────────────────────────────────────────────────
 * MONTHLY LEAD ALLOWANCE — the plans' "free leads" paid out as credits
 * ────────────────────────────────────────────────────────────────────────────
 * Every plan promises a number of leads a month (`includedLeads` in the
 * admin-editable plan catalog). The promise is honoured as platform credits:
 * once per calendar month (UTC) a worker with an active plan — trials
 * included — is granted `includedLeads × the bronze lead price` credits, so
 * "3 leads a month" buys exactly three standard leads, or fewer richer ones.
 *
 * Use it or lose it: allowance credits are spent before purchased ones, and
 * when the next month's allowance is granted, whatever is left of the previous
 * one expires. Purchased credits never expire. Without that, an unused
 * allowance would pile up month after month.
 *
 * Every write is keyed on the ledger's (workerId, promotionId) unique index —
 * `lead-allowance:YYYY-MM` for the grant, `lead-allowance-expiry:YYYY-MM` for
 * the expiry — so a re-run cron, or a confirm and a cron on the same day, can
 * never double-grant or double-expire.
 *
 * PURE: no store, no clock. The runner (lead-allowance-run.ts) feeds it.
 */

import type { SubscriptionPlan } from "./types";

export const ALLOWANCE_GRANT_PREFIX = "lead-allowance:";
export const ALLOWANCE_EXPIRY_PREFIX = "lead-allowance-expiry:";

/** "YYYY-MM" (UTC) for a timestamp. */
export function allowanceMonth(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** The month before a "YYYY-MM" key. */
export function previousAllowanceMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return allowanceMonth(Date.UTC(y, m - 2, 1));
}

/** Credits a plan's monthly lead allowance is worth. Unlimited or unset → 0
 * (an unlimited promise cannot be paid out as a finite credit grant). */
export function monthlyAllowanceCredits(includedLeads: number, leadPriceCredits: number): number {
  if (!Number.isFinite(includedLeads) || includedLeads <= 0) return 0;
  if (!Number.isFinite(leadPriceCredits) || leadPriceCredits <= 0) return 0;
  return Math.trunc(includedLeads) * Math.trunc(leadPriceCredits);
}

/** A plan is active while it is not expired and its end date is ahead. */
export function planIsActive(subscription: { status: string; expiresAt: string }, nowMs: number): boolean {
  const expires = Date.parse(subscription.expiresAt);
  return subscription.status !== "expired" && Number.isFinite(expires) && expires > nowMs;
}

/** What the ledger says about a worker's allowance, as of now. */
export interface AllowanceLedgerFacts {
  /** Last month's allowance grant (0 = none). */
  previousGrant: number;
  /** Credits spent in last month AFTER that grant landed. */
  spentAfterPreviousGrant: number;
  /** The balance at the end of last month. */
  balanceAtPreviousMonthEnd: number;
  /** Last month's leftover has already been expired. */
  previousExpired: boolean;
  /** This month's allowance is already in. */
  currentGranted: boolean;
  /** The balance right now. */
  balance: number;
}

/**
 * What expires of last month's allowance: the part of it left unspent at the
 * month's end. Allowance credits are spent first, so that is the grant minus
 * what was spent after it — never more than the balance was at the month's end
 * (nor than it is now). Derived from last month's rows only, so a run on the
 * 1st and a run on the 20th agree: credits bought this month are never touched.
 */
export function allowanceExpiry(facts: Omit<AllowanceLedgerFacts, "previousExpired" | "currentGranted">): number {
  const unspent = Math.trunc(facts.previousGrant) - Math.trunc(facts.spentAfterPreviousGrant);
  return Math.max(0, Math.min(unspent, Math.trunc(facts.balanceAtPreviousMonthEnd), Math.trunc(facts.balance)));
}

export interface AllowanceWorker {
  id: string;
  subscription: { plan: SubscriptionPlan; status: string; expiresAt: string };
}

export interface AllowanceAction {
  workerId: string;
  /** Credits to expire from last month's allowance (0 = none). */
  expire: number;
  /** Credits to grant for this month (0 = none). */
  grant: number;
  plan?: SubscriptionPlan;
}

/**
 * Decide one worker's allowance moves for the month of `nowMs`.
 *
 * Expiry runs whether or not the plan is still active (a lapsed worker's
 * leftover allowance expires too); the grant only for an active plan.
 */
export function allowanceActionFor(
  worker: AllowanceWorker,
  ledger: AllowanceLedgerFacts,
  includedLeadsFor: (plan: SubscriptionPlan) => number,
  leadPriceCredits: number,
  nowMs: number
): AllowanceAction {
  const expire = ledger.previousGrant > 0 && !ledger.previousExpired ? allowanceExpiry(ledger) : 0;
  const grant =
    !ledger.currentGranted && planIsActive(worker.subscription, nowMs)
      ? monthlyAllowanceCredits(includedLeadsFor(worker.subscription.plan), leadPriceCredits)
      : 0;
  return { workerId: worker.id, expire, grant, ...(grant > 0 ? { plan: worker.subscription.plan } : {}) };
}
