import { describe, expect, it } from "vitest";
import {
  REMINDER_AFTER_DAYS,
  SOLICITATION_WINDOW_DAYS,
  pendingSolicitations,
  solicitationCopy,
  solicitationDecision,
  solicitationReviewHref,
} from "../src/lib/data/review-solicitation";

const NOW = Date.parse("2026-09-23T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const base = { status: "completed" as const, hasReview: false, now: NOW };

describe("solicitationDecision — when to ask", () => {
  it("asks on the day the job completes", () => {
    const d = solicitationDecision({ ...base, completedAt: daysAgo(0) });
    expect(d).toEqual({ ask: true, stage: "first", daysSinceCompletion: 0 });
  });

  it("asks an unchanged question inside the first days, then escalates once", () => {
    expect(solicitationDecision({ ...base, completedAt: daysAgo(REMINDER_AFTER_DAYS - 1) })).toMatchObject({
      ask: true,
      stage: "first",
    });
    expect(solicitationDecision({ ...base, completedAt: daysAgo(REMINDER_AFTER_DAYS) })).toMatchObject({
      ask: true,
      stage: "reminder",
    });
    // Still a reminder at the far edge of the window — not a second escalation.
    expect(solicitationDecision({ ...base, completedAt: daysAgo(SOLICITATION_WINDOW_DAYS) })).toMatchObject({
      ask: true,
      stage: "reminder",
    });
  });
});

describe("solicitationDecision — when to stay quiet", () => {
  it("does not ask about a job that is not completed", () => {
    for (const status of ["requested", "confirmed", "inProgress", "completionPending", "cancelled", "declined"] as const) {
      expect(solicitationDecision({ ...base, status, completedAt: daysAgo(1) })).toEqual({
        ask: false,
        reason: "not-completed",
        daysSinceCompletion: null,
      });
    }
  });

  it("stops the moment the review exists", () => {
    expect(solicitationDecision({ ...base, completedAt: daysAgo(1), hasReview: true })).toEqual({
      ask: false,
      reason: "already-reviewed",
      daysSinceCompletion: 1,
    });
  });

  it("stops at the window edge and stays stopped", () => {
    expect(solicitationDecision({ ...base, completedAt: daysAgo(SOLICITATION_WINDOW_DAYS + 1) })).toEqual({
      ask: false,
      reason: "window-passed",
      daysSinceCompletion: SOLICITATION_WINDOW_DAYS + 1,
    });
    expect(solicitationDecision({ ...base, completedAt: daysAgo(400) }).ask).toBe(false);
  });

  it("refuses to place a job it cannot date — a missing or malformed completion", () => {
    for (const completedAt of [null, undefined, "", "not-a-date"]) {
      expect(solicitationDecision({ ...base, completedAt })).toEqual({
        ask: false,
        reason: "unknown-completion",
        daysSinceCompletion: null,
      });
    }
  });

  it("treats a future completion as undated rather than as brand new", () => {
    // Clock skew must not manufacture a fresh job — nor a prompt about one.
    const future = new Date(NOW + 60_000).toISOString();
    expect(solicitationDecision({ ...base, completedAt: future })).toEqual({
      ask: false,
      reason: "unknown-completion",
      daysSinceCompletion: null,
    });
  });

  it("floors fractional days so the boundary is not straddled twice", () => {
    const almost = new Date(NOW - (REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000 - 60_000)).toISOString();
    expect(solicitationDecision({ ...base, completedAt: almost })).toMatchObject({ stage: "first" });
  });
});

describe("solicitationCopy", () => {
  it("names the worker and the job in both stages", () => {
    const first = solicitationCopy({ workerName: "Khaled", jobTitle: "Leak repair", locale: "en", stage: "first" });
    expect(first.title).toContain("Khaled");
    expect(first.title).toContain("Leak repair");
    const reminder = solicitationCopy({ workerName: "Khaled", jobTitle: "Leak repair", locale: "en", stage: "reminder" });
    expect(reminder.title).toContain("Khaled");
    expect(reminder.body).toContain("Leak repair");
  });

  it("writes Arabic copy for the Arabic page", () => {
    const ar = solicitationCopy({ workerName: "خالد", jobTitle: "إصلاح تسريب", locale: "ar", stage: "first" });
    expect(ar.title).toContain("خالد");
    expect(ar.title).toContain("إصلاح تسريب");
    const arReminder = solicitationCopy({ workerName: "خالد", jobTitle: "إصلاح تسريب", locale: "ar", stage: "reminder" });
    expect(arReminder.cta).toBe("اكتب تقييمك");
  });
});

describe("pendingSolicitations", () => {
  const candidate = (over: Partial<Parameters<typeof pendingSolicitations>[0][number]> = {}) => ({
    bookingId: "BK-1",
    status: "completed" as const,
    completedAt: daysAgo(1),
    hasReview: false,
    ...over,
  });

  it("keeps only the asks that survive the rules", () => {
    const ranked = pendingSolicitations(
      [
        candidate({ bookingId: "BK-fresh" }),
        candidate({ bookingId: "BK-reviewed", hasReview: true }),
        candidate({ bookingId: "BK-old", completedAt: daysAgo(90) }),
        candidate({ bookingId: "BK-open", status: "confirmed" }),
        candidate({ bookingId: "BK-undated", completedAt: null }),
      ],
      NOW
    );
    expect(ranked.map((r) => r.candidate.bookingId)).toEqual(["BK-fresh"]);
  });

  it("puts an unanswered reminder before a fresh completion", () => {
    const ranked = pendingSolicitations(
      [
        candidate({ bookingId: "BK-today", completedAt: daysAgo(0) }),
        candidate({ bookingId: "BK-week", completedAt: daysAgo(7) }),
      ],
      NOW
    );
    expect(ranked.map((r) => r.candidate.bookingId)).toEqual(["BK-week", "BK-today"]);
    expect(ranked[0].stage).toBe("reminder");
  });

  it("is stable for equal candidates rather than reshuffling the prompt", () => {
    const ranked = pendingSolicitations(
      [candidate({ bookingId: "A" }), candidate({ bookingId: "B" })],
      NOW
    );
    expect(ranked.map((r) => r.candidate.bookingId)).toEqual(["A", "B"]);
  });
});

describe("solicitationReviewHref", () => {
  it("returns a BARE app path, anchored on the review section", () => {
    // No locale prefix: the locale-aware <Link> adds it, and a prefixed value
    // here would be prefixed twice (the /en/undefined/… bug this pins).
    const href = solicitationReviewHref({ workerSlug: "khaled-al-harbi-plumbing" });
    expect(href).toBe("/workers/khaled-al-harbi-plumbing#reviews");
    expect(href.startsWith("/en") || href.startsWith("/ar")).toBe(false);
    expect(href).not.toContain("undefined");
  });
});
