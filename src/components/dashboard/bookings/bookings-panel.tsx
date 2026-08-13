"use client";

import Link from "next/link";
import { CalendarClock, Inbox, ArrowUpRight } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { bucketBookings } from "@/lib/data/booking-ui";
import { BookingRow } from "./booking-row";
import type { Booking, Worker } from "@/lib/data/types";

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
export function BookingsPanel({ bookings, worker }: { bookings: Booking[]; worker: Worker }) {
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="requests">
              {t("booking.requests")}
              <span className="ms-1 rounded-full bg-brand-500/15 px-1.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
                {requests.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {t("booking.upcoming")}
              <span className="ms-1 rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                {upcoming.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="past">
              {t("booking.past")}
              <span className="ms-1 rounded-full bg-ink-500/10 px-1.5 text-[11px] font-black text-ink-500 dark:text-ink-400">
                {past.length}
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
              requests.map((b) => <BookingRow key={b.id} booking={b} worker={worker} />)
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
              upcoming.map((b) => <BookingRow key={b.id} booking={b} worker={worker} />)
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-5" />} title={t("booking.pastEmpty")} body={t("booking.pastEmptyBody")} />
            ) : (
              past.map((b) => <BookingRow key={b.id} booking={b} worker={worker} />)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
