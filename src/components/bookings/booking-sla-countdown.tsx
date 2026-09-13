"use client";

import { Hourglass } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useSsrSafeNow } from "@/hooks/use-ssr-safe-now";
import { SlaUrgencyBar } from "./sla-urgency-bar";
import { BOOKING_SLA_EXPIRE_HOURS, requestSlaExpiryMs } from "@/lib/data/types";
import { cn, durationParts, fillDuration } from "@/lib/utils";
import type { Booking } from "@/lib/data/types";

/** The request-SLA window the bar drains across (the same 48h the cron enforces). */
const REQUEST_SLA_WINDOW_MS = BOOKING_SLA_EXPIRE_HOURS * 3_600_000;

/** Which side reads this countdown — picks the copy voice (the deadline and
 * bar are identical; only the wording differs, matching the dialogs). */
export type SlaCountdownVariant = "admin" | "customer" | "worker";

/** The copy key for the current remaining-time bucket, per side. The worker's
 * ≥1h wording swaps to the nudge variant once the SLA cron pushed the nudge. */
function slaCopyKey(variant: SlaCountdownVariant, hours: number, nudged: boolean): string {
  if (hours >= 1) {
    if (variant === "customer") return "booking.slaCustomerNote";
    if (variant === "worker") return nudged ? "booking.slaWorkerNudged" : "booking.slaWorkerNote";
    return "booking.slaAdminCountdown";
  }
  if (variant === "customer") return "booking.slaCustomerSoon";
  if (variant === "worker") return "booking.slaWorkerSoon";
  return "booking.slaAdminSoon";
}

/**
 * Live request-SLA countdown — the same ticking clock, urgency bar and
 * red-state pulse the worker and customer dialogs show, driven by the REAL
 * requestSlaExpiryMs (creation + the 48h window the cron enforces), so every
 * side reads exactly the deadline the others see. Rendered by ALL THREE
 * surfaces — the admin dispute view (banner), the customer /bookings rows and
 * the worker dashboard cards (compact) — guaranteeing the sides can never
 * drift. The tick is visibility-aware (pauses in hidden tabs, resyncs on
 * visibilitychange). Renders nothing for non-requested bookings.
 *
 * Hydration safety via the shared useSsrSafeNow hook: the server page passes
 * nowSeed (its own Date.now() at render time) and we render from it until the
 * component has mounted, then switch to the live tick. Pre-mount output is a
 * pure function of (booking, nowSeed, variant), so the server markup and the
 * client's first render are identical and hydration is clean; the switch to
 * the live clock after mount is a normal post-hydration update.
 */
export function BookingSlaCountdown({
  booking,
  nowSeed,
  variant = "admin",
  compact = false,
}: {
  booking: Booking;
  /** Date.now() at server render time — the display base until mount. */
  nowSeed: number;
  /** Which side reads it — selects the copy voice (default admin banner). */
  variant?: SlaCountdownVariant;
  /** Compact (card-row) styling: no banner border/background, w-full so the
   * bar spans the row. The admin dispute page uses the full banner. */
  compact?: boolean;
}) {
  const { t } = useLocale();
  const now = useSsrSafeNow(nowSeed, { tick: true, active: booking.status === "requested" });

  if (booking.status !== "requested") return null;

  const expiryMs = requestSlaExpiryMs(booking);
  // Shared countdown arithmetic + the digit convention's duration path
  // (durationParts/fillDuration): the hours pick the copy variant, and the
  // filled string renders ASCII digits in both languages — so this row can
  // never show Arabic-Indic numerals beside the Latin ones around it.
  const remaining = durationParts(expiryMs - now);
  const copy = fillDuration(
    t(slaCopyKey(variant, remaining.hours, booking.slaNudgeSent === true)),
    remaining
  );

  return (
    <div className={cn(compact ? "mt-2.5 w-full" : "mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5")}>
      <p className={cn("flex items-start gap-1.5 text-[11px] leading-relaxed", compact ? "text-amber-600 dark:text-amber-400" : "text-amber-700 dark:text-amber-400")}>
        <Hourglass className="mt-px size-3.5 shrink-0" />
        <span>
          {copy}
          {variant === "admin" && booking.slaNudgeSent && (
            <span className="ms-1 font-semibold">· {t("booking.slaNudgeTag")}</span>
          )}
        </span>
      </p>
      <SlaUrgencyBar
        expiryAt={expiryMs}
        windowMs={REQUEST_SLA_WINDOW_MS}
        now={now}
        label={t("booking.slaDialogTitle")}
        className={compact ? "mt-1.5" : "mt-2"}
      />
    </div>
  );
}
