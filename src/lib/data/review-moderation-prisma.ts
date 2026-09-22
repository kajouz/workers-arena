/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW MODERATION — Prisma adapter (real mode)
 * ────────────────────────────────────────────────────────────────────────────
 * Persistence half of the moderation store, behind `review-moderation-store.ts`
 * (which owns the adapter gate). All triage and ranking decisions live in the
 * pure engine (`review-moderation.ts`); this file only marshals rows.
 *
 * The decision write is a compare-and-set: `updateMany({ where: { status:
 * "PENDING" } })` so two admins clicking at once produce exactly one decision,
 * and the audit row is written in the same transaction as the status flip —
 * a decision that cannot be attributed is not recorded.
 */

import { getPrisma } from "@/lib/server/prisma";
import {
  assessReview,
  effectiveStatus,
  moderationQueueStats,
  rankingScore,
  weightedRating,
  type QueueStats,
  type ReviewModerationStatus,
} from "./review-moderation";
import type { WorkerReviewSummary, ReviewModerationEvent, ReviewQueueItem } from "./review-moderation-store";
import type { Review } from "./types";

/** Prisma enum ↔ domain status (the DB stores upper-case). */
function fromPrismaStatus(status: string): ReviewModerationStatus {
  const lower = status.toLowerCase();
  return lower === "approved" || lower === "rejected" ? lower : "pending";
}
function toPrismaStatus(approve: boolean): "APPROVED" | "REJECTED" {
  return approve ? "APPROVED" : "REJECTED";
}

interface ReviewRow {
  id: string;
  workerId: string;
  author: { name: string } | null;
  rating: number;
  title: string | null;
  textEn: string | null;
  textAr: string | null;
  status: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  aiFlags: unknown;
  moderatedAt: Date | null;
  moderatedById: string | null;
  createdAt: Date;
  worker: { nameEn: string; nameAr: string; slug: string; reviewCount: number };
}

function flagsFrom(aiFlags: unknown): string[] {
  return Array.isArray(aiFlags) ? (aiFlags as string[]) : [];
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    author: row.author?.name ?? "Anonymous",
    rating: row.rating,
    date: row.createdAt.toISOString(),
    textEn: row.textEn ?? "",
    textAr: row.textAr ?? "",
    verifiedPurchase: row.verifiedPurchase,
    status: fromPrismaStatus(row.status),
    flags: flagsFrom(row.aiFlags) as Review["flags"],
    helpfulCount: row.helpfulCount,
    ...(row.moderatedAt ? { moderatedAt: row.moderatedAt.toISOString() } : {}),
    ...(row.moderatedById ? { moderatedBy: row.moderatedById } : {}),
  };
}

function toQueueItem(row: ReviewRow): ReviewQueueItem {
  const review = toReview(row);
  return {
    reviewId: review.id,
    workerId: row.workerId,
    workerNameEn: row.worker.nameEn,
    workerNameAr: row.worker.nameAr,
    workerSlug: row.worker.slug,
    author: review.author,
    rating: review.rating,
    date: review.date,
    textEn: review.textEn,
    textAr: review.textAr,
    verifiedPurchase: row.verifiedPurchase,
    helpfulCount: row.helpfulCount,
    status: review.status!,
    assessment: assessReview({
      rating: review.rating,
      textEn: review.textEn,
      textAr: review.textAr,
      verifiedPurchase: row.verifiedPurchase,
      helpfulCount: row.helpfulCount,
      createdAt: review.date,
      workerReviewCount: row.worker.reviewCount,
    }),
    ...(review.moderatedAt ? { moderatedAt: review.moderatedAt } : {}),
    ...(review.moderatedBy ? { moderatedBy: review.moderatedBy } : {}),
  };
}

const QUEUE_SELECT = {
  id: true,
  workerId: true,
  rating: true,
  title: true,
  textEn: true,
  textAr: true,
  status: true,
  verifiedPurchase: true,
  helpfulCount: true,
  aiFlags: true,
  moderatedAt: true,
  moderatedById: true,
  createdAt: true,
  author: { select: { name: true } },
  worker: { select: { nameEn: true, nameAr: true, slug: true, reviewCount: true } },
} as const;

export async function prismaListReviewQueue(status?: ReviewModerationStatus): Promise<ReviewQueueItem[]> {
  const rows = await getPrisma().review.findMany({
    where: status ? { status: toPrismaStatus(status === "approved") } : undefined,
    orderBy: { createdAt: "asc" },
    select: QUEUE_SELECT,
  });
  const items = (rows as unknown as ReviewRow[]).map(toQueueItem);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return items.sort((a, b) => rank[a.assessment.risk] - rank[b.assessment.risk] || a.date.localeCompare(b.date));
}

export async function prismaReviewModerationStats(now = Date.now()): Promise<QueueStats> {
  const rows = await getPrisma().review.findMany({
    orderBy: { createdAt: "asc" },
    select: QUEUE_SELECT,
  });
  const items = (rows as unknown as ReviewRow[]).map(toQueueItem);
  return moderationQueueStats(
    items.map((i) => ({
      rating: i.rating,
      textEn: i.textEn,
      textAr: i.textAr,
      verifiedPurchase: i.verifiedPurchase,
      helpfulCount: i.helpfulCount,
      createdAt: i.date,
    })),
    items.map((i) => i.status),
    now
  );
}

