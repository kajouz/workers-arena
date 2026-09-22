/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING SETTLEMENT — what the platform actually collected for a job
 * ────────────────────────────────────────────────────────────────────────────
 * The take rate is only real money when the platform handled the money. Before
 * this engine existed, `creditEarnings` credited `quote − platformFee` to the
 * worker's withdrawable balance at COMPLETED regardless of whether the customer
 * had paid anything: on a quote-only job the platform accrued a payout it had
 * never received, and an approved payout paid it out of platform funds.
 *
 * This module is the single decision point for that question, and it is PURE —
 * every surface (both adapters' ledger credit, the customer's "pay to release"
 * card, the worker's settlement banner, the admin reconciliation) calls these
 * functions, so no two surfaces can disagree about whether a job is funded.
 *
 * The invariant it enforces, in one sentence:
 *
 *     the ledger never credits more than the platform has collected,
 *     and the fee is only ever taken out of money actually received.
 *
 * Money is MINOR units of `currency`, integers only — never floats.
 *
 * ── The four ways a job can end up ──────────────────────────────────────────
 *
 *   funded              collected ≥ quote → worker receives collected − fee.
 *                       This is the deposit job where the deposit covered the
 *                       whole quote: identical to the pre-engine behaviour.
 *
 *   part-funded         the deposit landed but the balance did not. The worker
 *                       is credited the collected part net of fee NOW (real
 *                       money, and holding it helps nobody) and the remainder
 *                       is credited when the settlement payment is confirmed.
 *                       Two ledger rows: the EARNING plus an ADJUSTMENT top-up
 *                       (`ledgerDeltaFor` decides which).
 *
 *   awaiting-customer / awaiting-confirmation
 *                       nothing collected yet. The customer is asked to settle
 *                       through WorkersArena (OMT/Whish manual rails) before the
 *                       worker can be paid — `settlementPendingMinor` is the
 *                       reference already issued and waiting on confirmation.
 *
 *   outside-platform    the parties settled directly (cash on the doorstep). The
 *                       platform collected nothing, so it credits nothing. Its
 *                       fee is a CLAIM (`feeClaimMinor`) — visible to admins,
 *                       collected against the worker's credit balance where one
 *                       exists (`feeClaimPlan`), never fabricated into the
 *                       earnings ledger.
 */

/** Where a job's money stands, as one word an admin can read at a glance. */
export type SettlementState =
  | "no-quote" // quote-less accept — there is no job value to collect
  | "funded" // collected ≥ quote: the worker's share is real money
  | "part-funded" // some collected, some outstanding
  | "awaiting-customer" // nothing collected, nothing requested yet
  | "awaiting-confirmation" // a manual reference is issued and unpaid
  | "outside-platform" // settled between the parties; the platform holds nothing
  | "overpaid"; // collected > quote (a double-paid deposit) — refund due

/** The payment facts the engine needs. All money in MINOR units. */
export interface SettlementFacts {
  /** The worker's price for the job (`Booking.quote`). Null = quote-less accept. */
  quoteMinor: number | null;
  /** The take-rate snapshot stamped at accept-with-quote (`Booking.platformFee`). */
  feeMinor: number | null;
  /** Deposit payment amount, and how much of it was refunded. */
  depositPaidMinor?: number | null;
  depositRefundedMinor?: number | null;
  /** Settlement payment amount, refunded part, and the pending (unconfirmed) part. */
  settlementPaidMinor?: number | null;
  settlementRefundedMinor?: number | null;
  settlementPendingMinor?: number | null;
  /** The worker (or an admin) declared the job settled directly between parties. */
  settledOutside?: boolean | null;
  /** How much of an outside-platform fee claim has been collected (credits). */
  feeClaimCollectedMinor?: number | null;
  currency?: string | null;
}

/** The engine's verdict on one booking. */
export interface Settlement {
  state: SettlementState;
  currency: string;
  /** The job value the platform is expected to handle (`quote`). */
  jobValueMinor: number;
  /** Money the platform actually holds for this job, net of refunds. */
  collectedMinor: number;
  /** jobValue − collected, floored at 0. */
  outstandingMinor: number;
  /** The stamped fee, as snapshot. */
  feeMinor: number;
  /** The part of the fee the platform may keep (never more than collected). */
  feeCollectedMinor: number;
  /** What the worker should have received from this job so far. */
  workerNetTargetMinor: number;
  /** Fee claimed on an outside-platform job — collectable, not accrued. */
  feeClaimMinor: number;
  /** The claimed part already collected (against the worker's credit balance). */
  feeClaimCollectedMinor: number;
  /** What is still collectable on an outside-platform job. */
  feeClaimOutstandingMinor: number;
  /** A short human-readable explanation, stored on the ledger row. */
  reason: string;
}

const int = (v: number | null | undefined): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
  return n > 0 ? n : 0;
};

