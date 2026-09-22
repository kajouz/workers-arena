import { describe, expect, it } from "vitest";
import {
  REVIEW_MODERATION_SLA_HOURS,
  assessReview,
  effectiveStatus,
  moderationQueueStats,
  rankingScore,
  reviewBody,
  scanReviewText,
  visibleReviews,
  weightedRating,
  type ReviewSignals,
} from "../src/lib/data/review-moderation";

/** Fixed clock so every age/threshold assertion is deterministic. */
const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const signals = (over: Partial<ReviewSignals> = {}): ReviewSignals => ({
  rating: 5,
  textEn: "Excellent work, arrived on time and finished the job cleanly.",
  verifiedPurchase: true,
  createdAt: daysAgo(10),
  now: NOW,
  ...over,
});

describe("scanReviewText", () => {
  it("flags missing and trivial text", () => {
    expect(scanReviewText("")).toEqual(["no-text"]);
    expect(scanReviewText("   ")).toEqual(["no-text"]);
    expect(scanReviewText("good")).toEqual(["too-short"]);
  });

  it("flags links and contact details — the reason reviews get rejected", () => {
    expect(scanReviewText("See more at www.cheap-plumbing.example.com")).toContain("link");
    const phone = scanReviewText("Perfect job, reach me again on +961 70 123456 anytime");
    expect(phone).toContain("contact-info");
    const email = scanReviewText("Great service, contact me at ahmed@example.com next time");
    expect(email).toContain("contact-info");
  });

  it("flags shouting but not ordinary prose", () => {
    expect(scanReviewText("ABSOLUTELY TERRIBLE WORK NEVER CALL THIS PERSON EVER")).toContain("shouting");
    expect(scanReviewText("The plumber was late but the work itself was solid and tidy.")).not.toContain("shouting");
  });

  it("leaves a normal bilingual review clean", () => {
    expect(scanReviewText("Fixed the leak in an hour and cleaned up afterwards.")).toEqual([]);
    expect(scanReviewText("أصلح التسريب بسرعة ونظّف المكان بعد الانتهاء.")).toEqual([]);
  });
});

describe("reviewBody", () => {
  it("picks the longer locale, so a translated stub can't mask the real text", () => {
    expect(reviewBody({ textEn: "Great", textAr: "عمل ممتاز وسريع جدًا" })).toBe("عمل ممتاز وسريع جدًا");
    expect(reviewBody({ textEn: "Long enough English body text", textAr: "جيد" })).toBe("Long enough English body text");
  });
});

describe("assessReview", () => {
  it("recommends approval for a clean verified review", () => {
    const result = assessReview(signals());
    expect(result.risk).toBe("low");
    expect(result.recommendation).toBe("approve");
    expect(result.score).toBe(0);
  });

  it("notes an unverified review without treating it as dangerous", () => {
    const result = assessReview(signals({ verifiedPurchase: false }));
    expect(result.flags.map((f) => f.code)).toContain("unverified");
    expect(result.risk).toBe("low");
  });

  it("sends a policy-violating review to reject (link + contact details)", () => {
    const result = assessReview(
      signals({ verifiedPurchase: false, textEn: "Book me directly at www.my-plumbing.example.com or +961 70 123456 for a discount." })
    );
    expect(result.risk).toBe("high");
    expect(result.recommendation).toBe("reject");
  });

  it("escalates a bare extreme rating with no reasoning to a human look", () => {
    const result = assessReview(signals({ rating: 1, textEn: "bad", verifiedPurchase: true }));
    const codes = result.flags.map((f) => f.code);
    expect(codes).toContain("extreme-rating");
    expect(result.risk).not.toBe("low");
  });

  it("flags an author with rejected reviews as a history signal", () => {
    const result = assessReview(signals({ authorRejections: 2, authorReviewCount: 5 }));
    const codes = result.flags.map((f) => f.code);
    expect(codes).toContain("author-history");
    expect(codes).toContain("repeat-author");
  });

  it("is advisory only — a recommendation never changes a status by itself", () => {
    // The engine has no store access by construction: it returns a verdict and
    // nothing else. This pins that assessReview stays pure (same input → same
    // output) so the queue can call it on every render.
    const input = signals({ verifiedPurchase: false, textEn: "spam www.x.example.com" });
    expect(assessReview(input)).toEqual(assessReview(input));
  });
});

describe("moderation status gating", () => {
  it("treats a missing status as approved (pre-moderation data keeps its rating)", () => {
    expect(effectiveStatus(undefined)).toBe("approved");
    expect(effectiveStatus("pending")).toBe("pending");
    expect(effectiveStatus("rejected")).toBe("rejected");
  });

  it("exposes approved reviews only", () => {
    const reviews = [{ status: undefined }, { status: "pending" as const }, { status: "approved" as const }, { status: "rejected" as const }];
    expect(visibleReviews(reviews)).toHaveLength(2);
  });
});

