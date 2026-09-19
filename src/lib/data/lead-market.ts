/**
 * ────────────────────────────────────────────────────────────────────────────
 * QUALIFIED LEAD MARKETPLACE — engine (§7 grading · §8 matching · §9 ownership
 * · §10 contact reveal)
 * ────────────────────────────────────────────────────────────────────────────
 * A lead is a COMMERCIAL ASSET, not a contact-form row. This module is the
 * pure decision layer over a customer's quote request (`QuoteRequest`, the job
 * post workers bid on):
 *
 *   grade    → how qualified is this request?      (§7 bronze/silver/gold/emergency)
 *   price    → what does it cost, per grade?        (config, in credits)
 *   match    → which few workers see it?            (§8 signals + weights)
 *   own      → how many may hold/buy it, for how long, exclusively? (§9)
 *   reveal   → when do the customer's details unlock? (§10)
 *
 * Everything here is a PURE function of its inputs (no clock, no I/O), so the
 * worker-facing board, the admin configuration and the tests all see the same
 * answer. Persistence lives in `lead-market-store.ts` (demo ⇄ Prisma) and the
 * prices/weights/policies are part of the versioned monetization rule set
 * (`FeeRuleSet.leadMarket`, docs/fee-rules.md), so they are admin-editable and
 * never hard-coded in the UI.
 */

import type { FeeRuleSet } from "./fee-rules";

/** How qualified a lead is. Emergency is a grade AND a service class. */
export type LeadGrade = "bronze" | "silver" | "gold" | "emergency";

export const LEAD_GRADES: readonly LeadGrade[] = ["bronze", "silver", "gold", "emergency"] as const;

/** Lifecycle of one worker's offer on one lead. */
export type LeadOfferStatus = "offered" | "purchased" | "expired" | "revoked" | "declined";

/** How much of the customer's identity a viewer may see (§10). */
export type ContactReveal = "hidden" | "masked" | "revealed";

/** The signals a grade is computed from. Every field is optional: the engine
 * grades what the request actually contains, and scores the rest as absent —
 * a bare "I need a plumber" request is a BRONZE by construction. */
export interface LeadSignals {
  /** A concrete trade/category was chosen. */
  hasCategory: boolean;
  /** A priced service item was picked (implies a budget anchor). */
  hasPricedService: boolean;
  /** A city/area is known, so the worker can judge the trip. */
  hasLocation: boolean;
  /** Free-text detail length (characters). */
  noteLength: number;
  /** The customer is signed in (verified account) — phone-keyed guests are not. */
  isSignedIn: boolean;
  /** A reachable email exists on top of the phone number. */
  hasEmail: boolean;
  /** The request is urgent (24/7 emergency). */
  isEmergency: boolean;
  /** A preferred time/slot was expressed (present in later waves; any signal counts). */
  hasPreferredTime?: boolean;
  /** Photo attachments count (present in later waves). */
  photoCount?: number;
}

/** The graded result, with the breakdown that explains it (the UI shows why). */
export interface LeadGradeResult {
  grade: LeadGrade;
  /** 0–100 qualification score. */
  score: number;
  /** Per-signal contribution, for "why is this a gold lead?" UI. */
  breakdown: Array<{ signal: keyof LeadSignals; points: number; max: number }>;
}

/**
 * Qualification weights (§7). They sum to 100 across the non-emergency
 * signals; emergency short-circuits to its own grade regardless of score.
 */
export const LEAD_GRADE_WEIGHTS: Readonly<Record<Exclude<keyof LeadSignals, "isEmergency">, number>> = {
  hasCategory: 15,
  hasPricedService: 15,
  hasLocation: 15,
  noteLength: 15,
  isSignedIn: 15,
  hasEmail: 10,
  hasPreferredTime: 10,
  photoCount: 5,
};

/** Score thresholds: BRONZE below silver, SILVER below gold, GOLD and up. */
export const LEAD_GRADE_THRESHOLDS = { silver: 40, gold: 70 } as const;

/** Detail length that earns the full description points. */
export const LEAD_DETAIL_FULL_CHARS = 120;

/**
 * Grade a request. Emergency wins outright (a 3am burst pipe is an emergency
 * lead even when the description is one line); otherwise the score decides.
 */
