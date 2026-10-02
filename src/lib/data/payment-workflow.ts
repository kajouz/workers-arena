/**
 * Payment workflow v2 — the pure rules (docs/PAYMENTS.md §Workflow v2,
 * docs/PAYMENT-COMMS-ACCOUNTING-PLAN.md §3).
 *
 * No database, no clock, no side effects: every surface (the admin confirm
 * actions, the expiry and dunning crons, the instructions page, the booking
 * accept path) asks these functions and the tests pin them. The stores in
 * payment-workflow-store.ts only persist what these decide.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Env = Record<string, string | undefined>;

function intEnv(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/** The workflow's tunables. Defaults are the plan's proposals; each can be
 * overridden by an env var so operations can tune without a deploy of code. */
export function paymentWorkflowConfig(env: Env = process.env) {
  return {
    /** A booking deposit must be paid within this many hours of the accept… */
    depositHoldHours: intEnv(env, "PAYMENT_DEPOSIT_HOLD_HOURS", 24),
    /** …and never later than this many hours before the job starts. */
    depositBeforeStartHours: intEnv(env, "PAYMENT_DEPOSIT_BEFORE_START_HOURS", 2),
    /** An unpaid upgrade / credit / campaign reference lapses after this. */
    purchaseHoldHours: intEnv(env, "PAYMENT_PURCHASE_HOLD_HOURS", 72),
    /** At or above this amount (minor units) a second admin must approve. */
    fourEyesThresholdMinor: intEnv(env, "PAYMENT_FOUR_EYES_MINOR", 20_000),
    /** Minimum deposit as a share of the quote, in basis points (0 = off). */
    minDepositBps: Math.min(10_000, intEnv(env, "BOOKING_MIN_DEPOSIT_BPS", 0)),
    /** Days after the balance falls due at which each dunning stage fires. */
    dunningDays: [1, 3, 7, 14, 30] as const,
    /** An outside-platform fee claim older than this blocks leads and payouts. */
    feeClaimGraceDays: intEnv(env, "FEE_CLAIM_GRACE_DAYS", 14),
    /** The customer has this long to confirm a "settled directly" declaration. */
    settledOutsideConfirmHours: intEnv(env, "SETTLED_OUTSIDE_CONFIRM_HOURS", 72),
  };
}

export type PaymentWorkflowConfig = ReturnType<typeof paymentWorkflowConfig>;

/* ───────────────────────────── Deadlines ───────────────────────────── */

/**
 * When an unpaid booking deposit lapses: `depositHoldHours` after the deposit
 * was requested, but never later than `depositBeforeStartHours` before the
 * job starts. A slot already inside that window gets until the job starts
 * minus the margin — or, if even that has passed, it lapses at once.
 */
export function depositDeadline(
  input: { requestedAt: string | Date; startAt?: string | Date | null },
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): Date {
  const requested = new Date(input.requestedAt).getTime();
  let deadline = requested + cfg.depositHoldHours * HOUR;
  if (input.startAt) {
    const latest = new Date(input.startAt).getTime() - cfg.depositBeforeStartHours * HOUR;
    deadline = Math.min(deadline, latest);
  }
  return new Date(deadline);
}

/** When an unpaid purchase / campaign / credit reference lapses. */
export function purchaseDeadline(
  createdAt: string | Date,
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): Date {
  return new Date(new Date(createdAt).getTime() + cfg.purchaseHoldHours * HOUR);
}

/**
 * Should an unpaid reference lapse now? A payer who already uploaded a receipt
 * or whose money finance has started recording is never expired by the clock:
 * the delay is ours, not theirs.
 */
export function shouldExpire(input: {
  deadline: Date;
  now: Date;
  hasReceipt: boolean;
  hasTranche: boolean;
}): boolean {
  if (input.hasReceipt || input.hasTranche) return false;
  return input.now.getTime() >= input.deadline.getTime();
}

/** Half-time reminder: due once the first half of the hold has elapsed. */
export function reminderDue(input: { requestedAt: Date; deadline: Date; now: Date }): boolean {
  const half = input.requestedAt.getTime() + (input.deadline.getTime() - input.requestedAt.getTime()) / 2;
  return input.now.getTime() >= half && input.now.getTime() < input.deadline.getTime();
}

/* ─────────────────────── Evidence and maker–checker ─────────────────────── */

/**
 * Normalise an OMT/Whish transaction number for the uniqueness check: upper
 * case, spaces and dashes removed. Returns null when it cannot be a real
 * transaction number (too short, too long, or stray characters).
 */
