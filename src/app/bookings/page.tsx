import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/auth-demo";
import { getCustomerBookings, getCustomerQuoteRequests, getCustomerRecurrings, getWorkerById, getBookingMessages } from "@/lib/data/repo";
import { BookingsClient } from "@/components/bookings/bookings-client";
import type { QuoteWorker } from "@/components/bookings/quote-request-card";
import type { Booking, BookingMessage, QuoteRequest, RecurringBooking } from "@/lib/data/types";

export const metadata: Metadata = {
  title: "My bookings",
  description: "Track your booking requests and confirmed jobs.",
};

/** A booking plus the worker display data resolved server-side. */
export interface CustomerBookingRow {
  booking: Booking;
  worker: { nameEn: string; nameAr: string; slug: string; hue: number; email: string; whatsapp: string } | null;
  /** §2.3 chat — the booking's negotiation thread (oldest first). */
  messages: BookingMessage[];
}

/** A recurring contract plus its worker display data (M1 §7 #1). */
export interface CustomerRecurringRow {
  recurring: RecurringBooking;
  worker: { nameEn: string; nameAr: string; slug: string; hue: number } | null;
}

/** A quote job plus its invited workers' display data (multi-candidate quotes). */
export interface CustomerQuoteRow {
  quoteRequest: QuoteRequest;
  workers: Record<string, QuoteWorker | undefined>;
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
    bookings.map((b) =>
      getWorkerById(b.workerId).then((w) =>
        w ? { nameEn: w.nameEn, nameAr: w.nameAr, slug: w.slug, hue: w.hue, email: w.email, whatsapp: w.whatsapp } : null
      )
    )
  );
  // §2.3 chat — each booking's negotiation thread, resolved server-side like
  // the worker display data (one lookup per booking; the rows render the SAME
  // messages the admin dispute view reads).
  const messageLists = await Promise.all(bookings.map((b) => getBookingMessages(b.id)));
  const rows: CustomerBookingRow[] = bookings.map((booking, i) => ({
    booking,
    worker: workers[i] ?? null,
    messages: messageLists[i] ?? [],
  }));

  // M1 recurring contracts (§7 #1) — same identifier as the bookings lookup.
  const identifier = email ? { email } : phoneParam ? { phone: phoneParam } : {};
  const recurrings = await getCustomerRecurrings(identifier);
  const recWorkers = await Promise.all(
    recurrings.map((r) => getWorkerById(r.workerId).then((w) => (w ? { nameEn: w.nameEn, nameAr: w.nameAr, slug: w.slug, hue: w.hue } : null)))
  );
  const recRows: CustomerRecurringRow[] = recurrings.map((recurring, i) => ({ recurring, worker: recWorkers[i] ?? null }));

  // Multi-candidate quotes — the customer's quote jobs, with every invited
  // worker's display data resolved server-side for the card rows. The
  // customerId branch covers a signed-in customer who skips the OPTIONAL
  // email on the quote form — their session id still finds their jobs.
  const quoteRequests = await getCustomerQuoteRequests(
    email ? { email, customerId: session?.id } : phoneParam ? { phone: phoneParam } : {}
  );
  const quoteRows: CustomerQuoteRow[] = await Promise.all(
    quoteRequests.map(async (q) => {
      const ids = [...new Set(q.bookings.map((b) => b.workerId))];
      const resolved = await Promise.all(ids.map(async (id) => [id, await getWorkerById(id)] as const));
      const workers: Record<string, QuoteWorker | undefined> = {};
      for (const [id, w] of resolved) {
        workers[id] = w ? { nameEn: w.nameEn, nameAr: w.nameAr, slug: w.slug, hue: w.hue } : undefined;
      }
      return { quoteRequest: q, workers };
    })
  );

  // Hydration safety (useSsrSafeNow): the client rows' "expires in N hours"
  // lines derive from Date.now(), so the server passes its own render-time
  // clock down as nowSeed — the client renders from it until mount, making the
  // SSR markup and the first client render identical.
  const nowSeed = Date.now();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
        {t("booking.myBookings")}
      </h1>
      <p className="mt-2 text-ink-500 dark:text-ink-400">{t("booking.myBookingsSubtitle")}</p>

      <BookingsClient rows={rows} recurringRows={recRows} quoteRows={quoteRows} signedIn={Boolean(session)} lookedUp={lookedUp} nowSeed={nowSeed} />
    </div>
  );
}