export function gradeLead(signals: LeadSignals): LeadGradeResult {
  const capped = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  const detailPoints = Math.round(
    LEAD_GRADE_WEIGHTS.noteLength * capped(signals.noteLength / LEAD_DETAIL_FULL_CHARS, 1)
  );
  const photoPoints = Math.round(LEAD_GRADE_WEIGHTS.photoCount * capped((signals.photoCount ?? 0) / 3, 1));

  const breakdown: LeadGradeResult["breakdown"] = [
    { signal: "hasCategory", points: signals.hasCategory ? LEAD_GRADE_WEIGHTS.hasCategory : 0, max: LEAD_GRADE_WEIGHTS.hasCategory },
    { signal: "hasPricedService", points: signals.hasPricedService ? LEAD_GRADE_WEIGHTS.hasPricedService : 0, max: LEAD_GRADE_WEIGHTS.hasPricedService },
    { signal: "hasLocation", points: signals.hasLocation ? LEAD_GRADE_WEIGHTS.hasLocation : 0, max: LEAD_GRADE_WEIGHTS.hasLocation },
    { signal: "noteLength", points: detailPoints, max: LEAD_GRADE_WEIGHTS.noteLength },
    { signal: "isSignedIn", points: signals.isSignedIn ? LEAD_GRADE_WEIGHTS.isSignedIn : 0, max: LEAD_GRADE_WEIGHTS.isSignedIn },
    { signal: "hasEmail", points: signals.hasEmail ? LEAD_GRADE_WEIGHTS.hasEmail : 0, max: LEAD_GRADE_WEIGHTS.hasEmail },
    { signal: "hasPreferredTime", points: signals.hasPreferredTime ? LEAD_GRADE_WEIGHTS.hasPreferredTime : 0, max: LEAD_GRADE_WEIGHTS.hasPreferredTime },
    { signal: "photoCount", points: photoPoints, max: LEAD_GRADE_WEIGHTS.photoCount },
  ];

  const score = breakdown.reduce((sum, row) => sum + row.points, 0);
  const grade: LeadGrade = signals.isEmergency
    ? "emergency"
    : score >= LEAD_GRADE_THRESHOLDS.gold
      ? "gold"
      : score >= LEAD_GRADE_THRESHOLDS.silver
        ? "silver"
        : "bronze";

  return { grade, score, breakdown };
}

/** The subset of a quote request the grader needs (structural — no imports). */
export interface LeadGradeInput {
  jobTitle: string;
  note?: string;
  categorySlug?: string;
  citySlug?: string;
  serviceItem?: { nameEn: string; price: number };
  customerId?: string;
  customerEmail?: string;
  isEmergency?: boolean;
  /** Optional richer signals once they exist on the request. */
  preferredTime?: string;
  photoCount?: number;
}

/** Build the grader input from a quote request. */
export function leadSignalsFor(request: LeadGradeInput): LeadSignals {
  return {
    hasCategory: Boolean(request.categorySlug),
    hasPricedService: Boolean(request.serviceItem),
    hasLocation: Boolean(request.citySlug),
    noteLength: (request.note ?? "").trim().length,
    isSignedIn: Boolean(request.customerId),
    hasEmail: Boolean(request.customerEmail),
    isEmergency: Boolean(request.isEmergency),
    hasPreferredTime: Boolean(request.preferredTime),
    photoCount: request.photoCount ?? 0,
  };
}

/** Grade a quote request directly. */
export function gradeLeadRequest(request: LeadGradeInput): LeadGradeResult {
  return gradeLead(leadSignalsFor(request));
}

/* ───────────────────────────── Matching (§8) ───────────────────────────── */

/** The signals the matcher ranks on. Weights live in the rule set, so an admin
 * can re-tune the marketplace (e.g. push availability over tenure) without a
 * deploy. */
export interface MatchingWeights {
  /** Worker's trade matches the request's category. */
  category: number;
  /** Worker operates in the request's area. */
  area: number;
  /** …or at least the same city. */
  city: number;
  /** Rating (0–5 → 0–1). */
  rating: number;
  /** Review volume (log-scaled — 200 reviews is not 10× better than 20). */
  reviews: number;
  /** Share of answered requests. */
  responseRate: number;
  /** Has bookable slots in the coming week. */
  availability: number;
  /** Subscription tier (free → business), the platform's commercial lever. */
  planTier: number;
  /** Can take 24/7 emergency work (matters most on emergency leads). */
  emergency: number;
  /** Verified identity — a trust floor for handing over a customer's phone. */
  verified: number;
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  category: 30,
  area: 12,
  city: 8,
  rating: 12,
  reviews: 6,
  responseRate: 10,
  availability: 8,
  planTier: 6,
  emergency: 5,
  verified: 3,
};

/** A worker as the matcher sees them (structural — no imports). */
export interface LeadCandidate {
  workerId: string;
  categorySlug: string;
  citySlug: string;
  areaSlug?: string;
  rating: number;
  reviewCount: number;
  responseRate?: number | null;
  /** Bookable slots in the coming week. */
  availableThisWeek?: boolean;
  /** Subscription plan (any case) — mapped to the monetization tier. */
  plan?: string | null;
  emergency?: boolean;
  verified?: boolean;
  /** Hidden from the marketplace while suspended/blocked. */
  active?: boolean;
}

/** A ranked candidate with the explanation of its score. */
export interface LeadCandidateScore {
  candidate: LeadCandidate;
  /** 0–100 match score. */
  score: number;
  /** Per-signal contribution, for the admin "why this worker?" view. */
  breakdown: Array<{ signal: keyof MatchingWeights; points: number; max: number }>;
}

/** The request side of a match (structural). */
export interface LeadMatchContext {
  categorySlug: string;
  citySlug: string;
  isEmergency?: boolean;
}

/**
 * Score one candidate. Hard filters first — a worker outside the trade simply
 * cannot serve the job, so no weight can compensate for that:
 *   • an inactive worker is never matched
 *   • an emergency lead requires an emergency-capable worker
 * Everything else is weighted, so a strong nearby generalist can outrank a
 * distant specialist (which is what the weights are for).
 */