/** Format minor units for a reason string ("$12.50"). */
function usd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/**
 * The verdict for one booking. Pure: same facts, same numbers.
 */
export function settlementFor(facts: SettlementFacts): Settlement {
  const currency = facts.currency ?? "USD";
  const jobValue = int(facts.quoteMinor);
  const fee = int(facts.feeMinor);

  // Money actually received and kept: gross paid minus refunded, per leg.
  const depositNet = Math.max(int(facts.depositPaidMinor) - int(facts.depositRefundedMinor), 0);
  const settlementNet = Math.max(int(facts.settlementPaidMinor) - int(facts.settlementRefundedMinor), 0);
  const collected = depositNet + settlementNet;
  const pending = int(facts.settlementPendingMinor);
  const outside = Boolean(facts.settledOutside);

  const base = {
    currency,
    jobValueMinor: jobValue,
    collectedMinor: collected,
    feeMinor: fee,
  };

  // Nothing to handle: a quote-less accept (the worker never named a price).
  if (jobValue <= 0) {
    return {
      ...base,
      state: "no-quote",
      outstandingMinor: 0,
      feeCollectedMinor: 0,
      workerNetTargetMinor: 0,
      feeClaimMinor: 0,
      feeClaimCollectedMinor: 0,
      feeClaimOutstandingMinor: 0,
      reason: "No quote on this job — nothing to collect.",
    };
  }

  // Declared settled between the parties: the platform holds nothing, so it
  // credits nothing and its fee becomes a claim rather than an accrual. The
  // claim can be collected tranche by tranche against the worker's credit
  // balance (`feeClaimPlan`), which is real money the platform already holds.
  if (outside) {
    const claimCollected = Math.min(int(facts.feeClaimCollectedMinor), fee);
    const claimOutstanding = Math.max(fee - claimCollected, 0);
    const collectedTail =
      claimCollected > 0
        ? ` Claim collected from credits: ${usd(claimCollected)}; ${usd(claimOutstanding)} still outstanding.`
        : ` Claim ${usd(fee)} outstanding.`;
    return {
      ...base,
      state: "outside-platform",
      outstandingMinor: Math.max(jobValue - collected, 0),
      feeCollectedMinor: 0,
      workerNetTargetMinor: 0,
      feeClaimMinor: fee,
      feeClaimCollectedMinor: claimCollected,
      feeClaimOutstandingMinor: claimOutstanding,
      reason:
        `Settled outside the platform — no earnings credited. Platform fee ${usd(fee)} recorded as a claim.` +
        collectedTail,
    };
  }

  // The fee can only come out of money the platform is holding.
  const feeCollected = Math.min(fee, collected);
  const workerNetTarget = Math.max(collected - feeCollected, 0);
  const outstanding = Math.max(jobValue - collected, 0);

  if (collected > jobValue) {
    return {
      ...base,
      state: "overpaid",
      outstandingMinor: 0,
      feeCollectedMinor: feeCollected,
      workerNetTargetMinor: workerNetTarget,
      feeClaimMinor: 0,
      feeClaimCollectedMinor: 0,
      feeClaimOutstandingMinor: 0,
      reason: `Over-collected by ${usd(collected - jobValue)} — refund due; fee ${usd(feeCollected)} retained.`,
    };
  }

  if (outstanding === 0) {
    return {
      ...base,
      state: "funded",
      outstandingMinor: 0,
      feeCollectedMinor: feeCollected,
      workerNetTargetMinor: workerNetTarget,
      feeClaimMinor: 0,
      feeClaimCollectedMinor: 0,
      feeClaimOutstandingMinor: 0,
      reason: `Funded — ${usd(collected)} collected, fee ${usd(feeCollected)} retained, ${usd(workerNetTarget)} to the worker.`,
    };
  }

  const state: SettlementState = collected > 0 ? "part-funded" : pending > 0 ? "awaiting-confirmation" : "awaiting-customer";
  const reason =
    collected > 0
      ? `${usd(collected)} collected of ${usd(jobValue)} — fee ${usd(feeCollected)} retained, ${usd(workerNetTarget)} to the worker; ${usd(outstanding)} outstanding.`
      : pending > 0
        ? `Awaiting settlement confirmation — ${usd(pending)} reference issued, nothing collected yet.`
        : `Nothing collected for a ${usd(jobValue)} job — awaiting the customer's settlement.`;

  return {
    ...base,
    state,
    outstandingMinor: outstanding,
    feeCollectedMinor: feeCollected,
    workerNetTargetMinor: workerNetTarget,
    feeClaimMinor: 0,
    feeClaimCollectedMinor: 0,
    feeClaimOutstandingMinor: 0,
    reason,
  };
}

