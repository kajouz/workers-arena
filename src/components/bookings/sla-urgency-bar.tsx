import { cn } from "@/lib/utils";

/**
 * The shared SLA urgency bar (docs/ENHANCEMENT-PLAN.md §2.2) — the visual
 * language every live deadline drains with: a thin track that fills to the
 * fraction of the window remaining (>50% green, 20–50% amber, <20% red,
 * pulsing softly once urgent) so a deadline's progress is scannable at a
 * glance. Rendered by BookingSlaCountdown (the request-SLA banner on the
 * admin dispute page and the compact rows) and by the quote cards' closing
 * window, so every deadline — the request's auto-cancel AND the quote job's
 * close — drains the same way and can never drift apart.
 *
 * Pure presentational: the caller supplies the deadline, the window and a
 * hydration-safe `now` (e.g. from useSsrSafeNow), so the bar itself has no
 * clock and can be rendered anywhere.
 */
export function SlaUrgencyBar({
  expiryAt,
  windowMs,
  now,
  label,
  className,
}: {
  /** When the deadline hits (ms epoch). */
  expiryAt: number;
  /** The full window the bar drains across — full when now = expiryAt − windowMs. */
  windowMs: number;
  /** Current time (ms epoch) — already hydration-safe at the call site. */
  now: number;
  /** Accessible name for the progressbar. */
  label: string;
  /** Extra classes on the track (e.g. vertical margins). */
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((expiryAt - now) / (windowMs || 1)) * 100));
  const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
  // Below 20% the bar pulses softly (animate-pulse-soft, opacity 1→0.55) so
  // the red urgency state draws the eye without a modal.
  const urgent = pct <= 20;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-ink-900/10 dark:bg-ink-100/10", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          barColor,
          urgent && "animate-pulse-soft"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