export function scoreLeadCandidate(
  candidate: LeadCandidate,
  lead: LeadMatchContext,
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS
): LeadCandidateScore | null {
  if (candidate.active === false) return null;
  if (candidate.categorySlug !== lead.categorySlug) return null;
  if (lead.isEmergency && !candidate.emergency) return null;

  const contribution = (signal: keyof MatchingWeights, ratio: number) => {
    const max = Math.max(0, weights[signal]);
    return { signal, points: Math.round(max * Math.min(Math.max(ratio, 0), 1)), max };
  };

  const tierRatio =
    { free: 0, starter: 0.25, professional: 0.5, growth: 0.75, business: 1 }[
      planTierForLead(candidate.plan)
    ] ?? 0;

  const breakdown: LeadCandidateScore["breakdown"] = [
    contribution("category", 1),
    contribution("area", candidate.areaSlug && candidate.areaSlug === lead.citySlug ? 1 : candidate.areaSlug ? 0.5 : 0),
    contribution("city", candidate.citySlug === lead.citySlug ? 1 : 0),
    contribution("rating", candidate.rating / 5),
    contribution("reviews", Math.min(Math.log10(Math.max(candidate.reviewCount, 1)) / 2, 1)),
    contribution("responseRate", ((candidate.responseRate ?? 0) as number) / 100),
    contribution("availability", candidate.availableThisWeek ? 1 : 0),
    contribution("planTier", tierRatio),
    contribution("emergency", candidate.emergency ? 1 : 0),
    contribution("verified", candidate.verified ? 1 : 0),
  ];

  return {
    candidate,
    score: breakdown.reduce((sum, row) => sum + row.points, 0),
    breakdown,
  };
}

/** Plan → tier without importing the fee engine's map (kept structural). */
function planTierForLead(plan?: string | null): "free" | "starter" | "professional" | "growth" | "business" {
  const key = (plan ?? "").trim().toLowerCase();
  if (key === "basic") return "starter";
  if (key === "professional") return "professional";
  if (key === "premium") return "growth";
  if (key === "enterprise") return "business";
  return "free";
}

/**
 * Rank the pool for one lead and cut it to `maxWorkers` — §8's "do not send
 * every lead to every worker". Ties break on review volume then rating, so the
 * order is deterministic (same pool in, same list out).
 */
export function matchLeadCandidates(
  candidates: LeadCandidate[],
  lead: LeadMatchContext,
  options: { weights?: MatchingWeights; maxWorkers: number; excludeWorkerIds?: string[] }
): LeadCandidateScore[] {
  const excluded = new Set(options.excludeWorkerIds ?? []);
  const scored: LeadCandidateScore[] = [];
  for (const candidate of candidates) {
    if (excluded.has(candidate.workerId)) continue;
    const result = scoreLeadCandidate(candidate, lead, options.weights ?? DEFAULT_MATCHING_WEIGHTS);
    if (result) scored.push(result);
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.candidate.reviewCount - a.candidate.reviewCount ||
      b.candidate.rating - a.candidate.rating ||
      a.candidate.workerId.localeCompare(b.candidate.workerId)
  );
  return scored.slice(0, Math.max(1, Math.trunc(options.maxWorkers)));
}

/**
 * The signals that actually earned a candidate points, strongest first — the
 * "why you were matched" line the worker's board shows. Derived from a real
 * score breakdown (`scoreLeadCandidate`), never from a guess, so the row's
 * explanation is the same arithmetic that put the worker on the offer.
 */
export function matchReasonsFor(
  breakdown: LeadCandidateScore["breakdown"],
  limit = 4
): Array<keyof MatchingWeights> {
  return breakdown
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.signal.localeCompare(b.signal))
    .slice(0, Math.max(0, limit))
    .map((row) => row.signal);
}

/** The subset of a `Worker` row the matcher needs (structural — no imports, so
 * this module stays pure and the demo/Prisma adapters can both feed it). */
export interface WorkerLike {
  id: string;
  categorySlug: string;
  citySlug: string;
  areaSlug?: string;
  rating: number;
  reviewCount: number;
  /** 0–100 share of answered requests (W1 trust signal); null/absent = unknown. */
  responseRate?: number | null;
  emergency?: boolean;
  verified?: boolean;
  /** Hidden from the marketplace while suspended/blocked. */
  available?: boolean;
  /** The worker's subscription, when their row carries one. */
  subscription?: { plan?: string | null; status?: string } | null;
  /** Explicit plan override (used by tests / callers without a subscription). */
  plan?: string | null;
}

/**
 * Map a worker row onto a matcher candidate. An EXPIRED subscription is worth
 * no tier weight (they are invisible to search too), so the plan lever cannot
 * be farmed by letting a plan lapse while keeping its ranking.
 */
export function leadCandidateFromWorker(worker: WorkerLike): LeadCandidate {
  const subscription = worker.subscription ?? null;
  const plan = worker.plan ?? subscription?.plan ?? null;
  const lapsed = subscription?.status === "expired";
  return {
    workerId: worker.id,
    categorySlug: worker.categorySlug,
    citySlug: worker.citySlug,
    ...(worker.areaSlug ? { areaSlug: worker.areaSlug } : {}),
    rating: worker.rating,
    reviewCount: worker.reviewCount,
    responseRate: worker.responseRate ?? null,
    plan: lapsed ? null : plan,
    emergency: Boolean(worker.emergency),
    verified: Boolean(worker.verified),
    active: worker.available !== false,
  };
}

