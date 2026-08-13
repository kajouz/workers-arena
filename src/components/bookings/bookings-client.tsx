"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarX2, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/providers/locale-provider";
import { BookingRow } from "./booking-row";
import type { CustomerBookingRow } from "@/app/bookings/page";
import type { BookingStatus } from "@/lib/data/types";

const UPCOMING: BookingStatus[] = ["requested", "pendingPayment", "confirmed", "inProgress"];
const PAST: BookingStatus[] = ["completed", "cancelled", "declined", "noShow"];

/**
 * Customer "My bookings" list (docs/booking-customer-ui.md §5.5). Tabs split
 * Upcoming vs Past; signed-out visitors with no phone lookup get a GET form
 * (plain <form method="get"> → /bookings?phone=…, re-rendered server-side).
 */
export function BookingsClient({ rows, signedIn, lookedUp }: { rows: CustomerBookingRow[]; signedIn: boolean; lookedUp: boolean }) {
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
            <BookingRow key={r.booking.id} row={r} />
          ))}
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-3">
          {past.map((r) => (
            <BookingRow key={r.booking.id} row={r} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
