"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { BookingPrintButton } from "./booking-print-button";
import type { Booking } from "@/lib/data/types";

/** Timeline dot colors — the same status→color map as the admin dispute view
 * (/admin/bookings/[number]), so the customer, worker and admin rows tell one
 * story (docs/ENHANCEMENT-PLAN.md §2.4). */
const EVENT_DOT: Record<string, string> = {
  cancelled: "bg-red-500",
  declined: "bg-red-500",
  noShow: "bg-red-500",
  confirmed: "bg-emerald-500",
  completed: "bg-emerald-500",
  requested: "bg-amber-400",
};

/** Actor label keys — mirrors the admin dispute view's actor badges. */
const ACTOR_LABEL_KEY: Record<string, string> = {
  customer: "booking.disputeActorCustomer",
  worker: "booking.disputeActorWorker",
  system: "booking.disputeActorSystem",
  admin: "booking.disputeActorAdmin",
};

/** The exact timestamp of an event, localized — the audit line's \"when\". */
function eventTimestamp(time: string, locale: "en" | "ar"): string {
  return new Date(time).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The read-only \"what happened and when\" trail for one booking — the customer
 * and worker rows' mirror of the admin dispute view (/admin/bookings/[number]):
 * every status change from the same Booking.events trail, with the acting
 * party, reason and timestamp. Tapping an entry reveals its full audit line
 * (booking number, status, actor, exact timestamp and reason) the way the
 * admin dispute page renders it. Rendered identically on both sides (this
 * shared component guarantees the rows can never drift), hidden entirely when
 * the booking has no recorded events.
 */
export function BookingTimeline({ booking, workerName }: { booking: Booking; workerName?: string }) {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const events = booking.events;
  // The event currently showing its full audit line (index, not id — events
  // have no stable id; the trail order is the identity).
  const [selected, setSelected] = useState<number | null>(null);

  if (events.length === 0) return null;

  return (
    <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-xs font-bold text-ink-400 transition-colors hover:text-ink-600 dark:hover:text-ink-200"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {t("booking.whatHappened")}
          <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
            {events.length}
          </span>
        </button>
        {/* §2.4 — the compact print link appears exactly where the trail is
            shown: in the expanded header (the full Print button still lives
            in the row's action area). */}
        {expanded && (
          <span className="ms-auto">
            <BookingPrintButton booking={booking} workerName={workerName} compact />
          </span>
        )}
      </div>
      {expanded && (
        <ol className="mt-2 space-y-1">
          {events.map((e, i) => (
            <li key={i}>
              <button
                onClick={() => setSelected(selected === i ? null : i)}
                aria-expanded={selected === i}
                className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-start transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60"
              >
                <span className={`mt-0.5 size-2 shrink-0 rounded-full ${EVENT_DOT[e.status] ?? "bg-sky-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-bold text-ink-800 dark:text-ink-100">
                      {t(`booking.status.${e.status}`)}
                    </span>
                    <span className="rounded bg-ink-100 px-1.5 py-px text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                      {t(ACTOR_LABEL_KEY[e.actorType] ?? "booking.disputeActorSystem")}
                    </span>
                  </span>
                  {e.reason && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                      {e.reason}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-ink-400">{timeAgo(e.time, locale)}</span>
                </span>
                <ChevronDown
                  className={cn("mt-1 size-3.5 shrink-0 text-ink-300 transition-transform dark:text-ink-600", selected === i && "rotate-180")}
                />
              </button>

              {/* The full audit line — the same facts the admin dispute page
                  renders for this event (status, actor, reason, timestamp),
                  plus the booking number, in one place. */}
              {selected === i && (
                <div className="mt-1 ms-4 space-y-1.5 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 text-[11px] dark:border-ink-800 dark:bg-ink-800/60">
                  <p className="font-semibold uppercase tracking-wider text-ink-400">{t("booking.timelineDetails")}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-ink-800 dark:text-ink-100">{t(`booking.status.${e.status}`)}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-px font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                      {t(ACTOR_LABEL_KEY[e.actorType] ?? "booking.disputeActorSystem")}
                    </span>
                  </div>
                  <p className="text-ink-500 dark:text-ink-400">{eventTimestamp(e.time, locale)}</p>
                  {e.reason && <p className="leading-relaxed text-ink-600 dark:text-ink-300">{e.reason}</p>}
                  <p className="flex items-center gap-1.5 text-ink-400">
                    {t("booking.bookingNumber")}{" "}
                    <span className="font-mono font-bold text-ink-700 dark:text-ink-200" dir="ltr">
                      {booking.number}
                    </span>
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