/** Map a search-result page onto matcher candidates. */
export function leadCandidatesFromWorkers(workers: WorkerLike[]): LeadCandidate[] {
  return workers.map(leadCandidateFromWorker);
}

/* ─────────────────────── Lead market configuration (§7–§10) ─────────────────────── */

/**
 * §11 — the LEAD REBATE: what a converted lead gives back.
 *
 * A bought lead is a bet: the worker pays credits to reach a customer and only
 * earns if the job happens. This closes that loop — when a job whose lead was
 * BOUGHT completes, the platform credit it as a fee reduction on that job, so
 * the effective take rate falls by exactly what the lead cost:
 *
 *   7% of $300 = $21 fee · gold lead cost $20
 *   → rebate $20 → the platform keeps $1, the worker nets $299
 *
 * Bounded by construction: the rebate can never exceed the fee that produced
 * it, so the platform never pays out more than it earned on the job, and it can
 * never exceed the lead's own price — a worker cannot turn a rebate into profit
 * on the lead itself.
 */
export interface LeadRebateConfig {
  /** Off → the stamped fee is charged in full (the rebate is opt-in). */
  enabled: boolean;
  /** Share of the fee that may be given back, in basis points (10 000 = 100%). */
  pctBps: number;
  /** Hard ceiling per job in minor units, or null for "no ceiling beyond the fee". */
  maxMinor: number | null;
}

export const DEFAULT_LEAD_REBATE: LeadRebateConfig = { enabled: true, pctBps: 10_000, maxMinor: null };

/** Why a rebate came out the size it did (shown to the worker + the admin). */
export type LeadRebateLimit = "disabled" | "no-lead" | "fee" | "lead-cost" | "ceiling";

/**
 * Price a rebate. Pure: same inputs, same cents — the completion transaction,
 * the worker's row and the admin audit all call this, so no surface can
 * disagree about what a converted lead gave back.
 */
export function leadRebateFor(input: {
  config: LeadRebateConfig;
  /** What the worker paid for the lead, in minor units (credits × 100). */
  leadCostMinor: number;
  /** The platform fee stamped on the completed job, in minor units. */
  feeMinor: number;
}): { rebateMinor: number; effectiveFeeMinor: number; limitedBy: LeadRebateLimit } {
  const fee = Math.max(0, Math.trunc(input.feeMinor));
  const leadCost = Math.max(0, Math.trunc(input.leadCostMinor));
  if (!input.config.enabled || fee === 0 || leadCost === 0) {
    return { rebateMinor: 0, effectiveFeeMinor: fee, limitedBy: input.config.enabled ? "no-lead" : "disabled" };
  }
  // Round-half-up on the fee slice, mirroring the fee engine's own rounding.
  const share = Math.round((fee * Math.max(0, Math.min(input.config.pctBps, 10_000))) / 10_000);
  const ceiling = input.config.maxMinor === null ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(input.config.maxMinor));

  const candidates: Array<[number, LeadRebateLimit]> = [
    [share, "fee"],
    [leadCost, "lead-cost"],
    [ceiling, "ceiling"],
  ];
  const [rebateMinor, limitedBy] = candidates.reduce((lowest, next) => (next[0] < lowest[0] ? next : lowest));
  return { rebateMinor, effectiveFeeMinor: fee - rebateMinor, limitedBy };
}

/** The admin-editable lead-market policy, stored inside the versioned rule set. */
export interface LeadMarketConfig {
  /** Price per grade, in platform credits (1 credit = $1 by convention). */
  prices: Record<LeadGrade, number>;
  /** How many workers may hold an offer on one lead (§9 limited distribution). */
  maxWorkersPerLead: number;
  /** How long an offer stays buyable before it expires. */
  offerTtlMinutes: number;
  /**
   * §9 exclusivity: when true, buying the lead revokes every other pending
   * offer on it — the buyer gets the customer to themselves. When false the
   * lead is shared (up to maxWorkersPerLead buyers).
   */
  exclusive: boolean;
  /** §10 contact reveal policy. */
  reveal: ContactRevealPolicy;
  /** §8 ranking weights. */
  weights: MatchingWeights;
  /** §11 what a converted lead gives back (fee rebate). */
  rebate: LeadRebateConfig;
  /** WhatsApp notification templates per grade (admin-editable). */
  whatsappTemplates: WhatsAppTemplates;
  /** Email notification templates per grade (admin-editable). */
  emailTemplates: EmailTemplates;
  /** SMS notification templates per grade (admin-editable). */
  smsTemplates: SmsTemplates;
  /** Which channels to notify (admin-toggleable). */
  notifyChannels: NotificationChannelConfig;
}

/** Per-grade WhatsApp notification templates. Admin edits these so each
 * grade's notification can carry a tailored message. Placeholders:
 *   {workerName} — the worker's display name
 *   {grade} — the grade label (Bronze/Silver/Gold/Emergency)
 *   {leadNumber} — the human-readable lead number
 *   {matchScore} — the matching score (0–100)
 *   {priceCredits} — the credit cost of the lead
 *   {boardUrl} — the deep link to the worker's lead board
 *   {adminName} — the admin who sent the notification
 */
