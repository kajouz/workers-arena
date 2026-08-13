"use client";

import { CalendarClock, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GradientAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { useLocale } from "@/components/providers/locale-provider";
import { formatDate, cn } from "@/lib/utils";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { RespondDialog } from "./respond-dialog";
import { BookingActions } from "./booking-actions";
import type { Booking, Worker } from "@/lib/data/types";

/**
 * One booking as the WORKER sees it (docs/booking-scheduling.md §6): the
 * customer (avatar initials + name + phone), job title, localized time,
 * status badge, and the action matching the status — Respond for REQUESTED
 * (M4 adds complete/cancel/no-show for the later statuses).
 */
export function BookingRow({ booking, worker }: { booking: Booking; worker: Worker }) {
  const { locale, t } = useLocale();
  const phoneHref = `tel:${booking.customerPhone.replace(/[\s\-()]/g, "")}`;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <GradientAvatar name={booking.customerName} className="size-11" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-ink-900 dark:text-ink-50">{booking.customerName}</p>
              <span className="text-xs text-ink-400">
                {t("booking.bookingNumber")} {booking.number}
              </span>
              <BookingStatusBadge status={booking.status} className="ms-auto" />
            </div>

            <p className="mt-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">{booking.jobTitle}</p>
            {booking.serviceItem && (
              <p className="mt-0.5 text-xs text-ink-400">
                {locale === "ar" ? booking.serviceItem.nameAr : booking.serviceItem.nameEn}
              </p>
            )}
            {booking.note && (
              <p className={cn("mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400", "line-clamp-2")}>
                “{booking.note}”
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                {formatDate(booking.startAt, locale)} · {formatSlotRange(booking, locale)}
              </span>
              <a href={phoneHref} className="flex items-center gap-1.5 font-bold text-brand-600 hover:underline dark:text-brand-400">
                <Phone className="size-3.5" />
                {booking.customerPhone}
              </a>
            </div>
          </div>

          {/* Actions — respond to a pending request (M1); lifecycle for
              scheduled bookings (M4: start/complete/no-show/cancel). */}
          {booking.status === "requested" ? (
            <div className="w-full sm:w-auto">
              <RespondDialog booking={booking} worker={worker} />
            </div>
          ) : (
            (booking.status === "confirmed" || booking.status === "pendingPayment" || booking.status === "inProgress") && (
              <div className="w-full sm:w-auto">
                <BookingActions booking={booking} />
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