/** True when the platform is holding money the worker has not been credited yet. */
export function settlementOwesWorker(s: Settlement): boolean {
  return s.workerNetTargetMinor > 0;
}

/** True when the job still needs money collected before it is fully settled. */
export function settlementNeedsCollection(s: Settlement): boolean {
  return s.state === "awaiting-customer" || s.state === "awaiting-confirmation" || s.state === "part-funded";
}

/** Can a payout be released for this booking? Only from money actually held. */
export function settlementPayable(s: Settlement): boolean {
  return s.state === "funded" || s.state === "part-funded" || s.state === "overpaid";
}

/**
 * What to POST to the worker's earnings ledger for this booking, given what has
 * already been credited for it.
 *
 * The ledger allows exactly one EARNING per booking (`@@unique([bookingId])`),
 * so a job that is topped up by a later settlement posts an ADJUSTMENT for the
 * difference — the worker's statement then reads "earning" then "settlement
 * balance", which is exactly what happened.
 *
 * Returns `{ amountMinor: 0, kind: null }` when there is nothing to post, so
 * callers can treat "no-op" and "already credited" identically.
 */
export function ledgerDeltaFor(
  s: Settlement,
  alreadyCreditedMinor: number
): { amountMinor: number; kind: "earning" | "adjustment" | null; reason: string } {
  const already = int(alreadyCreditedMinor);
  const delta = s.workerNetTargetMinor - already;
  if (delta <= 0) return { amountMinor: 0, kind: null, reason: s.reason };
  return { amountMinor: delta, kind: already === 0 ? "earning" : "adjustment", reason: s.reason };
}

/**
 * How much of an outside-platform fee claim the worker's credit balance can
 * absorb. Credits are the platform's prepaid currency, so spending them to
 * clear a fee claim collects real money the worker already paid for.
 *
 * `debitCredits` is what to spend now; `remainingMinor` stays a claim for the
 * admin to pursue or write off. Values are exact integers — a claim of 3
 * credits against a 1-credit balance debits 1 and leaves 2.
 */
export function feeClaimPlan(
  claimMinor: number,
  balanceCredits: number
): { debitCredits: number; debitMinor: number; remainingMinor: number } {
  const claim = int(claimMinor);
  const balance = int(balanceCredits);
  // 1 credit = $1 = 100 minor units.
  const neededCredits = Math.ceil(claim / 100);
  const debitCredits = Math.min(neededCredits, balance);
  const debitMinor = Math.min(claim, debitCredits * 100);
  return { debitCredits, debitMinor, remainingMinor: Math.max(claim - debitMinor, 0) };
}

