import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, MessageCircle, Repeat, ScrollText, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { getBookingByNumber, getBookingMessages, getRecurringById, getWorkerById } from "@/lib/data/repo";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { bookingEmailPreviewFor } from "@/lib/data/booking-notifications";
import { timeAgo } from "@/lib/utils";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { BookingPrintButton } from "@/components/bookings/booking-print-button";
import { BookingEmailButton } from "@/components/bookings/booking-email-button";
import { BookingChat } from "@/components/bookings/booking-chat";
import { BookingSlaCountdown } from "@/components/bookings/booking-sla-countdown";
import { AdminBookingActions } from "@/components/admin/admin-booking-actions";
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

/** Cadence label for the recurring-contract card (mirrors the booking UIs). */
const FREQ_LABEL_KEY: Record<string, string> = {
  weekly: "booking.repeatWeekly",
  biweekly: "booking.repeatBiweekly",
  monthly: "booking.repeatMonthly",
};

/** Occurrence statuses that no longer count as an upcoming visit. */
const RECURRING_TERMINAL_STATUSES = ["completed", "cancelled", "declined", "noShow"];

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
  // §2.3 chat — the booking's negotiation thread (read-only here: the admin
  // sees the same messages the customer + worker rows render, so the dispute
  // view carries the whole conversation).
  const messages = await getBookingMessages(booking.id);

  // Recurring context (W2) — when this booking is an occurrence of a
  // maintenance contract (recurringId set), surface the contract behind it:
  // number, cadence, the next upcoming visit and every occurrence's status, so
  // a dispute about one visit reads against the whole cadence. Each occurrence
  // deep-links to its own dispute page.
  const recurring = booking.recurringId ? await getRecurringById(booking.recurringId) : null;
  const nextVisit = recurring?.occurrences.find(
    (o) => !RECURRING_TERMINAL_STATUSES.includes(o.status) && o.endAt != null && new Date(o.endAt).getTime() >= Date.now()
  );

  // "Preview email" — render the exact email the customer received in BOTH
  // locales, built from the SAME bookingNotification payload the adapters
  // dispatch (shared bookingEmailPreviewFor helper — also used by the
  // customer /bookings rows), so the preview and the real email can never
  // drift. Hidden when the booking's current state implies no customer-facing
  // email was sent (REQUESTED / NO_SHOW / customer-initiated cancellation).
  const preview = bookingEmailPreviewFor(booking);

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
        <div className="flex flex-wrap items-center gap-2">
          {/* §2.4 — the admin's platform actions: cancel the booking (frees the
              slot + notifies both parties + refunds a paid deposit) or refund
              the paid deposit without cancelling. Rendered server-side with
              the booking's payment state so the buttons only appear when the
              action is possible. */}
          <AdminBookingActions booking={booking} />
          <BookingPrintButton
            booking={booking}
            workerName={locale === "ar" ? worker?.nameAr : worker?.nameEn}
          />
          <BookingEmailButton
            booking={booking}
            workerName={locale === "ar" ? worker?.nameAr : worker?.nameEn}
            workerEmail={worker?.email}
          />
          {preview && (
            <EmailPreviewDialog
              type={preview.type}
              subjectEn={preview.subjectEn}
              subjectAr={preview.subjectAr}
              htmlEn={preview.htmlEn}
              htmlAr={preview.htmlAr}
              recipient={{ name: booking.customerName, email: booking.customerEmail }}
            />
          )}
        </div>
      </div>

      {/* §2.2 request SLA — the admin reads the SAME live ticking clock (with
          urgency bar + red-state pulse) the worker and customer see, driven by
          the shared requestSlaExpiryMs (the window the cron enforces) and the
          nudge state from Booking.slaNudgeSent (demo + prisma both stamp it).
          nowSeed = Date.now() at server render time so the client's first
          render matches the SSR markup exactly (no hydration mismatch). */}
      <BookingSlaCountdown booking={booking} nowSeed={Date.now()} />

      {recurring && (
        <Card className="mt-8 border-brand-500/30 bg-brand-500/[0.03]">
          <CardHeader className="flex-row items-center gap-2">
            <Repeat className="size-4 shrink-0 text-brand-500" />
            <CardTitle className="min-w-0 text-base">{t("booking.recurringContract")}</CardTitle>
            <span className="font-mono text-sm font-bold text-ink-900 dark:text-ink-50" dir="ltr">
              {recurring.number}
            </span>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {t(FREQ_LABEL_KEY[recurring.frequency] ?? "booking.repeatWeekly")}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-ink-100/60 px-3 py-2 dark:bg-ink-800/60">
              <CalendarClock className="size-4 text-brand-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                {t("booking.recurringNextVisit")}
              </p>
              {nextVisit && nextVisit.startAt ? (
                <p className="font-medium text-ink-800 dark:text-ink-100" dir="ltr">
                  {new Date(nextVisit.startAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                  {" "}·{" "}
                  {formatSlotRange(nextVisit, locale)}
                </p>
              ) : (
                <p className="text-sm text-ink-400">{t("booking.recurringNoNextVisit")}</p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                {t("booking.recurringOccurrences")}
              </p>
              <Badge variant="outline" className="text-[10px]">{recurring.occurrences.length}</Badge>
            </div>
            <ol className="mt-1 divide-y divide-ink-50 dark:divide-ink-800/60">
              {recurring.occurrences.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="text-xs font-medium text-ink-500 dark:text-ink-400" dir="ltr">
                    {formatSlotRange(o, locale)}
                  </span>
                  <BookingStatusBadge status={o.status} />
                  {o.number !== booking.number && (
                    <Link
                      href={`/admin/bookings/${o.number}`}
                      className="ms-auto font-mono text-[11px] text-brand-600 hover:underline dark:text-brand-400"
                      dir="ltr"
                    >
                      {o.number}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

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
                {booking.startAt ? (
                  <span dir="ltr">{formatSlotRange(booking, locale)}</span>
                ) : (
                  <span className="text-xs text-ink-400">{t("booking.quotesNoSlot")}</span>
                )}
              </p>
              {booking.startAt && (
                <p className="text-xs text-ink-400">{new Date(booking.startAt).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "full" })}</p>
              )}
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

        {/* §2.3 chat — the customer ⇄ worker negotiation thread (read-only:
            the admin sees the SAME messages the customer + worker rows render,
            so the dispute view carries the whole conversation). */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-2">
            <MessageCircle className="size-4 shrink-0 text-brand-500" />
            <CardTitle className="min-w-0 text-base">{t("booking.chatTitle")}</CardTitle>
            <Badge variant="outline" className="ms-auto shrink-0 text-[10px]">{messages.length}</Badge>
          </CardHeader>
          <CardContent className="px-6 py-5">
            <BookingChat
              booking={booking}
              messages={messages}
              viewerRole="admin"
              workerName={locale === "ar" ? worker?.nameAr : worker?.nameEn}
              workerWhatsapp={worker?.whatsapp}
              bare
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