export interface WhatsAppTemplates {
  en: Record<LeadGrade, string>;
  ar: Record<LeadGrade, string>;
}

/** Per-grade email notification templates. Admin edits these so each
 * grade's notification can carry a tailored email message. Placeholders
 * are the same as WhatsApp templates. */
export interface EmailTemplates {
  en: Record<LeadGrade, { subject: string; body: string }>;
  ar: Record<LeadGrade, { subject: string; body: string }>;
}

/** Per-grade SMS notification templates. Shorter than email — optimized
 * for 160-char limits. Placeholders are the same as WhatsApp templates. */
export interface SmsTemplates {
  en: Record<LeadGrade, string>;
  ar: Record<LeadGrade, string>;
}

/** Which notification channels are enabled for lead offers. */
export interface NotificationChannelConfig {
  whatsapp: boolean;
  email: boolean;
  sms: boolean;
}

/** When the customer's details unlock. */
export interface ContactRevealPolicy {
  /** What a worker sees before buying the lead. */
  beforePurchase: ContactReveal;
  /** What the buyer sees after purchasing. */
  afterPurchase: ContactReveal;
  /** What a FREE-tier worker sees after purchasing (the tier lever). */
  afterPurchaseFreeTier: ContactReveal;
  /** What everyone sees once the job is actually booked (customer consent). */
  afterBooking: ContactReveal;
}

/** Default email templates per grade. Subject line is short; body is the full email copy. */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  en: {
    bronze: {
      subject: "New Bronze Lead Offer — {leadNumber}",
      body: "Hi {workerName},\n\nYou have a new Bronze lead offer:\n\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match Score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team",
    },
    silver: {
      subject: "New Silver Lead Offer — {leadNumber}",
      body: "Hi {workerName},\n\nYou have a new Silver lead offer:\n\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match Score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team",
    },
    gold: {
      subject: "New Gold Lead Offer — {leadNumber}",
      body: "Hi {workerName},\n\nYou have a new Gold lead offer:\n\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match Score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team",
    },
    emergency: {
      subject: "🚨 URGENT Lead Offer — {leadNumber}",
      body: "Hi {workerName},\n\nURGENT lead offer:\n\n• Lead: {leadNumber}\n• Grade: EMERGENCY\n• Match Score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nThis customer needs help NOW. Buy the lead immediately:\n{boardUrl}\n\n— {adminName}, WorkersArena Team",
    },
  },
  ar: {
    bronze: {
      subject: "عرض عميل محتمل جديد (برونزي) — {leadNumber}",
      body: "مرحباً {workerName},\n\nلديك عميل محتمل جديد (برونزي):\n\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena",
    },
    silver: {
      subject: "عرض عميل محتمل جديد (فضي) — {leadNumber}",
      body: "مرحباً {workerName},\n\nلديك عميل محتمل جديد (فضي):\n\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena",
    },
    gold: {
      subject: "عرض عميل محتمل جديد (ذهبي) — {leadNumber}",
      body: "مرحباً {workerName},\n\nلديك عميل محتمل جديد (ذهبي):\n\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena",
    },
    emergency: {
      subject: "🚨 عرض عميل عاجل — {leadNumber}",
      body: "مرحباً {workerName},\n\nعرض عميل عاجل:\n\n• الرقم: {leadNumber}\n• الدرجة: طوارئ\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nهذا العميل يحتاج مساعدة الآن. اشتري العميل فوراً:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena",
    },
  },
};

/** Default SMS templates per grade — compact for 160-char limit. */
export const DEFAULT_SMS_TEMPLATES: SmsTemplates = {
  en: {
    bronze: "[WA] New Bronze lead {leadNumber}: {priceCredits} credits. Buy now: {boardUrl}",
    silver: "[WA] New Silver lead {leadNumber}: {priceCredits} credits. Buy now: {boardUrl}",
    gold: "[WA] New Gold lead {leadNumber}: {priceCredits} credits. Buy now: {boardUrl}",
    emergency: "[WA] URGENT lead {leadNumber}: {priceCredits} credits. Buy NOW: {boardUrl}",
  },
  ar: {
    bronze: "[WA] عميل جديد {leadNumber}: {priceCredits} رصيد. اشترِ الآن: {boardUrl}",
    silver: "[WA] عميل جديد {leadNumber}: {priceCredits} رصيد. اشترِ الآن: {boardUrl}",
    gold: "[WA] عميل جديد {leadNumber}: {priceCredits} رصيد. اشترِ الآن: {boardUrl}",
    emergency: "[WA] عميل عاجل {leadNumber}: {priceCredits} رصيد. اشترِ الآن: {boardUrl}",
  },
};

