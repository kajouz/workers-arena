"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Inbox, ArrowUpRight, Loader2, Repeat } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { bucketBookings, formatSlotRange } from "@/lib/data/booking-ui";
import { RECURRING_OCCURRENCE_COUNT } from "@/lib/data/recurring";
import { respondRecurringBookingAction } from "@/app/actions/bookings";
import { BookingRow } from "./booking-row";
import type { Booking, BookingMessage, RecurringBooking, Worker } from "@/lib/data/types";
import type { WorkerEmailPreview } from "@/app/dashboard/page";

const FREQ_LABEL_KEY: Record<RecurringBooking["frequency"], string> = {
  weekly: "booking.repeatWeekly",
  biweekly: "booking.repeatBiweekly",
  monthly: "booking.repeatMonthly",
};

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">{icon}</span>
      <p className="text-sm font-black text-ink-900 dark:text-ink-50">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-ink-400">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
        >
          {cta.label} <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

/**
 * Worker-dashboard bookings panel (docs/booking-scheduling.md §6): a tabbed
 * list — Requests (waiting on the worker), Upcoming (accepted/scheduled),
 * Past (completed/voided) — with counts on each tab and empty states per tab.
 */
/**
 * M1 (§7 #1) — one contract row: the first occurrence + cadence, with an
 * inline accept (optional quote/deposit — the take-rate path) or decline.
 */
function RecurringContractRow({ contract }: { contract: RecurringBooking }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [quote, setQuote] = useState("");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const first = contract.occurrences[0];

  const act = async (accept: boolean) => {
    if (busy) return;
    setBusy(accept ? "accept" : "decline");
    const fd = new FormData();
    fd.set("accept", String(accept));
    if (accept) {
      fd.set("quote", quote);
      if (deposit) fd.set("deposit", deposit);
    }
    const res = await respondRecurringBookingAction(contract.id, fd);
    setBusy(null);
    if (res.ok) {
      toast("success", t(accept ? "booking.recurringAccepted" : "booking.recurringDeclined"));
      router.refresh();
    } else {
      toast("error", t("booking.recurringError"));
    }
  };

  const dateLabel = first?.startAt
    ? new Date(first.startAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "";
  const total = 1 + RECURRING_OCCURRENCE_COUNT;

  return (
    <div className="rounded-xl border border-ink-100 p-3 dark:border-ink-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
              {contract.number}
            </span>
            <Badge variant="secondary">{t(FREQ_LABEL_KEY[contract.frequency])}</Badge>
          </div>
          <p className="mt-1 truncate text-sm font-black text-ink-900 dark:text-ink-50">{contract.jobTitle}</p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">
            {contract.customerName} · {t("booking.recurringVisits").replace("{total}", String(total)).replace("{freq}", t(FREQ_LABEL_KEY[contract.frequency]))}
          </p>
          {first && (
            <p className="mt-0.5 text-xs font-bold text-ink-600 dark:text-ink-300">
              {dateLabel} · {formatSlotRange({ startAt: first.startAt, endAt: first.endAt }, locale)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
          {t("booking.quote")}
          <Input value={quote} onChange={(e) => setQuote(e.target.value)} className="mt-0.5 h-8 w-24" dir="ltr" placeholder="50" />
        </label>
        <label className="text-[11px] font-bold text-ink-500 dark:text-ink-400">
          {t("booking.deposit")}
          <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} className="mt-0.5 h-8 w-24" dir="ltr" placeholder="0" />
        </label>
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => act(false)} disabled={busy !== null}>
            {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("booking.recurringDecline")}
          </Button>
          <Button size="sm" onClick={() => act(true)} disabled={busy !== null}>
            {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("booking.recurringAccept")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BookingsPanel({
  bookings,
  messagesByBooking,
  previewsByBooking,
  worker,
  recurrings,
  nowSeed,
}: {
  bookings: Booking[];
  /** §2.3 chat — each booking's negotiation thread, keyed by booking id. */
  messagesByBooking: Record<string, BookingMessage[]>;
  /** "Preview email" — the WORKER-facing email each booking's state implies,
   * keyed by booking id (computed server-side in /dashboard). */
  previewsByBooking: Record<string, WorkerEmailPreview>;
  worker: Worker;
  recurrings: RecurringBooking[];
  /** Date.now() at server render time — the rows' hydration-safe now seed. */
  nowSeed: number;
}) {
  const { t } = useLocale();
  const { requests, upcoming, past } = bucketBookings(bookings);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-brand-500" />
          {t("booking.panelTitle")}
        </CardTitle>
        {requests.length > 0 && (
          <Badge
            aria-label={`${requests.length} ${t("booking.requests")}`}
            title={`${requests.length} ${t("booking.requests")}`}
            className="animate-pulse border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            {requests.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="requests">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="requests">
              {t("booking.requests")}
              <span className="ms-1 rounded-full bg-brand-500/15 px-1.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
                {requests.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {t("booking.upcoming")}
              <span className="ms-1 rounded-full emerald-badge-sm px-1.5 text-[11px] font-black">
                {upcoming.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="past">
              {t("booking.past")}
              <span className="ms-1 rounded-full bg-ink-500/10 px-1.5 text-[11px] font-black text-ink-500 dark:text-ink-400">
                {past.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="recurring">
              {t("booking.recurring")}
              <span className="ms-1 rounded-full bg-brand-500/15 px-1.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
                {recurrings.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-3">
            {requests.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-5" />}
                title={t("booking.requestsEmpty")}
                body={t("booking.requestsEmptyBody")}
                cta={{ href: `/workers/${worker.slug}`, label: t("dashboard.viewLive") }}
              />
            ) : (
              requests.map((b) => (
                <BookingRow key={b.id} booking={b} messages={messagesByBooking[b.id] ?? []} emailPreview={previewsByBooking[b.id] ?? null} worker={worker} nowSeed={nowSeed} />
              ))
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="size-5" />}
                title={t("booking.upcomingEmpty")}
                body={t("booking.upcomingEmptyBody")}
              />
            ) : (
              upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} messages={messagesByBooking[b.id] ?? []} emailPreview={previewsByBooking[b.id] ?? null} worker={worker} nowSeed={nowSeed} />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-5" />} title={t("booking.pastEmpty")} body={t("booking.pastEmptyBody")} />
            ) : (
              past.map((b) => (
                <BookingRow key={b.id} booking={b} messages={messagesByBooking[b.id] ?? []} emailPreview={previewsByBooking[b.id] ?? null} worker={worker} nowSeed={nowSeed} />
              ))
            )}
          </TabsContent>

          <TabsContent value="recurring" className="space-y-3">
            {recurrings.length === 0 ? (
              <EmptyState icon={<Repeat className="size-5" />} title={t("booking.recurringEmpty")} body={t("booking.recurringEmptyBody")} />
            ) : (
              recurrings.map((r) => <RecurringContractRow key={r.id} contract={r} />)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
