import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import {
  getAnalyticsOverview,
  getWorkerBySlug,
  getWorkers,
  getInvoices,
  getWorkerBookings,
  getBookingMessages,
  getWorkerRecurrings,
  getWorkerSlots,
  getWorkerBalance,
  getWorkerPayouts,
} from "@/lib/data/repo";
import type { BookingMessage, Notification } from "@/lib/data/types";
import { workerEmailPreviewFor } from "@/lib/data/booking-notifications";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";

/** The worker-facing email a booking's state implies, rendered in BOTH locales
 * (workerEmailPreviewFor — the mirror of the customer rows' preview). */
export type WorkerEmailPreview = {
  type: Notification["type"];
  subjectEn: string;
  subjectAr: string;
  htmlEn: string;
  htmlAr: string;
} | null;

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role === "admin") redirect("/admin");
  if (session.role === "company") redirect("/company");

  const [analytics, worker, all, invoices] = await Promise.all([
    getAnalyticsOverview(),
    session.role === "worker" ? getWorkerBySlug("khaled-al-harbi-plumbing") : Promise.resolve(null),
    getWorkers({}),
    getInvoices(),
  ]);

  const demoWorker = worker ?? all.items[0];
  // Worker-facing invoices: subscription renewals only (advertising invoices
  // belong to the company dashboard).
  const subInvoices = invoices.filter((i) => i.scope === "subscription");
  const bookings = await getWorkerBookings(demoWorker.id);
  // §2.3 chat — each booking's negotiation thread, resolved server-side so the
  // rows render the SAME messages the customer + admin surfaces read.
  const messagesByBooking: Record<string, BookingMessage[]> = {};
  for (const b of bookings) messagesByBooking[b.id] = await getBookingMessages(b.id);
  // M1 recurring contracts (§7 #1) — accept/decline once, cadence auto-books.
  const recurrings = await getWorkerRecurrings(demoWorker.id);
  // Next-7-days slot window for the availability editor (M2). The slot read
  // is `startAt <= to`, so `to` must be the END of the 7th day — a bare
  // today+6d midnight would drop the last day's slots entirely (its open
  // template rendered as "closed").
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  const slots = await getWorkerSlots(demoWorker.id, { from: from.toISOString(), to: to.toISOString() });
  // Payouts (docs/payouts.md) — spendable balance + withdrawal history.
  const [balance, payouts] = await Promise.all([
    getWorkerBalance(demoWorker.id),
    getWorkerPayouts(demoWorker.id),
  ]);
  // "Preview email" — each worker row carries the bilingual render of the
  // email the WORKER received for that booking (the mirror of the customer
  // rows' preview; workerEmailKind decides which worker-facing email the
  // state implies — e.g. worker-completion-confirmed on a customer-confirmed
  // completion, null on the system auto-confirm which emails the customer).
  const previewsByBooking: Record<string, WorkerEmailPreview> = {};
  for (const b of bookings) previewsByBooking[b.id] = workerEmailPreviewFor(b, demoWorker);

  // Hydration safety (useSsrSafeNow): the booking rows' SLA countdown derives
  // from Date.now(), so the server passes its own render-time clock down as
  // nowSeed — the client renders from it until mount, making the SSR markup
  // and the first client render identical.
  const nowSeed = Date.now();

  return (
    <WorkerDashboard
      session={session}
      analytics={analytics}
      worker={demoWorker}
      invoices={subInvoices}
      bookings={bookings}
      messagesByBooking={messagesByBooking}
      previewsByBooking={previewsByBooking}
      recurrings={recurrings}
      slots={slots}
      balance={balance}
      payouts={payouts}
      nowSeed={nowSeed}
    />
  );
}
