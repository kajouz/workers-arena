"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Phone, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GradientAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/shared/price";
import { toast } from "@/components/ui/toast";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { BookingTimeline } from "@/components/bookings/booking-timeline";
import { BookingChat } from "@/components/bookings/booking-chat";
import { BookingPrintButton } from "@/components/bookings/booking-print-button";
import { BookingEmailButton } from "@/components/bookings/booking-email-button";
import { useLocale } from "@/components/providers/locale-provider";
import { formatDate, cn } from "@/lib/utils";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { BookingSlaCountdown } from "@/components/bookings/booking-sla-countdown";
import { RespondDialog } from "./respond-dialog";
import { BookingActions } from "./booking-actions";
import { submitQuoteAction } from "@/app/actions/bookings";
import type { Booking, BookingMessage, Worker } from "@/lib/data/types";

/**
 * One booking as the WORKER sees it (docs/booking-scheduling.md §6): the
 * customer (avatar initials + name + phone), job title, localized time,
 * status badge, the action matching the status — Respond for REQUESTED
 * (M4 adds complete/cancel/no-show for the later statuses) — and the shared
 * dispute timeline (BookingTimeline), the identical "what happened and when"
 * trail the customer row renders (mirroring the admin dispute view).
 */
export function BookingRow({
  booking,
  messages,
  worker,
  nowSeed,
}: {
  booking: Booking;
  /** §2.3 chat — the booking's negotiation thread (oldest first). */
  messages: BookingMessage[];
  worker: Worker;
  nowSeed: number;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  // Multi-candidate quote bid (docs/multi-candidate-quotes.md §7) — inline
  // quote + deposit inputs on QUOTING invites; a submitted QUOTED bid shows
  // the amount + "awaiting the customer's pick".
  const [bidQuote, setBidQuote] = useState(String(worker.priceMin));
  const [bidDeposit, setBidDeposit] = useState("");
  const [bidding, setBidding] = useState(false);
  const phoneHref = `tel:${booking.customerPhone.replace(/[\s\-()]/g, "")}`;

  const submitBid = async () => {
    if (bidding) return;
    setBidding(true);
    const fd = new FormData();
    fd.set("quote", bidQuote.trim());
    if (bidDeposit.trim()) fd.set("deposit", bidDeposit.trim());
    const res = await submitQuoteAction(booking.id, fd);
    setBidding(false);
    if (res.ok) {
      toast("success", t("booking.quotesBidSubmitted"));
      router.refresh();
    } else {
      toast("error", t("booking.quotesBidError"));
    }
  };

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
              {booking.startAt && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  {formatDate(booking.startAt, locale)} · {formatSlotRange(booking, locale)}
                </span>
              )}
              <a href={phoneHref} className="flex items-center gap-1.5 font-bold text-brand-600 hover:underline dark:text-brand-400">
                <Phone className="size-3.5" />
                {booking.customerPhone}
              </a>
            </div>
          </div>

          {/* §2.2 request SLA — the LIVE ticking countdown + urgency bar (the
              SAME component the admin dispute view and the customer rows
              render, so all three sides see the deadline without leaving the
              page — hydration-safe via the shared nowSeed). The worker's copy
              swaps to the nudge variant once the cron nudged (lastSlaNudgeAt). */}
          <BookingSlaCountdown booking={booking} nowSeed={nowSeed} variant="worker" compact />

          {/* Multi-candidate quote bids (docs/multi-candidate-quotes.md §7) —
              QUOTING invites render the inline bid form (quote + optional
              deposit); a submitted QUOTED bid shows the amount and waits on
              the customer's pick. */}
          {booking.status === "quoting" && (
            <div className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <label className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
                {t("booking.quote")}
                <Input value={bidQuote} onChange={(e) => setBidQuote(e.target.value)} className="mt-0.5 h-8 w-24" dir="ltr" placeholder="50" inputMode="decimal" />
              </label>
              <label className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
                {t("booking.deposit")}
                <Input value={bidDeposit} onChange={(e) => setBidDeposit(e.target.value)} className="mt-0.5 h-8 w-24" dir="ltr" placeholder="0" inputMode="decimal" />
              </label>
              <Button size="sm" className="ms-auto" onClick={submitBid} disabled={bidding || !bidQuote.trim()}>
                {bidding ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {t("booking.quotesSubmitBid")}
              </Button>
            </div>
          )}
          {booking.status === "quoted" && (
            <div className="mt-3 w-full rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-xs">
              <span className="font-black text-ink-900 dark:text-ink-50">{t("booking.quotesAwaitingPick")}</span>
              {booking.quote !== undefined && (
                <span className="ms-2 font-bold text-brand-600 dark:text-brand-400">
                  <Price amount={booking.quote / 100} currency={booking.currency} locale={locale} />
                </span>
              )}
            </div>
          )}

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

        {/* §2.4 printable audit trail — the PDF/print view + on-demand email
            (the same components the customer row + admin dispute page render,
            so all three sides share the identical document + recipient picker). */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BookingPrintButton
            booking={booking}
            workerName={locale === "ar" ? worker.nameAr : worker.nameEn}
          />
          <BookingEmailButton
            booking={booking}
            workerName={locale === "ar" ? worker.nameAr : worker.nameEn}
            workerEmail={worker.email}
          />
        </div>

        {/* §2.4 dispute timeline — the shared "what happened and when" trail
            (the identical component the customer row renders, mirroring the
            admin dispute view). */}
        <BookingTimeline booking={booking} workerName={locale === "ar" ? worker.nameAr : worker.nameEn} />

        {/* §2.3 customer ⇄ worker chat — the shared negotiation thread keyed on
            the booking, with quote sharing (worker attaches a price) and the
            customer's phone as the WhatsApp deep-link fallback. */}
        <BookingChat
          booking={booking}
          messages={messages}
          viewerRole="worker"
          workerName={locale === "ar" ? worker.nameAr : worker.nameEn}
        />
      </CardContent>
    </Card>
  );
}
