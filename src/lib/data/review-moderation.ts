/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW MODERATION — the pure half (triage signals + weighted ranking)
 * ────────────────────────────────────────────────────────────────────────────
 * `Review` has carried `status`, `aiFlags`, `moderatedById` and `moderatedAt`
 * since the schema was written, but nothing ever set or read them: every
 * submitted review published itself instantly, and the star average treated a
 * one-line drive-by exactly like a detailed verified job. This module is the
 * decision layer that was missing — it says how risky a review looks, how long
 * the queue has been waiting, and what a worker's rating should be once only
 * moderated reviews count.
 *
 * Two consumers, deliberately separated from the mutating store
 * (`review-moderation-store.ts`):
 *
 *   • the admin queue   → assessReview + moderationQueueStats (triage)
 *   • discovery ranking → weightedRating + rankingScore
 *
 * Everything here is pure and clock-injected so the thresholds can be tested
 * without a database or a real "now".
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type ReviewModerationStatus = "pending" | "approved" | "rejected";

export const REVIEW_REJECTION_REASONS = [
  "spam",
  "abusive",
  "contact-info",
  "off-topic",
  "fake",
  "incentivized",
  "duplicate",
  "other",
] as const;
export type ReviewRejectionReason = (typeof REVIEW_REJECTION_REASONS)[number];

/** Advisory triage signals. Nothing here is applied without an admin decision. */
export type ReviewFlagCode =
  | "no-text"
  | "too-short"
  | "link"
  | "contact-info"
  | "shouting"
  | "unverified"
  | "just-submitted"
  | "repeat-author"
  | "author-history"
  | "extreme-rating";

export type ReviewFlagSeverity = "info" | "warn" | "danger";

export interface ReviewFlag {
  code: ReviewFlagCode;
  severity: ReviewFlagSeverity;
}

export type ReviewRisk = "low" | "medium" | "high";
export type ReviewRecommendation = "approve" | "review" | "reject";

/** The subset of a review the triage needs. Kept structural, not nominal. */
export interface ReviewSignals {
  rating: number;
  textEn?: string;
  textAr?: string;
  verifiedPurchase?: boolean;
  helpfulCount?: number;
  /** ISO submission time (the queue's age clock). */
  createdAt: string;
  /** How many reviews this author has submitted all-time (repeat-spam signal). */
  authorReviewCount?: number;
  /** How many of them an admin rejected (history signal). */
  authorRejections?: number;
  workerReviewCount?: number;
  /** Injected clock — tests pin it instead of sleeping. */
  now?: number;
}

export interface ReviewAssessment {
  flags: ReviewFlag[];
  risk: ReviewRisk;
  /** Weighted sum; only used to order the queue and to pick the risk band. */
  score: number;
  recommendation: ReviewRecommendation;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/** An unreviewed queue older than this counts as a breach (admin digest). */
export const REVIEW_MODERATION_SLA_HOURS = 24;

/** Below this, a review is a rating with no reasoning to moderate. */
export const REVIEW_MIN_TEXT_LENGTH = 12;

/** "Just submitted" window — a fresh review is not evidence of a burst trend. */
const BURST_WINDOW_HOURS = 1;

/** Authors past this many submissions get a repeat-author info flag. */
const REPEAT_AUTHOR_REVIEWS = 3;

/** This many prior rejections makes further reviews worth a second look. */
const AUTHOR_REJECTION_LIMIT = 2;

const SEVERITY_WEIGHT: Record<ReviewFlagSeverity, number> = { info: 1, warn: 3, danger: 6 };

/** Score at/above which the queue calls a review high risk. */
const HIGH_RISK_SCORE = 8;
/** Score at/above which the queue calls a review medium risk. */
const MEDIUM_RISK_SCORE = 3;

// ── Signal extraction ───────────────────────────────────────────────────────

const LINK_RE = /\b(?:https?:\/\/|www\.)\S+/i;
// Phone-shaped runs and e-mail addresses: contact details belong in the
// platform's leads, not in a public review — sharing them is the main reason a
// review gets rejected, so it is worth flagging hard.
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;

/** The longer of the two locales' text — what the author actually wrote. */
export function reviewBody(signals: Pick<ReviewSignals, "textEn" | "textAr">): string {
  const en = signals.textEn ?? "";
  const ar = signals.textAr ?? "";
  return en.length >= ar.length ? en : ar;
}

/**
 * Text-level signals. Separated from `assessReview` so the admin panel can
 * highlight the offending substring without re-deriving the rules.
 */
export function scanReviewText(text: string): ReviewFlagCode[] {
  const flags: ReviewFlagCode[] = [];
  const trimmed = text.trim();
  if (!trimmed) return ["no-text"];
  if (trimmed.length < REVIEW_MIN_TEXT_LENGTH) flags.push("too-short");
  if (LINK_RE.test(trimmed)) flags.push("link");
  if (PHONE_RE.test(trimmed) || EMAIL_RE.test(trimmed)) flags.push("contact-info");
  // Shouting: long enough to be a sentence, and mostly capitals. Arabic has no
  // case, so this can only ever fire on the Latin text.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.6) flags.push("shouting");
  }
  return flags;
}