/** §7 pricing defaults — inside the ranges the plan sketches ($3–5 … $20–50). */
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplates = {
  en: {
    bronze: `Hi {workerName} 👋\n\nYou have a new Bronze lead offer:\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team`,
    silver: `Hi {workerName} 👋\n\nYou have a new Silver lead offer:\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team`,
    gold: `Hi {workerName} 👋\n\nYou have a new Gold lead offer:\n• Lead: {leadNumber}\n• Grade: {grade}\n• Match score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nOpen your board to buy this lead before it expires:\n{boardUrl}\n\n— {adminName}, WorkersArena Team`,
    emergency: `🚨 Hi {workerName}!\n\nURGENT lead offer:\n• Lead: {leadNumber}\n• Grade: EMERGENCY\n• Match score: {matchScore}/100\n• Cost: {priceCredits} credits\n\nThis customer needs help NOW. Buy the lead immediately:\n{boardUrl}\n\n— {adminName}, WorkersArena Team`,
  },
  ar: {
    bronze: `مرحباً {workerName} 👋\n\nلديك عميل محتمل جديد (برونزي):\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena`,
    silver: `مرحباً {workerName} 👋\n\nلديك عميل محتمل جديد (فضي):\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena`,
    gold: `مرحباً {workerName} 👋\n\nلديك عميل محتمل جديد (ذهبي):\n• الرقم: {leadNumber}\n• الدرجة: {grade}\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nافتح اللوحة لشراء هذا العميل قبل انتهاء المدة:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena`,
    emergency: `🚨 مرحباً {workerName}!\n\nعرض عميل عاجل:\n• الرقم: {leadNumber}\n• الدرجة: طوارئ\n• نقاط المطابقة: {matchScore}/100\n• التكلفة: {priceCredits} رصيد\n\nهذا العميل يحتاج مساعدة الآن. اشتري العميل فوراً:\n{boardUrl}\n\n— {adminName}, فريق WorkersArena`,
  },
};

export const DEFAULT_LEAD_MARKET_CONFIG: LeadMarketConfig = {
  prices: { bronze: 5, silver: 9, gold: 20, emergency: 35 },
  maxWorkersPerLead: 3,
  offerTtlMinutes: 120,
  exclusive: true,
  reveal: {
    beforePurchase: "masked",
    afterPurchase: "revealed",
    afterPurchaseFreeTier: "masked",
    afterBooking: "revealed",
  },
  weights: DEFAULT_MATCHING_WEIGHTS,
  rebate: DEFAULT_LEAD_REBATE,
  whatsappTemplates: DEFAULT_WHATSAPP_TEMPLATES,
  emailTemplates: DEFAULT_EMAIL_TEMPLATES,
  smsTemplates: DEFAULT_SMS_TEMPLATES,
  notifyChannels: { whatsapp: true, email: true, sms: false },
};

/** The lead-market numbers in force for a rule set (falls back to defaults). */
export function leadMarketConfig(ruleSet: FeeRuleSet): LeadMarketConfig {
  return ruleSet.leadMarket ?? DEFAULT_LEAD_MARKET_CONFIG;
}

/** The credit price of a lead at its grade, plus its USD equivalent (1:1).
 * The optional `ratingMultiplier` (§12) adjusts the price up or down based
 * on the grade's aggregate worker feedback. */
export function leadPrice(
  ruleSet: FeeRuleSet,
  grade: LeadGrade,
  ratingMultiplier = 1.0
): { credits: number; amountMinor: number } {
  const base = Math.max(0, Math.trunc(leadMarketConfig(ruleSet).prices[grade] ?? DEFAULT_LEAD_MARKET_CONFIG.prices[grade]));
  const credits = Math.max(1, Math.round(base * ratingMultiplier));
  return { credits, amountMinor: credits * 100 };
}

/** An offer as the marketplace sees it (persistence adds ids/timestamps). */
export interface LeadOffer {
  id: string;
  /** The job post (QuoteRequest.id) this offer is for. */
  leadId: string;
  /** Human-readable lead number, e.g. QR-2026-00042. */
  leadNumber: string;
  workerId: string;
  grade: LeadGrade;
  /** Match score (0–100) that earned the worker this offer. */
  matchScore: number;
  /** Credit price locked in when the offer was created (never re-priced). */
  priceCredits: number;
  /** Combined rating + smart-pricing multiplier locked for auditability. */
  pricingMultiplier?: number;
  /** Human-readable factors that informed the locked price. */
  pricingReason?: string;
  status: LeadOfferStatus;
  /** True when buying this offer revoked the others (exclusivity). */
  exclusive: boolean;
  offeredAt: string;
  expiresAt: string;
  purchasedAt?: string;
  /** The credit-ledger row that paid for it (audit + idempotency). */
  creditEntryId?: string;
  /** What the buyer may see after the purchase, per the policy in force. */
  contactReveal?: ContactReveal;
}

/** Is this offer still buyable at `atMs`? (Expiry is time-based, not a flag
 * that only a cron can flip.) */
export function offerIsLive(offer: Pick<LeadOffer, "status" | "expiresAt">, atMs: number): boolean {
  if (offer.status !== "offered") return false;
  const expiry = Date.parse(offer.expiresAt);
  return !Number.isFinite(expiry) || expiry > atMs;
}

/** Offers that a new exclusive purchase should revoke (others' pending ones). */
export function offersToRevoke(
  offers: Pick<LeadOffer, "id" | "status" | "expiresAt">[],
  buyerOfferId: string,
  atMs: number
): string[] {
  return offers
    .filter((o) => o.id !== buyerOfferId && offerIsLive(o, atMs))
    .map((o) => o.id);
}

