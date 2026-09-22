/**
 * Review-moderation store (demo adapter) — the gate that publishes a review.
 *
 * The behaviours pinned here are the ones that make moderation real rather than
 * cosmetic: a submitted review is invisible and uncounted until an admin
 * decides, the decision is one-shot, a rejection removes the review's influence
 * from the worker's rating, and every decision is attributed in the audit log.
 *
 * Each test cleans up the review it added: the demo workforce is shared module
 * state, so leaving rows behind would leak a rating change into the next test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORKERS, workerById } from "../src/lib/data/workers";
import { resetAdminActivityFeed } from "../src/lib/data/activity";
import {
  decideReview,
  getReviewModerationStats,
  listReviewModerationEvents,
  listReviewQueue,
  resetReviewModerationStore,
  workerReviewSummary,
} from "../src/lib/data/review-moderation-store";

/** A demo worker with seeded reviews. */
const WORKER_ID = WORKERS[0]!.id;
const addedIds: string[] = [];
/**
 * The seeded aggregates, captured at module load (before any test runs) so the
 * cleanup restores them rather than deleting fields off the shared workers.
 */
const pristine = new Map(WORKERS.map((w) => [w.id, { rating: w.rating, reviewCount: w.reviewCount }]));

async function submit(over: { rating?: number; text?: string; verifiedPurchase?: boolean } = {}) {
  const { addReview } = await import("../src/lib/data/repo");
  const review = await addReview(WORKER_ID, {
    author: "Test Customer",
    rating: over.rating ?? 5,
    textEn: over.text ?? "Fixed the leak quickly and left the kitchen spotless.",
    textAr: over.text ?? "أصلح التسريب بسرعة وترك المطبخ نظيفًا.",
    verifiedPurchase: over.verifiedPurchase ?? true,
  });
  if (review) addedIds.push(review.id);
  return review;
}

beforeEach(() => {
  resetReviewModerationStore();
  resetAdminActivityFeed();
  addedIds.length = 0;
});

afterEach(() => {
  // Undo the submission: drop the rows this test added and put the worker's
  // aggregate back to its seeded value.
  for (const worker of WORKERS) {
    worker.reviews = worker.reviews.filter((r) => !addedIds.includes(r.id));
    const seeded = pristine.get(worker.id);
    if (seeded) {
      worker.rating = seeded.rating;
      worker.reviewCount = seeded.reviewCount;
    }
  }
  resetReviewModerationStore();
  addedIds.length = 0;
});

describe("submitReview → pending", () => {
  it("stores the review without publishing it or moving the rating", async () => {
    const worker = workerById(WORKER_ID)!;
    const beforeRating = worker.rating;
    const beforeCount = worker.reviewCount;

    const review = await submit();

    expect(review?.status).toBe("pending");
    // Still in the underlying dataset (the queue reads it)…
    expect(worker.reviews.some((r) => r.id === review!.id)).toBe(true);
    // …but the aggregate is untouched: moderation is what makes it count.
    expect(worker.rating).toBe(beforeRating);
    expect(worker.reviewCount).toBe(beforeCount);
  });

  it("keeps the pending review off the public profile read", async () => {
    const { getWorkerBySlug } = await import("../src/lib/data/repo");
    const worker = workerById(WORKER_ID)!;
    const review = await submit();
    const profile = await getWorkerBySlug(worker.slug);
    expect(profile!.reviews.some((r) => r.id === review!.id)).toBe(false);
    // and the profile's own star count still reflects approved reviews
    expect(profile!.reviews).toHaveLength(worker.reviews.filter((r) => r.status === undefined || r.status === "approved").length);
  });

  it("puts the review in the queue with triage attached", async () => {
    const review = await submit({ text: "Book me directly: +961 70 123456 or www.cheap.example.com" });
    const queue = await listReviewQueue("pending");
    const item = queue.find((i) => i.reviewId === review!.id);
    expect(item).toBeDefined();
    expect(item!.assessment.risk).not.toBe("low");
    expect(item!.assessment.flags.map((f) => f.code)).toContain("contact-info");
    expect(item!.status).toBe("pending");
  });
});