const SEVERITY_OF: Record<ReviewFlagCode, ReviewFlagSeverity> = {
  // A review with no reasoning to moderate cannot be waved through on its
  // merits — someone has to decide whether "good" is worth publishing, so both
  // text-quality signals carry weight rather than ranking as clean.
  "no-text": "warn",
  "too-short": "warn",
  link: "danger",
  "contact-info": "danger",
  shouting: "warn",
  unverified: "info",
  "just-submitted": "info",
  "repeat-author": "info",
  "author-history": "warn",
  "extreme-rating": "info",
};

function flag(code: ReviewFlagCode): ReviewFlag {
  return { code, severity: SEVERITY_OF[code] };
}

/**
 * Triage one review. Deliberately ADVISORY: `recommendation` orders the queue
 * and gives the admin a starting point, but it is never applied on its own —
 * every status change goes through `decideReview`, attributed to an admin.
 */
export function assessReview(signals: ReviewSignals): ReviewAssessment {
  const now = signals.now ?? Date.now();
  const text = reviewBody(signals);
  const codes = scanReviewText(text);

  if (!signals.verifiedPurchase) codes.push("unverified");

  const ageHours = (now - Date.parse(signals.createdAt)) / 3_600_000;
  if (Number.isFinite(ageHours) && ageHours < BURST_WINDOW_HOURS) codes.push("just-submitted");

  if ((signals.authorReviewCount ?? 0) > REPEAT_AUTHOR_REVIEWS) codes.push("repeat-author");
  if ((signals.authorRejections ?? 0) >= AUTHOR_REJECTION_LIMIT) codes.push("author-history");

  // A bare 1★ or 5★ with no reasoning carries less information than the
  // average it drags — worth an admin glance, not a rejection.
  if ((signals.rating <= 1 || signals.rating >= 5) && codes.includes("too-short")) {
    codes.push("extreme-rating");
  }

  const flags = codes.map(flag);
  const score = flags.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const risk: ReviewRisk = score >= HIGH_RISK_SCORE ? "high" : score >= MEDIUM_RISK_SCORE ? "medium" : "low";
  const recommendation: ReviewRecommendation =
    risk === "high" && flags.some((f) => f.severity === "danger")
      ? "reject"
      : risk === "low"
        ? "approve"
        : "review";

  return { flags, risk, score, recommendation };
}

// ── Queue health ────────────────────────────────────────────────────────────

export interface QueueStats {
  pending: number;
  approved: number;
  rejected: number;
  /** Age of the oldest still-undecided review, in hours (0 when none). */
  oldestPendingHours: number;
  /** Pending reviews past REVIEW_MODERATION_SLA_HOURS. */
  slaBreached: number;
  risk: Record<ReviewRisk, number>;
}

/**
 * The numbers the admin digest reports. `byRisk` runs triage over the pending
 * set so the queue can be sorted without the caller re-deriving the score.
 */
export function moderationQueueStats(
  reviews: ReviewSignals[],
  statuses: ReviewModerationStatus[],
  now = Date.now()
): QueueStats {
  const stats: QueueStats = { pending: 0, approved: 0, rejected: 0, oldestPendingHours: 0, slaBreached: 0, risk: { low: 0, medium: 0, high: 0 } };
  reviews.forEach((signals, i) => {
    const status = statuses[i] ?? "pending";
    stats[status] += 1;
    if (status !== "pending") return;
    const ageHours = Math.max(0, (now - Date.parse(signals.createdAt)) / 3_600_000);
    if (ageHours > stats.oldestPendingHours) stats.oldestPendingHours = ageHours;
    if (ageHours > REVIEW_MODERATION_SLA_HOURS) stats.slaBreached += 1;
    stats.risk[assessReview({ ...signals, now }).risk] += 1;
  });
  return stats;
}

