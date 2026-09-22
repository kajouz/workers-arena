/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW MODERATION — the mutable half (admin queue, decisions, audit trail)
 * ────────────────────────────────────────────────────────────────────────────
 * The pure decisions live in `review-moderation.ts`. This module owns state,
 * following the app's two-adapter convention:
 *
 *   • demo → the in-memory demo workforce's review arrays (+ a globalThis audit
 *            log), so the admin queue is explorable with no database
 *   • real → `Review.status` / `moderatedById` rows plus a `ReviewModeration`
 *            audit row per decision (review-moderation-prisma.ts)
 *
 * Two invariants this module is responsible for:
 *
 *   1. A decision is attributed and one-shot. A review that is no longer
 *      pending cannot be decided twice, and every transition lands in the
 *      audit log with the admin who made it.
 *   2. The worker's DISPLAYED rating is recomputed from approved reviews only,
 *      so rejecting a review actually removes its influence instead of leaving
 *      the number it produced behind. Discovery ordering uses the weighted
 *      figure from the pure engine instead — see `workerReviewSummary`.
 */

import { logAdminActivity, ACTION_CODES } from "./activity";
import {
  assessReview,
  effectiveStatus,
  moderationQueueStats,
  rankingScore,
  visibleReviews,
  weightedRating,
  type QueueStats,
  type ReviewAssessment,
  type ReviewModerationStatus,
  type ReviewRejectionReason,
} from "./review-moderation";
import { WORKERS, workerById } from "./workers";
import type { Review } from "./types";

function realEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}
function prisma() {
  return import("./review-moderation-prisma");
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ReviewQueueItem {
  reviewId: string;
  workerId: string;
  workerNameEn: string;
  workerNameAr: string;
  workerSlug: string;
  author: string;
  rating: number;
  date: string;
  textEn: string;
  textAr: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  status: ReviewModerationStatus;
  assessment: ReviewAssessment;
  moderatedAt?: string;
  moderatedBy?: string;
  rejectionReason?: string;
}

export type ReviewModerationAction = "approved" | "rejected" | "restored";

export interface ReviewModerationEvent {
  id: string;
  reviewId: string;
  workerId: string;
  action: ReviewModerationAction;
  reason?: string;
  note?: string;
  actorId: string;
  createdAt: string;
}

export interface WorkerReviewSummary {
  workerId: string;
  /** Approved reviews only — what the profile renders. */
  visible: Review[];
  /** Plain mean of the approved reviews (the stars on the profile). */
  rating: number;
  count: number;
  /** Bayesian/recency-weighted figure — what discovery ranks on. */
  weighted: number;
  rankScore: number;
  /** How many reviews are waiting on an admin for this worker. */
  pending: number;
}

// ── Demo store ──────────────────────────────────────────────────────────────

interface DemoStore {
  seq: number;
  events: ReviewModerationEvent[];
}
const key = "__workersArenaReviewModeration";
const root = globalThis as Record<string, unknown>;
const STORE: DemoStore = (root[key] as DemoStore | undefined) ?? (root[key] = { seq: 0, events: [] });

export function resetReviewModerationStore(): void {
  STORE.seq = 0;
  STORE.events = [];
  // Drop the statuses this store wrote so a test can start from the pristine
  // demo dataset (the reviews themselves are shared module state).
  for (const worker of WORKERS) {
    for (const review of worker.reviews) {
      delete review.status;
      delete review.flags;
      delete review.moderatedAt;
      delete review.moderatedBy;
      delete review.rejectionReason;
    }
  }
}

function toQueueItem(worker: (typeof WORKERS)[number], review: Review): ReviewQueueItem {
  const status = effectiveStatus(review.status);
  return {
    reviewId: review.id,
    workerId: worker.id,
    workerNameEn: worker.nameEn,
    workerNameAr: worker.nameAr,
    workerSlug: worker.slug,
    author: review.author,
    rating: review.rating,
    date: review.date,
    textEn: review.textEn,
    textAr: review.textAr,
    verifiedPurchase: Boolean(review.verifiedPurchase),
    helpfulCount: review.helpfulCount ?? 0,
    status,
    assessment: assessReview({
      rating: review.rating,
      textEn: review.textEn,
      textAr: review.textAr,
      verifiedPurchase: review.verifiedPurchase,
      helpfulCount: review.helpfulCount,
      createdAt: review.date,
      workerReviewCount: worker.reviewCount,
    }),
    ...(review.moderatedAt ? { moderatedAt: review.moderatedAt } : {}),
    ...(review.moderatedBy ? { moderatedBy: review.moderatedBy } : {}),
    ...(review.rejectionReason ? { rejectionReason: review.rejectionReason } : {}),
  };
}

function findDemoReview(reviewId: string): { worker: (typeof WORKERS)[number]; review: Review } | null {
  for (const worker of WORKERS) {
    const review = worker.reviews.find((r) => r.id === reviewId);
    if (review) return { worker, review };
  }
  return null;
}

/**
 * Fold a decision into the worker's aggregate.
 *
 * `reviewCount` is the LIFETIME number of reviews — a profile reads "4.9 · 120
 * reviews" while the renderable `reviews` array is a sample of the latest few.
 * Recomputing the pair from the sample would collapse 120 to 5 and replace a
 * real average with the mean of five rows, so an approval instead blends the
 * new rating into the existing average (the same arithmetic a live platform
 * does) and a rejection changes nothing at all — which is the entire point of
 * rejecting.
 */
function applyDemoDecision(worker: (typeof WORKERS)[number], review: Review, approve: boolean): void {
  if (!approve) return;
  const count = worker.reviewCount + 1;
  worker.reviewCount = count;
  worker.rating = Math.round(((worker.rating * (count - 1) + review.rating) / count) * 10) / 10;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function listReviewQueue(status?: ReviewModerationStatus): Promise<ReviewQueueItem[]> {
  if (realEnabled()) return (await prisma()).prismaListReviewQueue(status);
  const items: ReviewQueueItem[] = [];
  for (const worker of WORKERS) for (const review of worker.reviews) items.push(toQueueItem(worker, review));
  const filtered = status ? items.filter((i) => i.status === status) : items;
  // Risk first (dangers surface at the top), then oldest — the order an admin
  // should work the queue in.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return filtered.sort(
    (a, b) => rank[a.assessment.risk] - rank[b.assessment.risk] || a.date.localeCompare(b.date)
  );
}

export async function getReviewModerationStats(now = Date.now()): Promise<QueueStats> {
  if (realEnabled()) return (await prisma()).prismaReviewModerationStats(now);
  const signals: Parameters<typeof moderationQueueStats>[0] = [];
  const statuses: ReviewModerationStatus[] = [];
  for (const worker of WORKERS) {
    for (const review of worker.reviews) {
      signals.push({
        rating: review.rating,
        textEn: review.textEn,
        textAr: review.textAr,
        verifiedPurchase: review.verifiedPurchase,
        helpfulCount: review.helpfulCount,
        createdAt: review.date,
        workerReviewCount: worker.reviewCount,
      });
      statuses.push(effectiveStatus(review.status));
    }
  }
  return moderationQueueStats(signals, statuses, now);
}

export async function listReviewModerationEvents(limit = 50): Promise<ReviewModerationEvent[]> {
  if (realEnabled()) return (await prisma()).prismaListReviewModerationEvents(limit);
  return [...STORE.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export interface DecideReviewInput {
  reviewId: string;
  approve: boolean;
  reason?: ReviewRejectionReason | string;
  note?: string;
  actorId: string;
  now?: number;
}

/** The demo half of `decideReview` — mutates the in-memory review in place. */
function decideReviewDemo(input: DecideReviewInput): ReviewQueueItem | null {
  const found = findDemoReview(input.reviewId);
  if (!found || effectiveStatus(found.review.status) !== "pending") return null;
  const { worker, review } = found;
  const at = new Date(input.now ?? Date.now()).toISOString();

  review.status = input.approve ? "approved" : "rejected";
  review.moderatedAt = at;
  review.moderatedBy = input.actorId;
  if (input.approve) {
    delete review.rejectionReason;
  } else if (input.reason) {
    review.rejectionReason = String(input.reason);
  }
  applyDemoDecision(worker, review, input.approve);

  STORE.events.push({
    id: `rmev-${++STORE.seq}`,
    reviewId: review.id,
    workerId: worker.id,
    action: input.approve ? "approved" : "rejected",
    ...(input.reason ? { reason: String(input.reason) } : {}),
    ...(input.note ? { note: input.note } : {}),
    actorId: input.actorId,
    createdAt: at,
  });

  return toQueueItem(worker, review);
}

/**
 * Tell the worker their review is live. Sent on APPROVAL, not on submission:
 * an unmoderated review is not yet a reputation event, and telling them to
 * "see what they wrote on your profile" while a queue holds it would point at
 * a page that doesn't show it.
 */
async function notifyReviewPublished(item: ReviewQueueItem): Promise<void> {
  const { pushNotification } = await import("./notifications");
  if (realEnabled()) {
    const contact = await (await prisma()).prismaReviewRecipient(item.workerId);
    if (!contact) return;
    await pushNotification(
      {
        type: "review",
        titleEn: `New ${item.rating}-star review`,
        titleAr: `تقييم جديد ${item.rating} نجوم`,
        bodyEn: `${item.author} rated you ${item.rating}/5 — see what they wrote on your profile.`,
        bodyAr: `${item.author} منحك ${item.rating}/5 — اطّلع على ما كتبوه في ملفك.`,
        href: `/workers/${contact.slug}`,
      },
      contact
    );
    return;
  }
  const worker = workerById(item.workerId);
  if (!worker) return;
  await pushNotification(
    {
      type: "review",
      titleEn: `New ${item.rating}-star review`,
      titleAr: `تقييم جديد ${item.rating} نجوم`,
      bodyEn: `${item.author} rated you ${item.rating}/5 — see what they wrote on your profile.`,
      bodyAr: `${item.author} منحك ${item.rating}/5 — اطّلع على ما كتبوه في ملفك.`,
      href: `/workers/${worker.slug}`,
    },
    {
      name: worker.nameEn,
      email: worker.email,
      phone: worker.phone,
      locale: worker.languages[0]?.code === "ar" ? "ar" : "en",
    }
  );
}

/**
 * Approve or reject a review. Returns null when the review is unknown or was
 * already decided (the caller re-reads the queue), so a double-click cannot
 * flip an approved review or award the decision twice. The audit entry and the
 * worker notification happen once, for either adapter, after the decision
 * actually landed.
 */
export async function decideReview(input: DecideReviewInput): Promise<ReviewQueueItem | null> {
  const result = realEnabled() ? await (await prisma()).prismaDecideReview(input) : decideReviewDemo(input);
  if (!result) return null;

  await logAdminActivity({
    code: input.approve ? ACTION_CODES.REVIEW_APPROVED : ACTION_CODES.REVIEW_REJECTED,
    actionEn: `${input.actorId} ${input.approve ? "approved" : "rejected"} the review on ${result.workerNameEn} (${result.rating}★${input.reason ? `, ${input.reason}` : ""})`,
    actionAr: `${input.actorId} ${input.approve ? "وافق على" : "رفض"} تقييم ${result.workerNameAr} (${result.rating}★${input.reason ? `، ${input.reason}` : ""})`,
    actor: input.actorId,
    type: "system",
  });
  if (result.status === "approved") await notifyReviewPublished(result);

  return result;
}

/**
 * What a profile and discovery should show for one worker: the approved
 * reviews, the plain mean a reader can verify, and the weighted figure the
 * ranking uses.
 */
export async function workerReviewSummary(workerId: string, now = Date.now()): Promise<WorkerReviewSummary | null> {
  if (realEnabled()) return (await prisma()).prismaWorkerReviewSummary(workerId, now);
  const worker = workerById(workerId);
  if (!worker) return null;
  const approved = visibleReviews(worker.reviews);
  const weighted = weightedRating(worker.reviews, { now });
  return {
    workerId: worker.id,
    visible: approved,
    rating: worker.rating,
    count: worker.reviewCount,
    weighted: weighted.rating,
    rankScore: rankingScore(weighted),
    pending: worker.reviews.length - approved.length,
  };
}

/** Reviews awaiting an admin, oldest first — the digest's queue line. */
export async function pendingReviewCount(): Promise<number> {
  return (await getReviewModerationStats()).pending;
}
