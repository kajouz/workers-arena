"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarX2, Loader2, Repeat, Search, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { cancelRecurringContractAction } from "@/app/actions/bookings";
import { BookingRow } from "./booking-row";
import { QuoteRequestCard } from "./quote-request-card";
import type { CustomerBookingRow, CustomerQuoteRow, CustomerRecurringRow } from "@/app/bookings/page";
import type { BookingStatus, RecurringBooking } from "@/lib/data/types";

const UPCOMING: BookingStatus[] = ["requested", "pendingPayment", "confirmed", "inProgress"];
const PAST: BookingStatus[] = ["completed", "cancelled", "declined", "noShow"];

const FREQ_LABEL_KEY: Record<RecurringBooking["frequency"], string> = {
  weekly: "booking.repeatWeekly",
  biweekly: "booking.repeatBiweekly",
  monthly: "booking.repeatMonthly",
};

/**
 * M1 §7 #1 — one contract card: cadence, the next few visits, and a two-step
 * inline cancel (confirm stops the whole cadence; the anchor slot frees).
 */
function RecurringContractCard({ row }: { row: CustomerRecurringRow }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const contract = row.recurring;

  const upcoming = contract.occurrences.filter((o) => UPCOMING.includes(o.status)).slice(0, 3);
  // Occurrences are always slot-bound (the cadence materializes real slots),
  // so startAt is guaranteed — the non-null assertion mirrors that invariant.
  const nextDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { weekday: "short", day: "numeric", month: "short" });

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    const res = await cancelRecurringContractAction(contract.id, new FormData());
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      toast("success", t("booking.recurringCancelled"));
      router.refresh();
    } else {
      toast("error", t("booking.recurringError"));
    }
  };

  return (
    <div className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
              {contract.number}
            </span>
            <Badge variant="secondary">{t(FREQ_LABEL_KEY[contract.frequency])}</Badge>
            {contract.status === "cancelled" && (
              <Badge variant="danger">{t("booking.status.cancelled")}</Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm font-black text-ink-900 dark:text-ink-50">{contract.jobTitle}</p>
          {row.worker && (
            <Link
              href={`/workers/${row.worker.slug}`}
              className="mt-0.5 inline-block text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
            >
              {locale === "ar" ? row.worker.nameAr : row.worker.nameEn}
            </Link>
          )}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t("booking.nextVisits")}</p>
          <ul className="mt-1 space-y-1">
            {upcoming.map((occ) => (
              <li key={occ.id} className="flex items-center gap-2 text-xs font-bold text-ink-600 dark:text-ink-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {nextDate(occ.startAt!)} · {formatSlotRange({ startAt: occ.startAt, endAt: occ.endAt }, locale)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {contract.status === "active" && !confirming && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            {t("booking.recurringCancel")}
          </Button>
        )}
        {contract.status === "active" && confirming && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{t("booking.recurringCancelConfirm")}</p>
            <div className="ms-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" variant="destructive" onClick={cancel} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t("booking.recurringCancelNow")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Customer "My bookings" list (docs/booking-customer-ui.md §5.5). Tabs split
 * Upcoming vs Past; signed-out visitors with no phone lookup get a GET form
 * (plain <form method="get"> → /bookings?phone=…, re-rendered server-side).
 */
export function BookingsClient({
  rows,
  recurringRows,
  quoteRows,
  signedIn,
  lookedUp,
  nowSeed,
}: {
  rows: CustomerBookingRow[];
  recurringRows: CustomerRecurringRow[];
  quoteRows: CustomerQuoteRow[];
  signedIn: boolean;
  lookedUp: boolean;
  /** Date.now() at server render time — the rows' hydration-safe now seed. */
  nowSeed: number;
}) {
  const { t } = useLocale();

  const upcoming = useMemo(() => rows.filter((r) => UPCOMING.includes(r.booking.status)), [rows]);
  const past = useMemo(() => rows.filter((r) => PAST.includes(r.booking.status)), [rows]);

  // Guest visitor with no phone lookup yet — show the lookup card.
  if (!signedIn && !lookedUp && rows.length === 0) {
    return (
      <Card className="mt-8">
        <CardContent className="flex flex-col items-center py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <CalendarX2 className="size-7" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">{t("booking.guestLookupTitle")}</h3>
          <p className="mt-1.5 max-w-sm text-sm text-ink-500 dark:text-ink-400">{t("booking.guestLookupBody")}</p>
          <form method="get" className="mt-6 flex w-full max-w-sm gap-2">
            <Input name="phone" placeholder={t("booking.guestLookupPlaceholder")} required dir="ltr" />
            <Button type="submit">
              <Search className="size-4" />
              {t("booking.guestLookup")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const noResults = rows.length === 0;

  return (
    <div className="mt-8">
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            {t("booking.upcoming")}
            {upcoming.length > 0 && <span className="ms-1.5 rounded-full bg-brand-500/15 px-1.5 text-xs font-black text-brand-600 dark:text-brand-400">{upcoming.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="past">
            {t("booking.past")}
            {past.length > 0 && <span className="ms-1.5 rounded-full bg-ink-500/10 px-1.5 text-xs font-black text-ink-500">{past.length}</span>}
          </TabsTrigger>
          {recurringRows.length > 0 && (
            <TabsTrigger value="recurring">
              {t("booking.recurring")}
              <span className="ms-1.5 rounded-full bg-brand-500/15 px-1.5 text-xs font-black text-brand-600 dark:text-brand-400">
                {recurringRows.length}
              </span>
            </TabsTrigger>
          )}
          {quoteRows.length > 0 && (
            <TabsTrigger value="quotes">
              {t("booking.quotesTab")}
              <span className="ms-1.5 rounded-full bg-cyan-500/15 px-1.5 text-xs font-black text-cyan-600 dark:text-cyan-400">
                {quoteRows.length}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {noResults && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <CalendarX2 className="size-10 text-ink-300 dark:text-ink-600" />
              <p className="font-bold text-ink-900 dark:text-ink-50">{t("booking.empty")}</p>
              <p className="text-sm text-ink-400">{lookedUp ? t("booking.guestLookupNone") : t("booking.emptyBody")}</p>
              {!lookedUp && (
                <Link href="/search" className="mt-3">
                  <Button variant="outline" size="sm">{t("nav.findWorkers")}</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {upcoming.map((r) => (
            <BookingRow key={r.booking.id} row={r} nowSeed={nowSeed} />
          ))}
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-3">
          {past.map((r) => (
            <BookingRow key={r.booking.id} row={r} nowSeed={nowSeed} />
          ))}
        </TabsContent>

        <TabsContent value="recurring" className="mt-4 space-y-3">
          {recurringRows.map((r) => (
            <RecurringContractCard key={r.recurring.id} row={r} />
          ))}
        </TabsContent>

        <TabsContent value="quotes" className="mt-4 space-y-3">
          {quoteRows.length === 0 ? (
            <Card className="mt-6">
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <Users className="size-10 text-ink-300 dark:text-ink-600" />
                <p className="font-bold text-ink-900 dark:text-ink-50">{t("booking.quotesEmpty")}</p>
                <p className="text-sm text-ink-400">{t("booking.quotesEmptyBody")}</p>
              </CardContent>
            </Card>
          ) : (
            quoteRows.map((r) => <QuoteRequestCard key={r.quoteRequest.id} quoteRequest={r.quoteRequest} workers={r.workers} nowSeed={nowSeed} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