describe("moderationQueueStats", () => {
  it("counts states, watches the oldest pending age and the SLA", () => {
    const reviews = [signals({ createdAt: hoursAgo(2) }), signals({ createdAt: hoursAgo(30) }), signals({ createdAt: daysAgo(5) })];
    const stats = moderationQueueStats(reviews, ["pending", "pending", "approved"], NOW);
    expect(stats.pending).toBe(2);
    expect(stats.approved).toBe(1);
    expect(Math.round(stats.oldestPendingHours)).toBe(30);
    expect(stats.slaBreached).toBe(1);
  });

  it("reports an empty queue as healthy", () => {
    const stats = moderationQueueStats([], [], NOW);
    expect(stats.pending).toBe(0);
    expect(stats.oldestPendingHours).toBe(0);
    expect(stats.slaBreached).toBe(0);
  });

  it("keeps the SLA defined in one place", () => {
    expect(REVIEW_MODERATION_SLA_HOURS).toBeGreaterThan(0);
  });
});

describe("weightedRating", () => {
  const review = (over: { rating: number; date: string; verifiedPurchase?: boolean; helpfulCount?: number; status?: "approved" | "pending" | "rejected" }) => ({
    rating: over.rating,
    date: over.date,
    ...(over.verifiedPurchase !== undefined ? { verifiedPurchase: over.verifiedPurchase } : {}),
    ...(over.helpfulCount !== undefined ? { helpfulCount: over.helpfulCount } : {}),
    ...(over.status !== undefined ? { status: over.status } : {}),
  });

  it("pulls a single 5★ toward the prior instead of crowning it", () => {
    const result = weightedRating([review({ rating: 5, date: daysAgo(5) })], { now: NOW });
    expect(result.count).toBe(1);
    expect(result.raw).toBe(5);
    expect(result.rating).toBeLessThan(5);
    expect(result.rating).toBeGreaterThan(4.2);
  });

  it("converges on the real average as evidence accumulates", () => {
    const many = Array.from({ length: 200 }, (_, i) => review({ rating: i % 5 === 0 ? 4 : 5, date: daysAgo(20) }));
    const result = weightedRating(many, { now: NOW });
    expect(result.rating).toBeGreaterThan(4.7);
    expect(result.count).toBe(200);
  });

  it("ignores pending and rejected reviews entirely", () => {
    const reviews = [
      review({ rating: 5, date: daysAgo(1), status: "approved" }),
      review({ rating: 1, date: daysAgo(1), status: "pending" }),
      review({ rating: 1, date: daysAgo(1), status: "rejected" }),
    ];
    const result = weightedRating(reviews, { now: NOW });
    expect(result.count).toBe(1);
    expect(result.raw).toBe(5);
  });

  it("returns an empty figure for a worker with nothing approved", () => {
    const reviews = [review({ rating: 5, date: daysAgo(1), status: "pending" })];
    expect(weightedRating(reviews, { now: NOW })).toMatchObject({ rating: 0, count: 0, weight: 0 });
  });

  it("lets recent work outweigh an old review of the same rating", () => {
    const recent = weightedRating([review({ rating: 5, date: daysAgo(1) })], { now: NOW });
    const old = weightedRating([review({ rating: 5, date: daysAgo(700) })], { now: NOW });
    expect(recent.rating).toBeGreaterThan(old.rating);
  });

  it("counts a verified purchase more than an unverified one", () => {
    const verified = weightedRating([review({ rating: 5, date: daysAgo(30), verifiedPurchase: true })], { now: NOW });
    const unverified = weightedRating([review({ rating: 5, date: daysAgo(30), verifiedPurchase: false })], { now: NOW });
    expect(verified.rating).toBeGreaterThan(unverified.rating);
  });
});

describe("rankingScore", () => {
  it("lets review volume break a tie between equal ratings", () => {
    const few = weightedRating([{ rating: 4.8, date: daysAgo(10) }], { now: NOW });
    const many = weightedRating(
      Array.from({ length: 50 }, () => ({ rating: 4.8, date: daysAgo(10) })),
      { now: NOW }
    );
    expect(many.rating).toBeGreaterThan(few.rating);
    expect(rankingScore(many)).toBeGreaterThan(rankingScore(few));
  });

  it("scores nothing for a profile with no approved reviews", () => {
    expect(rankingScore({ rating: 0, raw: 0, count: 0, weight: 0 })).toBe(0);
  });
});
