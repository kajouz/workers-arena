/**
 * ────────────────────────────────────────────────────────────────────────────
 * PAYING FROM THE WALLET — revenue plan Step 2, part 2
 * ────────────────────────────────────────────────────────────────────────────
 * The prepaid wallet is the PAID credit pot (credit-ledger.ts): money a worker
 * topped up through OMT/Whish, 1 credit = $1. This module spends it on:
 *
 *  • purchases — a plan renewal, verification, featured slot or emergency
 *    marker, paid in-app instead of at an OMT agent (payPurchaseFromWallet);
 *  • auto-renewal — a plan ending within a day renews itself when the wallet
 *    covers it, unless the worker switched auto-renew off (runWalletAutoRenew);
 *  • commission on cash jobs — a job settled in cash leaves the platform fee as
 *    a claim; the claim is collected from the wallet (collectFeeClaims).
 *
 * Free credits never pay for any of these (the "paid" fund on every debit).
 * Every charge is keyed in the ledger, so a re-run or an overlapping run can
 * never charge twice; a charge whose purchase then fails to activate is
 * refunded to the wallet.
 *
 * A wallet payment is a Payment row with method WALLET and no provider: it is
 * not new cash (the top-up was), so the manual-payment queue and revenue
 * reconciliation never count it.
 */

import {
  cancelPendingPurchase,
  confirmPurchase,
  createPurchaseCheckout,
  getPendingManualPayments,
  recordFeeClaimCollection,
} from "./repo";
import { getWorkerCreditBalance, grantCredits, spendCredits } from "./credit-ledger";
import { feeClaimPlan, type Settlement } from "./booking-settlement";
import type { BillingPeriod, SubscriptionPlan, Worker } from "./types";
import type { VerificationTier } from "./purchases";

export type WalletPurchaseScope = "subscription" | "verification" | "featured" | "emergency";

export type WalletPayResult =
  | { ok: true; paymentId: string; credits: number }
  | { ok: false; error: "invalid" | "insufficient" | "already-charged" | "failed" };

/**
 * Pay a purchase from the wallet: mint a WALLET payment at the checkout price
 * (rounded down to whole dollars), debit the paid pot, then confirm it — the
 * same confirm an admin runs for OMT/Whish, so the plan/badge activates and
 * the invoice is minted exactly as for a manual payment.
 *
 * `chargeKey` makes the debit idempotent across runs (auto-renew passes one
 * per plan period); by default the key is the payment itself.
 */
export async function payPurchaseFromWallet(input: {
  worker: Pick<Worker, "id" | "slug">;
  scope: WalletPurchaseScope;
  plan?: SubscriptionPlan;
  period?: BillingPeriod;
  tier?: VerificationTier;
  chargeKey?: string;
  by?: string;
}): Promise<WalletPayResult> {
  const created = await createPurchaseCheckout({
    workerSlug: input.worker.slug,
    scope: input.scope,
    plan: input.plan,
    period: input.period,
    tier: input.tier,
    method: "WALLET",
  });
  if (!created) return { ok: false, error: "invalid" };

  const credits = created.amountMinor / 100;
  const key = input.chargeKey ?? `wallet:${created.paymentId}`;
  const charged = await spendCredits({
    workerId: input.worker.id,
    amount: credits,
    fund: "paid",
    promotionId: key,
    reason: `Paid from wallet: ${input.scope}${input.plan ? ` (${input.plan})` : ""}${input.tier ? ` (${input.tier})` : ""}`,
  });
  if (!charged.ok) {
    await cancelPendingPurchase(created.paymentId);
    return { ok: false, error: charged.error === "already-charged" ? "already-charged" : "insufficient" };
  }

  const confirmed = await confirmPurchase(created.paymentId, `WALLET-${created.paymentId}`, { by: input.by ?? "Wallet" });
  if (!confirmed) {
    // Never keep money for something that did not activate.
    await grantCredits({
      workerId: input.worker.id,
      amount: credits,
      kind: "adjustment",
      fund: "paid",
      reason: `Refund: wallet payment ${created.paymentId} could not be applied`,
      promotionId: `wallet-refund:${key}`,
    });
    await cancelPendingPurchase(created.paymentId);
    return { ok: false, error: "failed" };
  }

  // A renewal paid from the wallet supersedes an unpaid OMT/Whish renewal the
  // worker started earlier, so an admin can never confirm a second one.
  if (input.scope === "subscription") {
    const stale = (await getPendingManualPayments()).filter(
      (p) => p.scope === "subscription" && p.workerSlug === input.worker.slug
    );
    for (const p of stale) await cancelPendingPurchase(p.id);
  }
  return { ok: true, paymentId: created.paymentId, credits };
}