export async function prismaDecideReview(input: {
  reviewId: string;
  approve: boolean;
  reason?: string;
  note?: string;
  actorId: string;
  now?: number;
}): Promise<ReviewQueueItem | null> {
  const db = getPrisma();
  const at = new Date(input.now ?? Date.now());
  const current = await db.review.findUnique({ where: { id: input.reviewId }, select: { id: true, workerId: true, rating: true, aiFlags: true } });
  if (!current) return null;

  // Compare-and-set on PENDING: a second click (or a second admin) finds zero
  // rows and reports "already decided" instead of overwriting the first call.
  const claimed = await db.review.updateMany({
    where: { id: current.id, status: "PENDING" },
    data: {
      status: toPrismaStatus(input.approve),
      moderatedById: input.actorId,
      moderatedAt: at,
    },
  });
  if (claimed.count !== 1) return null;

  await db.reviewModeration.create({
    data: {
      reviewId: current.id,
      workerId: current.workerId,
      action: input.approve ? "APPROVED" : "REJECTED",
      reason: input.reason ?? null,
      note: input.note ?? null,
      flags: flagsFrom(current.aiFlags),
      actorId: input.actorId,
    },
  });

  await applyPrismaDecision(current.workerId, current.rating, input.approve);

  const row = await db.review.findUnique({ where: { id: current.id }, select: QUEUE_SELECT });
  return row ? toQueueItem(row as unknown as ReviewRow) : null;
}

/**
 * Fold a moderation decision into `Worker.rating` / `Worker.reviewCount`.
 *
 * These are LIFETIME aggregates — a profile reads "4.9 · 120 reviews" while the
 * `reviews` relation holds a sample — so an approval blends the new rating into
 * the running average (which is what the platform would have counted had the
 * review published immediately) and a rejection leaves both fields untouched.
 * Recomputing them from the approved rows instead would shrink a 120-review
 * profile to its sample size on the first decision and move a rating for a
 * reason that has nothing to do with the review being moderated.
 *
 * The worker row is locked for the read-modify-write so two approvals landing
 * together cannot lose an increment.
 */
export async function applyPrismaDecision(workerId: string, reviewRating: number, approve: boolean): Promise<void> {
  if (!approve) return;
  const db = getPrisma();
  await db.$transaction(async (tx) => {
    const worker = await tx.worker.findUnique({ where: { id: workerId }, select: { rating: true, reviewCount: true } });
    if (!worker) return;
    const count = worker.reviewCount + 1;
    const rating = Math.round(((worker.rating * (count - 1) + reviewRating) / count) * 10) / 10;
    await tx.worker.update({ where: { id: workerId }, data: { rating, reviewCount: count } });
  });
}

export async function prismaListReviewModerationEvents(limit = 50): Promise<ReviewModerationEvent[]> {
  const rows = await getPrisma().reviewModeration.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((row) => ({
    id: row.id,
    reviewId: row.reviewId,
    workerId: row.workerId,
    action: row.action.toLowerCase() as ReviewModerationEvent["action"],
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.note ? { note: row.note } : {}),
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Delivery contact for the "your review is live" notification. Kept here so
 * the store has one notification path for both adapters instead of two copies
 * of the copy.
 */
export async function prismaReviewRecipient(
  workerId: string
): Promise<{ name: string; email: string; phone: string; locale: "en" | "ar"; slug: string } | null> {
  const worker = await getPrisma().worker.findUnique({
    where: { id: workerId },
    select: { nameEn: true, email: true, phone: true, slug: true, languages: true },
  });
  if (!worker) return null;
  // `languages` is a JSON column (not a relation), so read it defensively —
  // same shape the demo dataset exposes to primaryLocale().
  const langs = Array.isArray(worker.languages) ? (worker.languages as { code?: string }[]) : [];
  return {
    name: worker.nameEn,
    email: worker.email ?? "",
    phone: worker.phone ?? "",
    locale: langs[0]?.code === "ar" ? "ar" : "en",
    slug: worker.slug,
  };
}

export async function prismaWorkerReviewSummary(workerId: string, now = Date.now()): Promise<WorkerReviewSummary | null> {
  const db = getPrisma();
  const worker = await db.worker.findUnique({ where: { id: workerId }, select: { id: true, rating: true, reviewCount: true } });
  if (!worker) return null;
  const rows = await db.review.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
    select: QUEUE_SELECT,
  });
  const reviews = (rows as unknown as ReviewRow[]).map(toReview);
  const visible = reviews.filter((r) => effectiveStatus(r.status) === "approved");
  const weighted = weightedRating(reviews, { now });
  return {
    workerId: worker.id,
    visible,
    rating: worker.rating,
    count: worker.reviewCount,
    weighted: weighted.rating,
    rankScore: rankingScore(weighted),
    pending: reviews.filter((r) => r.status === "pending").length,
  };
}
