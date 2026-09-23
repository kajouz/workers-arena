/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW SOLICITATION — ask at the moment the customer is happiest
 * ────────────────────────────────────────────────────────────────────────────
 * A completed job is the only moment a customer has both the experience and the
 * goodwill to write a review, and reviews are the thing the whole marketplace
 * runs on: they are what the search ranks on, what the landing pages promise,
 * and what the next customer reads before booking.
 *
 * The failure mode this engine exists to prevent is a nag: a prompt that shows
 * for a year, or that keeps asking after the review is already written. So the
 * rules are a pure decision with named windows, and the *absence* of a rule is
 * the interesting part:
 *
 *   • Only a COMPLETED booking asks. A cancelled or disputed job is not a
 *     satisfied customer, and asking then is a complaint waiting to happen.
 *   • The ask stops the moment the customer has reviewed that worker — not
 *     after a dismiss. (Reviews are unique per customer+worker in both adapters,
 *     so "reviewed" is a fact, not a guess.)
 *   • The window is bounded (`SOLICITATION_WINDOW_DAYS`). A job from last season
 *     is not fresh in anyone's memory, and a stale prompt is the nag.
 *   • Inside the window the ask *escalates* once, after
 *     `REMINDER_AFTER_DAYS` — one reminder, never a stream of them.
 *
 * Pure: no repo, no clock, no locale state. The caller supplies the completion
 * time (from the booking's audit trail, which is where it is recorded) and
 * whether a review already exists.
 */

import type { BookingStatus } from "./types";

/** How long after completion a job is still worth asking about. */
export const SOLICITATION_WINDOW_DAYS = 30;

/** After this long without a review, the ask becomes a reminder. */
export const REMINDER_AFTER_DAYS = 3;

/** `first` — the completion-time ask. `reminder` — the one follow-up. */
export type SolicitationStage = "first" | "reminder";

/**
 * Why we are NOT asking. Every one of these is a deliberate silence, so the
 * caller can tell "nothing to do" from "the read failed".
 */
export type SolicitationSkip =
  | "not-completed"
  | "unknown-completion"
  | "already-reviewed"
  | "window-passed";

export type SolicitationDecision =
  | { ask: true; stage: SolicitationStage; daysSinceCompletion: number }
  | { ask: false; reason: SolicitationSkip; daysSinceCompletion: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants, floored — 30.9 days is "30 days ago". */
function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

/**
 * Should this booking ask for a review, and how?
 *
 * `now` is injectable so the windows are testable and the caller can pass the
 * server render clock — the same convention the SLA countdowns use.
 */
export function solicitationDecision(input: {
  status: BookingStatus;
  /** ISO completion time from the booking's audit trail, or null if unseen. */
  completedAt: string | null | undefined;
  /** True when this customer already reviewed this worker. */
  hasReview: boolean;
  now?: number;
}): SolicitationDecision {
  const now = Number.isFinite(input.now) ? (input.now as number) : Date.now();

  if (input.status !== "completed") {
    return { ask: false, reason: "not-completed", daysSinceCompletion: null };
  }
  // No completion event means we cannot place the job inside the window. Asking
  // anyway would be asking for a job whose date we do not know.
  const completedMs = input.completedAt ? Date.parse(input.completedAt) : Number.NaN;
  if (!Number.isFinite(completedMs)) {
    return { ask: false, reason: "unknown-completion", daysSinceCompletion: null };
  }

  const days = daysBetween(completedMs, now);
  // A future timestamp (clock skew, bad data) is not a fresh job — it cannot be
  // inside a window that starts when the work finished.
  if (days < 0) return { ask: false, reason: "unknown-completion", daysSinceCompletion: null };

  if (input.hasReview) return { ask: false, reason: "already-reviewed", daysSinceCompletion: days };
  if (days > SOLICITATION_WINDOW_DAYS) {
    return { ask: false, reason: "window-passed", daysSinceCompletion: days };
  }
  return {
    ask: true,
    stage: days >= REMINDER_AFTER_DAYS ? "reminder" : "first",
    daysSinceCompletion: days,
  };
}

export interface SolicitationCopy {
  title: string;
  body: string;
  /** The button that goes to the review form. */
  cta: string;
  /** Local dismissal — hides this prompt for the session, nothing more. */
  dismiss: string;
}

/**
 * The words, in the customer's language. Both stages name the worker and the
 * job, because a prompt that says "rate your experience" without saying *which*
 * one is a prompt the customer cannot act on in one tap.
 */
export function solicitationCopy(input: {
  workerName: string;
  jobTitle: string;
  locale: "en" | "ar";
  stage: SolicitationStage;
}): SolicitationCopy {
  const { workerName, jobTitle, locale, stage } = input;
  if (locale === "ar") {
    return stage === "reminder"
      ? {
          title: `تذكير: كيف كانت تجربتك مع ${workerName}؟`,
          body: `لم نسمع رأيك بعد بخصوص «${jobTitle}». تقييم صادق يساعد عميلاً آخر على الاختيار — ويستغرق دقيقة واحدة.`,
          cta: "اكتب تقييمك",
          dismiss: "ليس الآن",
        }
      : {
          title: `اكتملت وظيفة «${jobTitle}» — كيف كان ${workerName}؟`,
          body: "تقييمك هو ما يبني سمعة العامل ويساعد العملاء الآخرين على الاختيار بثقة.",
          cta: "قيّم التجربة",
          dismiss: "ليس الآن",
        };
  }
  return stage === "reminder"
    ? {
        title: `Reminder: how was your experience with ${workerName}?`,
        body: `We haven't heard your take on “${jobTitle}” yet. An honest review is one minute of your time and it is what the next customer reads.`,
        cta: "Write your review",
        dismiss: "Not now",
      }
    : {
        title: `Your “${jobTitle}” is done — how did ${workerName} do?`,
        body: "A short review builds this worker's reputation and helps the next customer choose with confidence.",
        cta: "Rate the job",
        dismiss: "Not now",
      };
}

/** One candidate row, as the caller can produce it from the bookings page. */
export interface SolicitationCandidate {
  bookingId: string;
  status: BookingStatus;
  completedAt: string | null | undefined;
  hasReview: boolean;
}

/**
 * Rank the pending asks so the page shows the most useful ones first: reminders
 * (a job nobody answered) before fresh completions, and inside each stage the
 * most recent job first — a customer who just finished a job is likelier to act
 * than one from three weeks ago.
 *
 * The engine sorts; the caller slices (`limit`), so "show at most N" is a
 * presentation decision that never changes which asks are eligible.
 */
export function pendingSolicitations<T extends SolicitationCandidate>(
  candidates: readonly T[],
  now?: number
): { candidate: T; stage: SolicitationStage; daysSinceCompletion: number }[] {
  const ranked: { candidate: T; stage: SolicitationStage; daysSinceCompletion: number }[] = [];
  for (const candidate of candidates) {
    const decision = solicitationDecision({
      status: candidate.status,
      completedAt: candidate.completedAt,
      hasReview: candidate.hasReview,
      now,
    });
    if (!decision.ask) continue;
    ranked.push({ candidate, stage: decision.stage, daysSinceCompletion: decision.daysSinceCompletion });
  }
  return ranked.sort(
    (a, b) =>
      (a.stage === b.stage ? 0 : a.stage === "reminder" ? -1 : 1) ||
      a.daysSinceCompletion - b.daysSinceCompletion
  );
}

/**
 * Where the CTA goes: the worker profile, anchored on the reviews section where
 * the form lives.
 *
 * Deliberately a BARE app path with no locale prefix. The locale-aware `<Link>`
 * (src/components/i18n/link.tsx) adds the current locale to every in-app href,
 * so a prefixed value here would be prefixed twice — which is exactly the bug
 * this shape avoids. Non-Link callers (an email, a WhatsApp message) prepend the
 * locale themselves, as they already do for every other app path.
 */
export function solicitationReviewHref(input: { workerSlug: string }): string {
  return `/workers/${input.workerSlug}#reviews`;
}