/* ─────────────────────────────── Auto-renew ─────────────────────────────── */

/** A plan is renewed from the wallet from a day before it ends... */
export const AUTO_RENEW_LEAD_MS = 24 * 60 * 60 * 1000;
/** ...until three days after (a missed daily run still catches it). */
export const AUTO_RENEW_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether a subscription is due for a wallet auto-renew at `nowMs`. Pure. */
export function autoRenewDue(
  subscription: { autoRenew?: boolean; expiresAt: string },
  nowMs: number
): boolean {
  if (subscription.autoRenew === false) return false;
  const expires = Date.parse(subscription.expiresAt);
  if (!Number.isFinite(expires)) return false;
  return expires - nowMs <= AUTO_RENEW_LEAD_MS && nowMs - expires <= AUTO_RENEW_GRACE_MS;
}

export interface AutoRenewRun {
  due: number;
  renewed: number;
  /** Due, but the wallet did not cover the plan — the reminders take over. */
  insufficient: number;
}

/**
 * Renew every due plan the wallet covers, at the same plan and period. Keyed
 * on the plan's end date, so each period is charged at most once however many
 * times this runs.
 */
export async function runWalletAutoRenew(
  workers: Array<Pick<Worker, "id" | "slug" | "subscription">>,
  now = Date.now()
): Promise<AutoRenewRun> {
  const run: AutoRenewRun = { due: 0, renewed: 0, insufficient: 0 };
  for (const worker of workers) {
    if (!autoRenewDue(worker.subscription, now)) continue;
    run.due += 1;
    try {
      const result = await payPurchaseFromWallet({
        worker,
        scope: "subscription",
        plan: worker.subscription.plan,
        period: worker.subscription.period ?? "monthly",
        chargeKey: `autorenew:${worker.id}:${worker.subscription.expiresAt}`,
        by: "Auto-renew (wallet)",
      });
      if (result.ok) run.renewed += 1;
      else if (result.error === "insufficient") run.insufficient += 1;
    } catch (err) {
      console.error(`[wallet] auto-renew failed for ${worker.id}:`, err);
    }
  }
  return run;
}

/* ─────────────────────────── Commission on cash jobs ─────────────────────────── */

export interface FeeClaimJob {
  bookingId: string;
  number: string;
  workerId: string;
  settlement: Pick<Settlement, "state" | "feeClaimCollectedMinor" | "feeClaimOutstandingMinor">;
}

/**
 * The part of an outstanding claim the wallet can pay now, in whole credits.
 * Rounded DOWN to whole dollars so a worker is never charged more than the
 * claim (a sub-dollar remainder stays outstanding for the admin). Pure.
 */
export function feeClaimCharge(outstandingMinor: number, paidBalance: number) {
  return feeClaimPlan(Math.floor(Math.max(0, outstandingMinor) / 100) * 100, paidBalance);
}

/**
 * Collect outstanding commission on cash-settled jobs from each worker's
 * wallet. Keyed on (job, amount already collected), and recorded on the job
 * with a compare-and-swap; if the record loses a race, the debit is refunded.
 */
export async function collectFeeClaims(jobs: FeeClaimJob[]): Promise<{ jobs: number; collectedMinor: number }> {
  const result = { jobs: 0, collectedMinor: 0 };
  for (const job of jobs) {
    const s = job.settlement;
    if (s.state !== "outside-platform" || s.feeClaimOutstandingMinor <= 0) continue;
    try {
      const { paidBalance } = await getWorkerCreditBalance(job.workerId);
      const charge = feeClaimCharge(s.feeClaimOutstandingMinor, paidBalance);
      if (charge.debitCredits <= 0) continue;
      const key = `feeclaim:${job.bookingId}:${s.feeClaimCollectedMinor}`;
      const spent = await spendCredits({
        workerId: job.workerId,
        amount: charge.debitCredits,
        fund: "paid",
        promotionId: key,
        reason: `Commission on job ${job.number} (paid in cash)`,
      });
      if (!spent.ok) continue;
      const recorded = await recordFeeClaimCollection(job.bookingId, s.feeClaimCollectedMinor, charge.debitMinor);
      if (!recorded) {
        await grantCredits({
          workerId: job.workerId,
          amount: charge.debitCredits,
          kind: "adjustment",
          fund: "paid",
          reason: `Refund: commission on job ${job.number} was already collected`,
          promotionId: `feeclaim-refund:${key}`,
        });
        continue;
      }
      result.jobs += 1;
      result.collectedMinor += charge.debitMinor;
    } catch (err) {
      console.error(`[wallet] fee claim collection failed for ${job.bookingId}:`, err);
    }
  }
  return result;
}