/** Why a payout request was refused (the UI localizes each case). */
export type PayoutRefusal = "invalid" | "insufficient";

/**
 * The payout guard. `availableMinor` already excludes pending reservations, and
 * — because every posted earning is created from money the platform collected —
 * the balance is funded by construction. This function exists so the rule has
 * exactly one statement, and so an unfunded legacy credit can never be paid out.
 */
export function payoutGuard(input: {
  availableMinor: number;
  pendingMinor: number;
  requestedMinor: number;
}): { ok: true } | { ok: false; error: PayoutRefusal } {
  const requested = int(input.requestedMinor);
  if (requested <= 0 || !Number.isFinite(input.requestedMinor)) return { ok: false, error: "invalid" };
  const spendable = input.availableMinor - input.pendingMinor;
  if (requested > spendable) return { ok: false, error: "insufficient" };
  return { ok: true };
}

/**
 * Aggregate reconciliation: what the platform can say it earned vs. what it
 * actually holds. Used by the admin revenue reconciliation view.
 */
export interface SettlementTally {
  jobs: number;
  jobValueMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  feeStampedMinor: number;
  feeCollectedMinor: number;
  /** Fees claimed on outside-platform jobs (the whole claim). */
  feeClaimMinor: number;
  /** ...of which collected against credit balances. */
  feeClaimCollectedMinor: number;
  /** ...and still to recover. */
  feeClaimOutstandingMinor: number;
  workerNetTargetMinor: number;
  byState: Record<SettlementState, number>;
}

/* ─────────────────────────── §Reconciliation (admin) ─────────────────────────── */

/**
 * One job as the admin reconciliation sees it: who it was, what it is worth,
 * where its money stands, and what the earnings ledger already holds for it.
 *
 * `creditedMinor` vs. `settlement.workerNetTargetMinor` is the whole point of
 * the view: the difference is money the platform owes a worker but has not
 * collected, and it is only ever zero or positive-if-collected. Before this
 * engine, that difference was silently credited and paid out.
 */
export interface SettlementJob {
  bookingId: string;
  number: string;
  workerId: string;
  workerNameEn: string;
  workerNameAr: string;
  /** The booking's lifecycle state, verbatim ("COMPLETED"). */
  status: string;
  /** The manual reference the customer holds, when one is outstanding. */
  reference: string | null;
  settlement: Settlement;
  /** What the earnings ledger already holds for this job (EARNING + top-ups). */
  creditedMinor: number;
  /** What the ledger still owes for it — 0 once square. */
  dueMinor: number;
  /** True when the worker's share exists but is blocked on collection. */
  blockedOnCollection: boolean;
}

/** Builds the ledger half of a reconciliation row (`ledgerDeltaFor` decides). */
export function settlementJob(
  identity: Omit<SettlementJob, "dueMinor" | "blockedOnCollection">
): SettlementJob {
  const delta = ledgerDeltaFor(identity.settlement, identity.creditedMinor);
  return {
    ...identity,
    dueMinor: delta.amountMinor,
    blockedOnCollection: delta.amountMinor > 0 && settlementNeedsCollection(identity.settlement),
  };
}

/**
 * The aggregate the admin reconciliation leads with. `feeStampedMinor` is what
 * the take rate *says* the platform earned; `feeCollectedMinor` is what it
 * actually holds. On a healthy platform the two differ only by jobs whose
 * customers have not paid yet — never by an accrual nobody collected.
 */
export interface ReconciliationTally extends SettlementTally {
  /** Jobs whose worker credit is waiting on collection. */
  blockedJobs: number;
  blockedMinor: number;
  /** What the earnings ledger still owes across the window. */
  owedMinor: number;
  /**
   * Take rate the platform has *stamped* on platform-handled jobs but not
   * collected yet — the cash gap that is legitimately waiting on customers.
   * Outside-platform claims are counted separately, in
   * `feeClaimOutstandingMinor`.
   */
  feeUncollectedMinor: number;
  /** Ledger money credited for jobs that never collected (must be 0). */
  unbackedMinor: number;
}