/**
 * §10 — what THIS viewer may see. Order matters: a booked job always reveals
 * (the customer chose that worker); otherwise a purchase reveals per the
 * policy, and a free-tier buyer may still be held at "masked" (the tier lever).
 */
export function contactRevealFor(input: {
  policy: ContactRevealPolicy;
  /** The worker is the buyer of this lead. */
  purchased?: boolean;
  /** The worker's plan tier when they bought. */
  planTier?: "free" | "starter" | "professional" | "growth" | "business";
  /** The lead turned into a confirmed booking for this worker. */
  booked?: boolean;
}): ContactReveal {
  if (input.booked) return input.policy.afterBooking;
  if (!input.purchased) return input.policy.beforePurchase;
  if ((input.planTier ?? "free") === "free") return input.policy.afterPurchaseFreeTier;
  return input.policy.afterPurchase;
}

/* ─────────────────────── Contact reveal display (§10) ─────────────────────── */

/**
 * Obfuscate a contact value for a viewer who may not see it. A masked phone
 * keeps its last two digits — enough for the worker to recognise the customer
 * they are already talking to, not enough to cold-call a list — and a masked
 * email keeps its first character and domain.
 */
export function maskContact(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const [local, domain] = raw.split("@");
    const head = (local ?? "").slice(0, 1);
    return `${head}${"•".repeat(4)}@${domain ?? "•"}`;
  }
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 2) return "•".repeat(4);
  return `${"•".repeat(Math.max(3, compact.length - 2))}${compact.slice(-2)}`;
}

/** What a viewer sees for a value under a reveal state (empty when hidden). */
export function revealContact(value: string | undefined, reveal: ContactReveal): string {
  if (reveal === "revealed") return (value ?? "").trim();
  if (reveal === "masked") return maskContact(value);
  return "";
}

/**
 * §10 — the customer detail row a board row may show. One function so the
 * worker board, the purchased-lead view and any future surface resolve
 * visibility identically (no surface can quietly be the leaky one).
 */
export function revealedContact(input: {
  reveal: ContactReveal;
  name?: string;
  phone?: string;
  email?: string;
}): { name: string; phone: string; email: string; bookedValue: boolean } {
  const reveal = input.reveal;
  return {
    name: reveal === "hidden" ? "" : (input.name ?? "").trim(),
    phone: revealContact(input.phone, reveal),
    email: revealContact(input.email, reveal),
    bookedValue: reveal === "revealed",
  };
}

/** Normalize an admin-edited lead-market config (clamped, no absurd prices). */
export function normalizeLeadMarketConfig(input: Partial<LeadMarketConfig> | undefined): LeadMarketConfig {
  const base = DEFAULT_LEAD_MARKET_CONFIG;
  const prices = { ...base.prices };
  for (const grade of LEAD_GRADES) {
    const value = input?.prices?.[grade];
    prices[grade] = typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), 100_000) : base.prices[grade];
  }
  const weights = { ...base.weights };
  for (const key of Object.keys(base.weights) as Array<keyof MatchingWeights>) {
    const value = input?.weights?.[key];
    weights[key] = typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), 100) : base.weights[key];
  }
  const reveal: Partial<ContactRevealPolicy> = input?.reveal ?? {};
  const keep = (value: unknown, fallback: ContactReveal): ContactReveal =>
    value === "hidden" || value === "masked" || value === "revealed" ? value : fallback;

  const clampNumber = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), min), max) : fallback;

  const rebate: Partial<LeadRebateConfig> = input?.rebate ?? {};
  return {
    prices,
    maxWorkersPerLead: clampNumber(input?.maxWorkersPerLead, base.maxWorkersPerLead, 1, 20),
    offerTtlMinutes: clampNumber(input?.offerTtlMinutes, base.offerTtlMinutes, 5, 10_080),
    exclusive: input?.exclusive === undefined ? base.exclusive : Boolean(input.exclusive),
    rebate: {
      enabled: rebate.enabled === undefined ? base.rebate.enabled : Boolean(rebate.enabled),
      pctBps: clampNumber(rebate.pctBps, base.rebate.pctBps, 0, 10_000),
      // `undefined` means "not configured" (keep the default ceiling — which is
      // none), NOT a $0 ceiling: conflating the two would silently kill every
      // rebate the moment one field was omitted from a save.
      maxMinor:
        rebate.maxMinor === undefined
          ? base.rebate.maxMinor
          : rebate.maxMinor === null
            ? null
            : clampNumber(rebate.maxMinor, base.rebate.maxMinor ?? 0, 0, 10_000_000),
    },
    reveal: {
      beforePurchase: keep(reveal.beforePurchase, base.reveal.beforePurchase),
      afterPurchase: keep(reveal.afterPurchase, base.reveal.afterPurchase),
      afterPurchaseFreeTier: keep(reveal.afterPurchaseFreeTier, base.reveal.afterPurchaseFreeTier),
      afterBooking: keep(reveal.afterBooking, base.reveal.afterBooking),
    },
    weights,
    whatsappTemplates: input?.whatsappTemplates ?? base.whatsappTemplates,
    emailTemplates: input?.emailTemplates ?? base.emailTemplates,
    smsTemplates: input?.smsTemplates ?? base.smsTemplates,
    notifyChannels: {
      whatsapp: input?.notifyChannels?.whatsapp ?? base.notifyChannels.whatsapp,
      email: input?.notifyChannels?.email ?? base.notifyChannels.email,
      sms: input?.notifyChannels?.sms ?? base.notifyChannels.sms,
    },
  };
}

