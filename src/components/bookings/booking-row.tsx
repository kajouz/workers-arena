"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, CreditCard, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GradientAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "./booking-status-badge";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { Price } from "@/components/shared/price";
import { confirmCompletionAction, payBookingAction } from "@/app/actions/bookings";
import { RescheduleDialog } from "./reschedule-dialog";
import { BookingTimeline } from "./booking-timeline";
import { BookingChat } from "./booking-chat";
import { BookingPrintButton } from "./booking-print-button";
import { BookingEmailButton } from "./booking-email-button";
import { EmailPreviewDialog } from "@/components/admin/email-preview-dialog";
import { BOOKING_CANCEL_REFUND_WINDOW_MS } from "@/lib/data/types";
import { BookingSlaCountdown } from "./booking-sla-countdown";
import { PaymentMethodPicker, type CheckoutMethod } from "@/components/payments/payment-method-picker";
import type { CustomerBookingRow } from "@/app/bookings/page";

/**
 * One customer booking (docs/booking-customer-ui.md §5.5): worker avatar +
 * name, booking number, localized time, status badge, quote (÷100 from minor
 * units), and the shared dispute timeline (BookingTimeline) — the read-only
 * "what happened and when" trail mirroring the admin dispute view.
 */
export function BookingRow({ row, nowSeed }: { row: CustomerBookingRow; nowSeed: number }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payMethod, setPayMethod] = useState<CheckoutMethod>("stripe");
  const [, startTransition] = useTransition();
  const { booking, worker } = row;
  const name = locale === "ar" ? worker?.nameAr : worker?.nameEn;
  const needsPayment = booking.status === "pendingPayment" && booking.deposit !== undefined;

  const startCheckout = () => {
    if (paying) return;
    setPaying(true);
    startTransition(async () => {
      const res = await payBookingAction(booking.id, payMethod);
      if (res.ok && res.url) {
        window.location.href = res.url;
      } else {
        setPaying(false);
        toast("error", t("booking.paymentFailed"));
      }
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          {worker ? (
            <Link href={`/workers/${worker.slug}`} className="shrink-0">
              <GradientAvatar name={name ?? "W"} hue={worker.hue} className="size-11" />
            </Link>
          ) : (
            <GradientAvatar name="W" className="size-11" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-ink-900 dark:text-ink-50">{name ?? t("booking.bookingWith")}</p>
              <span className="text-xs text-ink-400">
                {t("booking.bookingNumber")} {booking.number}
              </span>
              <BookingStatusBadge status={booking.status} className="ms-auto" />
            </div>

            {/* §2.4 printable audit trail — the PDF/print view + on-demand email. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <BookingPrintButton booking={booking} workerName={name} />
              <BookingEmailButton booking={booking} workerName={name} workerEmail={worker?.email} />
              {/* "What I received" — the bilingual preview of the customer email
                  the booking's state implies, rendered with the SAME builder
                  the adapters dispatch (mirroring the admin dispute view).
                  Hidden until the customer received an email (REQUESTED etc.). */}
              {row.emailPreview && (
                <EmailPreviewDialog
                  type={row.emailPreview.type}
                  subjectEn={row.emailPreview.subjectEn}
                  subjectAr={row.emailPreview.subjectAr}
                  htmlEn={row.emailPreview.htmlEn}
                  htmlAr={row.emailPreview.htmlAr}
                  recipient={{ name: booking.customerName, email: booking.customerEmail }}
                />
              )}
            </div>

            <p className="mt-1.5 text-sm font-semibold text-ink-700 dark:text-ink-200">{booking.jobTitle}</p>
            {booking.serviceItem && (
              <p className="mt-0.5 text-xs text-ink-400">
                {locale === "ar" ? booking.serviceItem.nameAr : booking.serviceItem.nameEn}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              {booking.startAt && (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  {formatDate(booking.startAt, locale)}
                </span>
              )}
              {booking.quote !== undefined && (
                <span className="flex items-center gap-1.5">
                  <Price amount={booking.quote / 100} currency={booking.currency} locale={locale} className="font-bold text-brand-600 dark:text-brand-400" />
                </span>
              )}
              {worker && (
                <Link href={`/workers/${worker.slug}`} className="flex items-center gap-1 font-bold text-brand-600 hover:underline dark:text-brand-400">
                  {t("booking.viewWorker")}
                  <ExternalLink className="size-3" />
                </Link>
              )}
            </div>

            {/* M5 take rate (docs/booking-take-rate.md §5) — the transparency
                line under the quote: the customer pays the quote total, the
                platform settles its cut from it. A fee > 0 shows the split;
                an exempt plan stores exactly 0 (computePlatformFee only
                returns 0 for exempt — the min-clamp guarantees it), so the
                row says the fee is waived instead of hiding the line. */}
            {booking.platformFee ? (
              <p className="mt-1.5 text-[11px] text-ink-400">
                {t("booking.includesFee")}{" "}
                <Price amount={booking.platformFee / 100} currency={booking.currency} locale={locale} className="font-bold" />
                <span className="mx-1 text-ink-300 dark:text-ink-600">·</span>
                {t("booking.workerReceives")}{" "}
                <Price
                  amount={((booking.quote ?? 0) - booking.platformFee) / 100}
                  currency={booking.currency}
                  locale={locale}
                  className="font-bold"
                />
              </p>
            ) : booking.platformFee === 0 ? (
              <p className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {t("booking.feeWaivedNote")}
              </p>
            ) : null}

            {(booking.status === "confirmed" || booking.status === "inProgress") && (
              <div className="mt-3">
                <RescheduleDialog booking={booking} by="customer" />
              </div>
            )}

            {/* §2.3 customer-confirms-completion — the worker staged the job
                as done; the customer's confirm releases the payout. Without
                it the grace cron auto-confirms after 72h. */}
            {booking.status === "completionPending" && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("booking.confirmCompletion")}</p>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{t("booking.confirmCompletionBody")}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (confirming) return;
                    setConfirming(true);
                    startTransition(async () => {
                      const res = await confirmCompletionAction(booking.id);
                      setConfirming(false);
                      if (res.ok) {
                        toast("success", t("booking.confirmCompletionToast"));
                        router.refresh();
                      } else {
                        toast("error", t("booking.confirmCompletionError"));
                      }
                    });
                  }}
                  disabled={confirming}
                >
                  <CheckCircle2 className="size-4" />
                  {confirming ? t("booking.confirming") : t("booking.confirmButton")}
                </Button>
              </div>
            )}

            {needsPayment && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                    {t("booking.payDeposit")}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {t("booking.payDepositBody").replace(
                      "{amount}",
                      `${(booking.deposit! / 100).toLocaleString(locale)} ${booking.currency}`
                    )}
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <PaymentMethodPicker value={payMethod} onChange={setPayMethod} disabled={paying} compact />
                </div>
                <Button size="sm" onClick={startCheckout} disabled={paying}>
                  <CreditCard className="size-4" />
                  {paying ? t("booking.paying") : t("booking.payNow")}
                </Button>
              </div>
            )}

            {/* §2.2 request SLA — the LIVE ticking countdown + urgency bar (the
                SAME component the admin dispute view and the worker dashboard
                render, so all three sides see the deadline without leaving
                the page — hydration-safe via the shared nowSeed). */}
            <BookingSlaCountdown booking={booking} nowSeed={nowSeed} variant="customer" compact />

            {/* M4 cancellation/refund policy — shown wherever a deposit is at
                stake so the refund rules are visible next to the money
                (docs/ENHANCEMENT-PLAN.md §2.4). The {hours} placeholder is
                interpolated from the shared policy constant (bookingCancelRefundDue). */}
            {booking.deposit !== undefined && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {t("booking.cancelPolicyRow").replace(/\{hours\}/g, String(BOOKING_CANCEL_REFUND_WINDOW_MS / 3_600_000))}
                </span>
              </p>
            )}

            {/* M3 receipt — created at payment-confirm for signed-in customers
                only. VOIDED when the deposit was refunded (admin refund or a
                refund-due cancellation) — the receipt then renders struck
                through so it stops reading as money the platform holds. */}
            {booking.invoice &&
              (booking.invoice.status === "voided" ? (
                <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-ink-200 bg-ink-900/5 px-3 py-2.5 dark:border-ink-800 dark:bg-ink-100/5">
                  <FileText className="size-4 shrink-0 text-ink-400" />
                  <p className="min-w-0 flex-1 truncate text-xs text-ink-400">
                    {t("booking.invoice")}{" "}
                    <span className="font-bold text-ink-500 line-through decoration-ink-400/60 dark:text-ink-400">
                      {booking.invoice.number}
                    </span>
                    <span className="mx-1.5 text-ink-300 dark:text-ink-600">·</span>
                    <Price
                      amount={booking.invoice.amount / 100}
                      currency={booking.invoice.currency}
                      locale={locale}
                      className="font-bold text-ink-400 line-through decoration-ink-400/60"
                    />
                    <span className="ms-2 rounded-full bg-ink-900/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:bg-ink-100/10 dark:text-ink-400">
                      {t("booking.invoiceVoided")}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                  <FileText className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="min-w-0 flex-1 truncate text-xs text-ink-600 dark:text-ink-300">
                    {t("booking.invoice")}{" "}
                    <span className="font-bold text-ink-900 dark:text-ink-50">{booking.invoice.number}</span>
                    <span className="mx-1.5 text-ink-300 dark:text-ink-600">·</span>
                    <Price
                      amount={booking.invoice.amount / 100}
                      currency={booking.invoice.currency}
                      locale={locale}
                      className="font-bold text-emerald-600 dark:text-emerald-400"
                    />
                  </p>
                </div>
              ))}
          </div>
        </div>

        {/* §2.4 dispute timeline — the shared "what happened and when" trail
            (same component the worker dashboard rows render, mirroring the
            admin dispute view). */}
        <BookingTimeline booking={booking} workerName={name} />

        {/* §2.3 customer ⇄ worker chat — the shared negotiation thread keyed on
            the booking, with the worker's WhatsApp deep-link fallback. */}
        <BookingChat
          booking={booking}
          messages={row.messages}
          viewerRole="customer"
          workerName={name}
          workerWhatsapp={worker?.whatsapp}
        />
      </CardContent>
    </Card>
  );
}
