"use client";

import { Hourglass } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useCountdownTick } from "@/hooks/use-countdown-tick";
import { BOOKING_SLA_EXPIRE_HOURS, requestSlaExpiryMs } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/data/types";

/**
 * Live request-SLA banner for the admin dispute view — the same ticking clock,
 * urgency bar and red-state pulse as the booking dialogs, driven by the REAL
 * requestSlaExpiryMs (creation + the 48h window the cron enforces), so the
 * admin reads exactly the deadline the worker and customer see. The tick is
 * visibility-aware (pauses in hidden tabs, resyncs on visibilitychange).
 * Renders nothing for non-requested bookings.
 */
export function BookingSlaCountdown({ booking }: { booking: Booking }) {
  const { t } = useLocale();
  const now = useCountdownTick(booking.status === "requested");

  if (booking.status !== "requested") return null;

  const expiryMs = requestSlaExpiryMs(booking);
  const totalMin = Math.max(0, Math.ceil((expiryMs - now) / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const copy = hours >= 1 ? t("booking.slaAdminCountdown") : t("booking.slaAdminSoon");
  // Urgency bar — fraction of the 48h window remaining, scannable at a glance:
  // >50% green, 20–50% amber, <20% red (pulsing softly to draw the eye),
  // mirroring the dialogs. The text line keeps the exact time.
  const pct = Math.max(
    0,
    Math.min(100, ((expiryMs - now) / (BOOKING_SLA_EXPIRE_HOURS * 3_600_000)) * 100)
  );
  const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
  const urgent = pct <= 20;

  return (
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
        <Hourglass className="mt-px size-3.5 shrink-0" />
        <span>
          {copy.replace("{hours}", String(hours)).replace("{minutes}", String(minutes))}
          {booking.slaNudgeSent && (
            <span className="ms-1 font-semibold">· {t("booking.slaNudgeTag")}</span>
          )}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t("booking.slaDialogTitle")}
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-900/10 dark:bg-ink-100/10"
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
    </div>
  );
}