/* ────────────────────── Worker board view model (§7–§10) ────────────────────── */

/** What a worker needs to know about the lead itself (no contact details). */
export interface LeadSummary {
  id: string;
  number: string;
  jobTitle: string;
  note?: string;
  categorySlug: string;
  citySlug: string;
  isEmergency?: boolean;
  serviceNameEn?: string;
  serviceNameAr?: string;
  createdAt?: string;
}

/**
 * One row of the worker's lead board: the offer, the lead as much as the §10
 * policy allows that viewer to see, and the numbers that make the offer
 * decidable (price, expiry, why they were matched).
 *
 * Pure: pass `now` in, so the board, the tests and the admin preview all agree
 * on what is live.
 */
export interface LeadBoardItem {
  offer: LeadOffer;
  lead: LeadSummary;
  reveal: ContactReveal;
  /** Contact details, already masked/hidden per `reveal`. */
  contact: { name: string; phone: string; email: string };
  /** Credit price of this offer (locked at creation) + its USD equivalent. */
  price: { credits: number; amountMinor: number };
  /** Minute-resolution time left (0 once expired). */
  minutesLeft: number;
  /** Buyable right now (status offered AND inside its window). */
  live: boolean;
  /** The viewer bought this lead. */
  purchased: boolean;
  /** The signals that earned this worker the offer ("why you were matched"). */
  reasons: Array<keyof MatchingWeights>;
  /**
   * §11 — what this lead has already given BACK (minor units), once the jobs it
   * produced were completed. Non-zero means the lead paid for itself, which is
   * the one number that decides whether a worker keeps buying leads.
   */
  rebateMinor: number;
  /** Persisted Phase 1 refund decision, when a worker already requested review. */
  refundStatus?: "pending" | "approved" | "rejected";
}

export function leadBoardItemFor(input: {
  offer: LeadOffer;
  lead: LeadSummary;
  policy: ContactRevealPolicy;
  planTier?: "free" | "starter" | "professional" | "growth" | "business";
  /** The lead became a booking for the viewer (customer consent reveals). */
  booked?: boolean;
  /** Customer identity — masked or hidden by the policy. */
  customer?: { name?: string; phone?: string; email?: string };
  /** The match breakdown that earned the offer (matchReasonsFor), when known. */
  reasons?: Array<keyof MatchingWeights>;
  /** §11 — the rebate this lead has already returned (minor units). */
  rebateMinor?: number;
  /** Phase 1 worker-visible refund state. */
  refundStatus?: "pending" | "approved" | "rejected";
  now: number;
}): LeadBoardItem {
  const purchased = input.offer.status === "purchased";
  const reveal = contactRevealFor({
    policy: input.policy,
    purchased,
    ...(input.planTier ? { planTier: input.planTier } : {}),
    ...(input.booked ? { booked: true } : {}),
  });
  const expiry = Date.parse(input.offer.expiresAt);
  const minutesLeft = Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - input.now) / 60_000)) : 0;
  return {
    offer: input.offer,
    lead: input.lead,
    reveal,
    contact: revealedContact({
      reveal,
      name: input.customer?.name,
      phone: input.customer?.phone,
      email: input.customer?.email,
    }),
    price: { credits: input.offer.priceCredits, amountMinor: input.offer.priceCredits * 100 },
    minutesLeft,
    live: offerIsLive(input.offer, input.now),
    purchased,
    reasons: input.reasons ?? [],
    rebateMinor: Math.max(0, Math.trunc(input.rebateMinor ?? 0)),
    ...(input.refundStatus ? { refundStatus: input.refundStatus } : {}),
  };
}

/** The board split the UI renders: live offers first, then history. */
export function splitLeadBoard(items: LeadBoardItem[]): {
  live: LeadBoardItem[];
  owned: LeadBoardItem[];
  past: LeadBoardItem[];
} {
  const live: LeadBoardItem[] = [];
  const owned: LeadBoardItem[] = [];
  const past: LeadBoardItem[] = [];
  for (const item of items) {
    if (item.purchased) owned.push(item);
    else if (item.live) live.push(item);
    else past.push(item);
  }
  const byScore = (a: LeadBoardItem, b: LeadBoardItem) =>
    b.offer.matchScore - a.offer.matchScore || a.offer.id.localeCompare(b.offer.id);
  const byRecent = (a: LeadBoardItem, b: LeadBoardItem) =>
    (b.offer.purchasedAt ?? b.offer.offeredAt).localeCompare(a.offer.purchasedAt ?? a.offer.offeredAt) ||
    a.offer.id.localeCompare(b.offer.id);
  return { live: live.sort(byScore), owned: owned.sort(byRecent), past: past.sort(byRecent) };
}

/** The notification / board deep link for the lead marketplace. */
export const LEAD_BOARD_HREF = "/dashboard/leads";
