import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerBookings } from "@/lib/data/repo";
import { getWorkerLeadRebates } from "@/lib/data/lead-rebate";
import { computeEarningsStatement, type EarningsMonth } from "@/lib/data/worker-earnings";
import { EarningsStatementView } from "@/components/dashboard/earnings-statement";
import { roiMonthWindow, roiMonthKeyOf } from "@/lib/data/worker-roi";

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
  if (!session) redirect("/auth/login");
  if (session.role !== "worker") redirect("/dashboard");

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) redirect("/dashboard");

  const params = await searchParams;
  const now = new Date();
  const monthKey = params.month ?? roiMonthKeyOf(now);
  const month = monthFromKey(monthKey);

  const [bookings, rebates] = await Promise.all([
    getWorkerBookings(worker.id),
    getWorkerLeadRebates(worker.id, 200),
  ]);

  const statement = computeEarningsStatement({
    bookings,
    rebates,
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
