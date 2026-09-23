"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW SOLICITATION PROMPT — ask once, at the right moment
 * ────────────────────────────────────────────────────────────────────────────
 * Rendered at the top of the customer's bookings for the completed jobs that
 * qualify (src/lib/data/review-solicitation.ts owns the rules, the copy and the
 * ordering). This component owns only the presentation and one piece of local
 * state: a dismissal that lasts the session.
 *
 * Why a local dismissal rather than a stored one: the prompt already stops for
 * good the moment the customer reviews the worker (the engine's `hasReview`),
 * so the only thing a stored dismissal would add is a promise the platform
 * cannot keep — a banner that never comes back even though the job still has no
 * review. "Not now" here means exactly that, and nothing is written to a server
 * to pretend otherwise.
 */

import { useState } from "react";
import { Link } from "@/components/i18n/link";
import { Star, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { solicitationCopy, solicitationReviewHref, type SolicitationStage } from "@/lib/data/review-solicitation";

export interface ReviewSolicitationItem {
  /** The booking the ask is about — the React key, and what a dismissal hides. */
  bookingId: string;
  workerName: string;
  workerSlug: string;
  jobTitle: string;
  stage: SolicitationStage;
  /** For the copy: "2 days ago" is the reader's context, not the engine's. */
  daysSinceCompletion: number;
}

export function ReviewSolicitation({ items }: { items: ReviewSolicitationItem[] }) {
  const { locale, t } = useLocale();
  /**
   * Normalised rather than trusted: any locale that is not Arabic writes the
   * English copy. A missing context value (a test harness, an error boundary)
   * must not leak an `undefined` into a URL or pick copy for a language nobody
   * asked for.
   */
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = items.filter((item) => !dismissed.includes(item.bookingId));
  if (visible.length === 0) return null;

  return (
    <section className="mb-8 space-y-3" aria-label={t("reviewSolicitation.sectionLabel")}>
      {visible.map((item) => {
        const copy = solicitationCopy({
          workerName: item.workerName,
          jobTitle: item.jobTitle,
          locale: lang,
          stage: item.stage,
        });
        return (
          <div
            key={item.bookingId}
            className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/30 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <Star className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden />
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{copy.title}</p>
                <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{copy.body}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={solicitationReviewHref({ workerSlug: item.workerSlug })}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600"
              >
                {copy.cta}
              </Link>
              <button
                type="button"
                onClick={() => setDismissed((prev) => [...prev, item.bookingId])}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-ink-500 transition-colors hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
              >
                <X className="size-3.5" aria-hidden />
                {copy.dismiss}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
