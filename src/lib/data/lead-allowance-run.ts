/**
 * Monthly lead allowance — the runner. Reads the plan catalog and the lead
 * price in force, each worker's credit ledger, and applies the pure decisions
 * of lead-allowance.ts: expire last month's unspent allowance, then grant this
 * month's. Run daily by /api/cron/lead-allowance, and for one worker right
 * after a plan payment is confirmed so the credits land at once.
 */

import { grantCredits, listCreditLedger, type CreditLedgerEntry } from "./credit-ledger";
import { loadActiveFeeRuleSet } from "./fee-rules-store";
import { leadMarketConfig } from "./lead-market";
import { normalizePlanCatalogOverrides } from "./plan-catalog-overrides";
import { getPlanCatalog } from "./subscription-plans";
import {
  ALLOWANCE_EXPIRY_PREFIX,
  ALLOWANCE_GRANT_PREFIX,
  allowanceActionFor,
  allowanceMonth,
  previousAllowanceMonth,
  type AllowanceLedgerFacts,
  type AllowanceWorker,
} from "./lead-allowance";

export interface LeadAllowanceRun {
  month: string;
  workersGranted: number;
  creditsGranted: number;
  workersExpired: number;
  creditsExpired: number;
}

/** Derive the allowance facts from one worker's ledger rows. */
export function allowanceFactsFrom(entries: CreditLedgerEntry[], month: string): AllowanceLedgerFacts {
  const previous = previousAllowanceMonth(month);
  const monthStart = `${month}-01T00:00:00.000Z`;
  const grant = entries.find((e) => e.promotionId === `${ALLOWANCE_GRANT_PREFIX}${previous}`);
  const sum = (rows: CreditLedgerEntry[]) => rows.reduce((total, e) => total + e.amount, 0);
  return {
    previousGrant: grant?.amount ?? 0,
    spentAfterPreviousGrant: grant
      ? -sum(entries.filter((e) => e.kind === "spend" && e.createdAt >= grant.createdAt && e.createdAt < monthStart))
      : 0,
    balanceAtPreviousMonthEnd: sum(entries.filter((e) => e.createdAt < monthStart)),
    previousExpired: entries.some((e) => e.promotionId === `${ALLOWANCE_EXPIRY_PREFIX}${previous}`),
    currentGranted: entries.some((e) => e.promotionId === `${ALLOWANCE_GRANT_PREFIX}${month}`),
    balance: sum(entries),
  };
}

/**
 * Apply this month's allowance moves to the given workers. Idempotent: the
 * ledger's (worker, promotionId) key makes every write once-only, so running
 * it twice the same day — or from the cron and a payment confirm — is safe.
 * One worker's failure never stops the others.
 */
export async function runMonthlyLeadAllowance(workers: AllowanceWorker[], now = Date.now()): Promise<LeadAllowanceRun> {
  const month = allowanceMonth(now);
  const previous = previousAllowanceMonth(month);
  const ruleSet = await loadActiveFeeRuleSet();
  const catalog = normalizePlanCatalogOverrides(ruleSet.planCatalog);
  const leadPrice = leadMarketConfig(ruleSet).prices.bronze;
  const at = new Date(now).toISOString();
  const run: LeadAllowanceRun = { month, workersGranted: 0, creditsGranted: 0, workersExpired: 0, creditsExpired: 0 };

  for (const worker of workers) {
    try {
      const entries = await listCreditLedger(1000, worker.id);
      const action = allowanceActionFor(
        worker,
        allowanceFactsFrom(entries, month),
        (plan) => catalog.plans[plan]?.includedLeads ?? 0,
        leadPrice,
        now
      );
      if (action.expire > 0) {
        const entry = await grantCredits({
          workerId: worker.id,
          amount: -action.expire,
          kind: "expire",
          reason: `Unused monthly lead credits from ${previous} expired`,
          promotionId: `${ALLOWANCE_EXPIRY_PREFIX}${previous}`,
          at,
        });
        if (entry) {
          run.workersExpired += 1;
          run.creditsExpired += action.expire;
        }
      }
      if (action.grant > 0 && action.plan) {
        const entry = await grantCredits({
          workerId: worker.id,
          amount: action.grant,
          kind: "grant",
          reason: `Monthly lead credits — ${getPlanCatalog(action.plan).labelEn} plan (${month})`,
          promotionId: `${ALLOWANCE_GRANT_PREFIX}${month}`,
          at,
        });
        if (entry) {
          run.workersGranted += 1;
          run.creditsGranted += action.grant;
        }
      }
    } catch (err) {
      console.error(`[lead-allowance] worker ${worker.id} failed:`, err);
    }
  }
  return run;
}

/** Grant one worker's allowance now (after a plan payment is confirmed). Never
 * throws — the allowance must not be able to break the purchase it rides on. */
export async function grantLeadAllowanceNow(worker: AllowanceWorker, now = Date.now()): Promise<void> {
  try {
    await runMonthlyLeadAllowance([worker], now);
  } catch (err) {
    console.error("[lead-allowance] immediate grant failed:", err);
  }
}