export function normalizeTxnId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[\s\-_/.]/g, "");
  if (!/^[A-Z0-9]{4,40}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Does recording this amount need a second, different admin? Yes when the
 * payment is at or above the four-eyes threshold, or when there is no receipt
 * photo to back the entry.
 */
export function needsSecondApproval(
  input: { paymentAmountMinor: number; hasReceipt: boolean },
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): boolean {
  if (!input.hasReceipt) return true;
  return cfg.fourEyesThresholdMinor > 0 && input.paymentAmountMinor >= cfg.fourEyesThresholdMinor;
}

/** The approver must be a different person from whoever recorded the amount. */
export function canApprove(input: { enteredById?: string | null; approverId?: string | null }): boolean {
  if (!input.approverId) return false;
  return !input.enteredById || input.enteredById !== input.approverId;
}

export type Allocation =
  | { state: "short"; receivedMinor: number; remainingMinor: number; excessMinor: 0 }
  | { state: "exact"; receivedMinor: number; remainingMinor: 0; excessMinor: 0 }
  | { state: "over"; receivedMinor: number; remainingMinor: 0; excessMinor: number };

/** What the approved money received means for a payment of `amountMinor`. */
export function allocate(input: { amountMinor: number; receivedMinor: number }): Allocation {
  const received = Math.max(0, Math.trunc(input.receivedMinor));
  const amount = Math.max(0, Math.trunc(input.amountMinor));
  if (received < amount) return { state: "short", receivedMinor: received, remainingMinor: amount - received, excessMinor: 0 };
  if (received === amount) return { state: "exact", receivedMinor: received, remainingMinor: 0, excessMinor: 0 };
  return { state: "over", receivedMinor: received, remainingMinor: 0, excessMinor: received - amount };
}

/* ─────────────────────────── Balance dunning ─────────────────────────── */

export type DunningStage = 1 | 2 | 3 | 4 | 5;

/**
 * The next dunning stage to fire, or null. Stages fire in order and never
 * twice: 1 = D+1 reminder, 2 = D+3 reminder (the worker is told too),
 * 3 = D+7 admin follow-up, 4 = D+14 customer restricted, 5 = D+30 write-off
 * review. A stage skipped while the cron was down fires on the next run (only
 * the latest one due, so a customer never receives a burst).
 */
export function nextDunningStage(
  input: { dueAt: Date; now: Date; stage: number },
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): DunningStage | null {
  const elapsedDays = (input.now.getTime() - input.dueAt.getTime()) / DAY;
  let due = 0;
  cfg.dunningDays.forEach((d, i) => {
    if (elapsedDays >= d) due = i + 1;
  });
  return due > input.stage ? (due as DunningStage) : null;
}

/* ───────────────────────── Payment reliability ───────────────────────── */

export type ReliabilityTier = "normal" | "prepay" | "blocked";

export interface ReliabilityFacts {
  /** Deposits that lapsed unpaid. */
  expiredDeposits: number;
  /** Balances that reached the D+7 stage while still unpaid (or now are). */
  overdueBalances: number;
  /** Balances an admin wrote off. */
  writeOffs: number;
  /** Jobs paid in full through the platform. */
  paidJobs: number;
}

/**
 * A customer's payment-reliability score: points for lapses, minus one per
 * fully paid job (floor 0). 0–2 normal deposit rules · 3–9 full prepayment ·
 * ≥10 booking blocked pending admin review.
 */
export function reliabilityScore(facts: ReliabilityFacts): { points: number; tier: ReliabilityTier } {
  const raw = facts.expiredDeposits * 1 + facts.overdueBalances * 3 + facts.writeOffs * 10 - facts.paidJobs;
  const points = Math.max(0, raw);
  const tier: ReliabilityTier = points >= 10 ? "blocked" : points >= 3 ? "prepay" : "normal";
  return { points, tier };
}

/**
 * The deposit the platform requires at accept. A worker may always ask for
 * more; never less than the configured minimum share of the quote, and the
 * whole quote from a customer whose reliability tier is "prepay".
 */
export function requiredDepositMinor(
  input: { quoteMinor: number | null | undefined; requestedDepositMinor?: number | null; tier: ReliabilityTier },
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): number {
  const quote = Math.max(0, Math.trunc(input.quoteMinor ?? 0));
  const requested = Math.max(0, Math.trunc(input.requestedDepositMinor ?? 0));
  if (quote === 0) return requested;
  if (input.tier !== "normal") return quote;
  const minimum = Math.ceil((quote * cfg.minDepositBps) / 10_000);
  return Math.min(quote, Math.max(requested, minimum));
}

/* ─────────────────────────── Fee-claim gate ─────────────────────────── */

/**
 * Is an outside-platform fee claim old enough, and still unpaid, to block the
 * worker's lead purchases and payouts?
 */
export function feeClaimBlocks(
  input: { claimMinor: number; collectedMinor: number; declaredAt: Date | null; now: Date },
  cfg: PaymentWorkflowConfig = paymentWorkflowConfig()
): boolean {
  if (!input.declaredAt) return false;
  if (input.collectedMinor >= input.claimMinor) return false;
  return input.now.getTime() - input.declaredAt.getTime() >= cfg.feeClaimGraceDays * DAY;
}
