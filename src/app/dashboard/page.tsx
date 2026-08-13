import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import {
  getAnalyticsOverview,
  getWorkerBySlug,
  getWorkers,
  getInvoices,
  getWorkerBookings,
  getWorkerRecurrings,
  getWorkerSlots,
  getWorkerBalance,
  getWorkerPayouts,
} from "@/lib/data/repo";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";

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

  return (
    <WorkerDashboard
      session={session}
      analytics={analytics}
      worker={demoWorker}
      invoices={subInvoices}
      bookings={bookings}
      recurrings={recurrings}
      slots={slots}
      balance={balance}
      payouts={payouts}
    />
  );
}
