import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, ScrollText, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { getBookingByNumber, getWorkerById } from "@/lib/data/repo";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { customerEmailKind, bookingNotification } from "@/lib/data/booking-notifications";
import { renderBookingEmail } from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Notification } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { EmailPreviewDialog } from "@/components/admin/email-preview-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Booking dispute view" };

/** Actor label for a timeline entry ("customer" / "worker" / "system"). */
const ACTOR_LABEL_KEY: Record<string, string> = {
  customer: "booking.disputeActorCustomer",
  worker: "booking.disputeActorWorker",
  system: "booking.disputeActorSystem",
  admin: "booking.disputeActorAdmin",
};

/**
 * Admin dispute view — the full audit trail of one booking, reached from the
 * Recent activity feed's booking entries (deep link /admin/bookings/[number]).
 * Purpose: when a customer or worker disputes what happened, this page shows
 * every status change with the acting party, reason and timestamp — the same
 * event trail the booking funnel's counts are derived from, so the two always
 * tell one story.
 */
export default async function AdminBookingDisputePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { number } = await params;
  const { locale, t } = await getI18n();
  const booking = await getBookingByNumber(number);
  if (!booking) notFound();

  const worker = await getWorkerById(booking.workerId);

  // "Preview email" — render the exact confirmation email the customer
  // received, built from the SAME bookingNotification payload the adapters
  // dispatch, so the preview and the real email can never drift. Hidden when
  // the booking's current state implies no customer-facing email was sent
  // (REQUESTED / NO_SHOW / customer-initiated cancellation).
  let preview: { type: Notification["type"]; subject: string; html: string } | null = null;
  const emailKind = customerEmailKind(booking);
  if (emailKind) {
    const msg = bookingNotification(booking, emailKind);
    const payload: ChannelPayload = {
      id: `preview-${booking.id}`,
      type: msg.type,
      titleEn: msg.titleEn,
      titleAr: msg.titleAr,
      bodyEn: msg.bodyEn,
      bodyAr: msg.bodyAr,
      href: msg.href,
      time: new Date().toISOString(),
      booking: msg.booking,
      recipient: { name: booking.customerName, email: booking.customerEmail, locale: "en" },
    };
    const email = renderBookingEmail(payload, "en");
    preview = { type: msg.type, subject: email.subject, html: email.html };
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("admin.backToOverview")}
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            <ShieldAlert className="size-6 text-amber-500" />
            <span dir="ltr">{booking.number}</span>
            <BookingStatusBadge status={booking.status} />
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("booking.disputeSubtitle")}</p>
        </div>
        {preview && (
          <EmailPreviewDialog
            type={preview.type}
            subject={preview.subject}
            html={preview.html}
            recipient={{ name: booking.customerName, email: booking.customerEmail }}
          />
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Booking details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{t("booking.disputeDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.disputeJob")}</p>
              <p className="font-medium text-ink-800 dark:text-ink-100">{booking.jobTitle}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.disputeWorker")}</p>
              <p className="font-medium text-ink-800 dark:text-ink-100">
                {locale === "ar" ? worker?.nameAr : worker?.nameEn ?? booking.workerId}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.disputeCustomer")}</p>
              <p className="font-medium text-ink-800 dark:text-ink-100">{booking.customerName}</p>
              <p className="text-xs text-ink-400" dir="ltr">{booking.customerPhone}</p>
              {booking.customerEmail && (
                <p className="text-xs text-ink-400" dir="ltr">{booking.customerEmail}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.disputeSlot")}</p>
              <p className="flex items-center gap-1.5 font-medium text-ink-800 dark:text-ink-100">
                <CalendarClock className="size-3.5 text-ink-400" />
                <span dir="ltr">{formatSlotRange(booking, locale)}</span>
              </p>
              <p className="text-xs text-ink-400">{new Date(booking.startAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "full" })}</p>
            </div>
            {booking.note && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.jobNote")}</p>
                <p className="text-ink-600 dark:text-ink-300">{booking.note}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
              {booking.quote != null && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.quote")}</p>
                  <p className="font-bold text-ink-900 dark:text-ink-50">
                    {(booking.quote / 100).toFixed(2)} {booking.currency}
                  </p>
                </div>
              )}
              {booking.deposit != null && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("booking.deposit")}</p>
                  <p className="font-bold text-ink-900 dark:text-ink-50">
                    {(booking.deposit / 100).toFixed(2)} {booking.currency}
                  </p>
                </div>
              )}
            </div>
            {booking.invoice && (
              <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t("booking.invoice")}
                </p>
                <p className="font-mono text-sm font-bold text-ink-900 dark:text-ink-50" dir="ltr">
                  {booking.invoice.number}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event trail */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-2">
            <ScrollText className="size-4 shrink-0 text-brand-500" />
            <CardTitle className="min-w-0 text-base">{t("booking.disputeEvents")}</CardTitle>
            <Badge variant="outline" className="ms-auto shrink-0 text-[10px]">{booking.events.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-ink-50 dark:divide-ink-800/60">
              {booking.events.map((e, i) => (
                <li key={i} className="flex items-start gap-3 px-6 py-3.5">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      e.status === "cancelled" || e.status === "declined" || e.status === "noShow"
                        ? "bg-red-500"
                        : e.status === "confirmed" || e.status === "completed"
                          ? "bg-emerald-500"
                          : e.status === "requested"
                            ? "bg-amber-400"
                            : "bg-sky-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold text-ink-800 dark:text-ink-100">
                        {t(`booking.status.${e.status}`)}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {t(ACTOR_LABEL_KEY[e.actorType] ?? "booking.disputeActorSystem")}
                      </Badge>
                    </div>
                    {e.reason && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{e.reason}</p>}
                    <p className="mt-0.5 text-xs text-ink-400">{timeAgo(e.time, locale)}</p>
                  </div>
                </li>
              ))}
              {booking.events.length === 0 && (
                <li className="px-6 py-10 text-center text-sm text-ink-400">{t("booking.disputeNoEvents")}</li>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