export function reconcileSettlements(jobs: SettlementJob[]): ReconciliationTally {
  const tally = tallySettlements(jobs.map((j) => j.settlement));
  let blockedJobs = 0;
  let blockedMinor = 0;
  let owedMinor = 0;
  let unbackedMinor = 0;
  let feeStampedOnPlatformMinor = 0;
  for (const job of jobs) {
    if (job.blockedOnCollection) {
      blockedJobs += 1;
      blockedMinor += job.dueMinor;
    }
    owedMinor += job.dueMinor;
    if (job.settlement.state !== "outside-platform") feeStampedOnPlatformMinor += job.settlement.feeMinor;
    // Credited money with no collection behind it: the defect this engine
    // exists to prevent, so the view reports it explicitly rather than
    // trusting that the invariant holds.
    if (job.creditedMinor > job.settlement.collectedMinor) {
      unbackedMinor += job.creditedMinor - job.settlement.collectedMinor;
    }
  }
  const feeUncollectedMinor = Math.max(feeStampedOnPlatformMinor - tally.feeCollectedMinor, 0);
  return { ...tally, blockedJobs, blockedMinor, owedMinor, feeUncollectedMinor, unbackedMinor };
}

/**
 * The jobs an admin should look at, worst first: unbacked credits (a defect),
 * then outside-platform fee claims, then money blocked on collection, then
 * part-funded jobs. Funded jobs are omitted — there is nothing to do about a
 * job the platform already collected for.
 */
export function reconciliationQueue(jobs: SettlementJob[]): SettlementJob[] {
  const rank = (job: SettlementJob): number => {
    if (job.creditedMinor > job.settlement.collectedMinor) return 0;
    if (job.settlement.state === "outside-platform") return job.settlement.feeClaimOutstandingMinor > 0 ? 1 : 6;
    if (job.blockedOnCollection) return 2;
    if (job.settlement.state === "part-funded") return 3;
    if (job.settlement.state === "awaiting-confirmation") return 4;
    if (job.settlement.state === "overpaid") return 5;
    return 6;
  };
  return jobs
    .filter((job) => rank(job) < 6)
    .sort((a, b) => rank(a) - rank(b) || b.settlement.outstandingMinor - a.settlement.outstandingMinor);
}

export function tallySettlements(rows: Settlement[]): SettlementTally {
  const byState: Record<SettlementState, number> = {
    "no-quote": 0,
    funded: 0,
    "part-funded": 0,
    "awaiting-customer": 0,
    "awaiting-confirmation": 0,
    "outside-platform": 0,
    overpaid: 0,
  };
  const tally: SettlementTally = {
    jobs: rows.length,
    jobValueMinor: 0,
    collectedMinor: 0,
    outstandingMinor: 0,
    feeStampedMinor: 0,
    feeCollectedMinor: 0,
    feeClaimMinor: 0,
    feeClaimCollectedMinor: 0,
    feeClaimOutstandingMinor: 0,
    workerNetTargetMinor: 0,
    byState,
  };
  for (const row of rows) {
    byState[row.state] += 1;
    tally.jobValueMinor += row.jobValueMinor;
    tally.collectedMinor += row.collectedMinor;
    tally.outstandingMinor += row.outstandingMinor;
    tally.feeStampedMinor += row.feeMinor;
    tally.feeCollectedMinor += row.feeCollectedMinor;
    tally.feeClaimMinor += row.feeClaimMinor;
    tally.feeClaimCollectedMinor += row.feeClaimCollectedMinor;
    tally.feeClaimOutstandingMinor += row.feeClaimOutstandingMinor;
    tally.workerNetTargetMinor += row.workerNetTargetMinor;
  }
  return tally;
}
