import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/auth-demo";
import { getCustomerBookings, getWorkerById } from "@/lib/data/repo";
import { BookingsClient } from "@/components/bookings/bookings-client";
import type { Booking } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "My bookings",
  description: "Track your booking requests and confirmed jobs.",
};

/** A booking plus the worker display data resolved server-side. */
export interface CustomerBookingRow {
  booking: Booking;
  worker: { nameEn: string; nameAr: string; slug: string; hue: number } | null;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, t } = await getI18n();
  const session = await getSession();
  const raw = await searchParams;
  const phoneParam = typeof raw.phone === "string" ? raw.phone.trim() : "";

  // Signed-in customers are matched by email; guests look up by phone (the
  // phone they used when booking — matched with normalization in the repo).
  const email = session?.email;
  const lookedUp = !email && phoneParam.length > 0;
  const bookings = await getCustomerBookings(
    email ? { email } : phoneParam ? { phone: phoneParam } : {}
  );

  const workers = await Promise.all(
    bookings.map((b) => getWorkerById(b.workerId).then((w) => (w ? { nameEn: w.nameEn, nameAr: w.nameAr, slug: w.slug, hue: w.hue } : null)))
  );
  const rows: CustomerBookingRow[] = bookings.map((booking, i) => ({ booking, worker: workers[i] ?? null }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
        {t("booking.myBookings")}
      </h1>
      <p className="mt-2 text-ink-500 dark:text-ink-400">{t("booking.myBookingsSubtitle")}</p>

      <BookingsClient rows={rows} signedIn={Boolean(session)} lookedUp={lookedUp} />
    </div>
  );
}
