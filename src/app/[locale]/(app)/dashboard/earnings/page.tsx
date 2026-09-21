import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerBookings, getWorkerPayouts } from "@/lib/data/repo";
import { getWorkerLeadRebates } from "@/lib/data/lead-rebate";
import { computeEarningsStatement, type EarningsMonth } from "@/lib/data/worker-earnings";
import { EarningsStatementView } from "@/components/dashboard/earnings-statement";
import { roiMonthWindow, roiMonthKeyOf } from "@/lib/data/worker-roi";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Earnings Statement" };

function monthFromKey(key: string): EarningsMonth {
  const window = roiMonthWindow(key);
  if (!window) {
    // Fallback to current month
    const now = new Date();
    return {
      key: roiMonthKeyOf(now),
      startIso: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      endIso: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    };
  }
  return window;
}

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "worker") return await localeRedirect("/dashboard");

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) return await localeRedirect("/dashboard");

  const params = await searchParams;
  const now = new Date();
  const monthKey = params.month ?? roiMonthKeyOf(now);
  const month = monthFromKey(monthKey);

  const [bookings, rebates, payouts] = await Promise.all([
    getWorkerBookings(worker.id),
    getWorkerLeadRebates(worker.id, 200),
    getWorkerPayouts(worker.id),
  ]);

  const statement = computeEarningsStatement({
    bookings,
    rebates,
    payouts,
    month,
  });

  return (
    <EarningsStatementView
      statement={statement}
      currentMonthKey={monthKey}
      workerName={worker.nameEn}
    />
  );
}