describe("decideReview", () => {
  it("publishes on approval, counts it, and attributes the decision", async () => {
    const worker = workerById(WORKER_ID)!;
    const beforeCount = worker.reviewCount;
    const beforeRating = worker.rating;
    const review = await submit();

    const decided = await decideReview({ reviewId: review!.id, approve: true, actorId: "u-admin" });

    expect(decided?.status).toBe("approved");
    expect(decided?.moderatedBy).toBe("u-admin");
    // Lifetime count grows by one; the rating is the running average blended
    // with the new stars (reviewCount is a lifetime total, NOT the sample size).
    expect(worker.reviewCount).toBe(beforeCount + 1);
    const expected = Math.round(((review!.rating + beforeRating * beforeCount) / (beforeCount + 1)) * 10) / 10;
    expect(worker.rating).toBe(expected);

    const events = await listReviewModerationEvents();
    expect(events[0]).toMatchObject({ reviewId: review!.id, action: "approved", actorId: "u-admin" });
    expect(await listReviewQueue("pending")).not.toContainEqual(expect.objectContaining({ reviewId: review!.id }));
  });

  it("rejects with a reason, leaving the aggregate completely untouched", async () => {
    const worker = workerById(WORKER_ID)!;
    const beforeRating = worker.rating;
    const beforeCount = worker.reviewCount;
    const review = await submit({ rating: 1 });

    const decided = await decideReview({ reviewId: review!.id, approve: false, reason: "spam", actorId: "u-admin" });

    expect(decided?.status).toBe("rejected");
    expect(decided?.rejectionReason).toBe("spam");
    // A 1★ rejection must not drag the profile down — the whole point.
    expect(worker.rating).toBe(beforeRating);
    expect(worker.reviewCount).toBe(beforeCount);

    const events = await listReviewModerationEvents();
    expect(events[0]).toMatchObject({ action: "rejected", reason: "spam", actorId: "u-admin" });
  });

  it("refuses a second decision on the same review", async () => {
    const review = await submit();
    expect(await decideReview({ reviewId: review!.id, approve: true, actorId: "u-admin" })).not.toBeNull();
    // Flip attempt — the queue already decided this one.
    expect(await decideReview({ reviewId: review!.id, approve: false, reason: "spam", actorId: "u-admin" })).toBeNull();
    const events = await listReviewModerationEvents();
    expect(events.filter((e) => e.reviewId === review!.id)).toHaveLength(1);
  });

  it("ignores an unknown review", async () => {
    expect(await decideReview({ reviewId: "nope", approve: true, actorId: "u-admin" })).toBeNull();
  });
});

describe("queue stats and worker summary", () => {
  it("counts the pending review and reports it in the worker's summary", async () => {
    const before = await getReviewModerationStats();
    const review = await submit();

    const after = await getReviewModerationStats();
    expect(after.pending).toBe(before.pending + 1);

    const summary = await workerReviewSummary(WORKER_ID);
    expect(summary).not.toBeNull();
    expect(summary!.pending).toBeGreaterThanOrEqual(1);
    expect(summary!.visible.some((r) => r.id === review!.id)).toBe(false);

    await decideReview({ reviewId: review!.id, approve: true, actorId: "u-admin" });
    const published = await workerReviewSummary(WORKER_ID);
    expect(published!.visible.some((r) => r.id === review!.id)).toBe(true);
    expect(published!.weighted).toBeGreaterThan(0);
    expect(published!.rankScore).toBeGreaterThan(0);
  });

  it("returns null for a worker that does not exist", async () => {
    expect(await workerReviewSummary("no-such-worker")).toBeNull();
  });
});