// ── Weighted ranking ────────────────────────────────────────────────────────

/**
 * Reviews seeded before moderation existed (and the demo dataset) carry no
 * status. Treating them as pending would blank every existing profile's rating,
 * so absent means approved — the pre-moderation default — while a review with
 * an explicit `pending` is exactly what the queue is for.
 */
export function effectiveStatus(status: ReviewModerationStatus | undefined): ReviewModerationStatus {
  return status ?? "approved";
}

/** Public surfaces (profile, star breakdown, search) see approved reviews only. */
export function visibleReviews<T extends { status?: ReviewModerationStatus }>(reviews: T[]): T[] {
  return reviews.filter((r) => effectiveStatus(r.status) === "approved");
}

export interface WeightedRatingOptions {
  /** Prior weight: how many "average" reviews a brand-new profile is worth. */
  priorCount?: number;
  /** Prior mean — the platform-wide average a thin profile is pulled toward. */
  priorMean?: number;
  /** Half-life in days for recency decay (recent work matters more). */
  halfLifeDays?: number;
  now?: number;
}

export interface WeightedRating {
  /** Bayesian weighted mean, 1 decimal — what discovery ranks on. */
  rating: number;
  /** Plain arithmetic mean of the counted reviews (0 when none). */
  raw: number;
  /** How many approved reviews the figure is built from. */
  count: number;
  /** Sum of the weights — how much evidence backs `rating`. */
  weight: number;
}

/**
 * Bayesian ("true Bayesian estimate") average over APPROVED reviews, with each
 * review weighted by how much it should count:
 *
 *   • verified purchase  ×1.5  — someone who actually paid has more standing
 *   • recency            0.5^(ageDays/halfLife) — this year's work matters more
 *   • helpful votes      1 + min(helpful,10)/10 ×0.5 — the useful ones lead
 *
 * The prior keeps a 1-review profile from outranking a 200-review one: a single
 * 5★ sits near `priorMean` until real evidence accumulates. That is the whole
 * point of weighting rather than averaging.
 */
export function weightedRating<T extends { rating: number; status?: ReviewModerationStatus; verifiedPurchase?: boolean; helpfulCount?: number; date: string }>(
  reviews: T[],
  options: WeightedRatingOptions = {}
): WeightedRating {
  const { priorCount = 5, priorMean = 4.2, halfLifeDays = 180 } = options;
  const now = options.now ?? Date.now();

  const approved = visibleReviews(reviews).filter((r) => Number.isFinite(r.rating));
  if (approved.length === 0) return { rating: 0, raw: 0, count: 0, weight: 0 };

  let weightedSum = 0;
  let weight = 0;
  let rawSum = 0;

  for (const review of approved) {
    const ageDays = Math.max(0, (now - Date.parse(review.date)) / 86_400_000);
    const recency = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / halfLifeDays) : 1;
    const verified = review.verifiedPurchase ? 1.5 : 1;
    const helpful = 1 + (Math.min(Math.max(review.helpfulCount ?? 0, 0), 10) / 10) * 0.5;
    const w = verified * recency * helpful;
    weightedSum += w * review.rating;
    weight += w;
    rawSum += review.rating;
  }

  const rating = (priorCount * priorMean + weightedSum) / (priorCount + weight);
  return {
    rating: Math.round(rating * 10) / 10,
    raw: Math.round((rawSum / approved.length) * 10) / 10,
    count: approved.length,
    weight: Math.round(weight * 100) / 100,
  };
}

export interface RankingOptions extends WeightedRatingOptions {
  /** How much review volume can lift a profile (log-scaled). */
  volumeWeight?: number;
}

/**
 * Discovery ordering score: the weighted rating plus a log-scaled volume lift,
 * so a 4.8 from 500 jobs edges out a 4.8 from 3. Returned on the same 0–5 scale
 * as a rating so callers can compare it with the plain number they may already
 * display; ordering is what it is for, not presentation.
 */
export function rankingScore(reviewed: WeightedRating, options: RankingOptions = {}): number {
  const { volumeWeight = 0.12 } = options;
  if (reviewed.count === 0) return 0;
  const volumeLift = volumeWeight * Math.log10(1 + reviewed.count);
  return Math.round((reviewed.rating + volumeLift) * 100) / 100;
}
