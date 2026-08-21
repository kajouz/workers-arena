import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import {
  getAllWorkers,
  getVerificationQueue,
  getPendingPayouts,
  getPendingManualPayments,
  getAnalyticsOverview,
} from "@/lib/data/repo";

export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const [workers, verificationQueue, pendingPayouts, pendingManualPayments, analytics] =
    await Promise.all([
      getAllWorkers(),
      getVerificationQueue(),
      getPendingPayouts(),
      getPendingManualPayments(),
      getAnalyticsOverview(),
    ]);
  const pendingVerifications = verificationQueue.length;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Workers registered today
  const newWorkersToday = workers.filter((w: { joinedYear: number }) => {
    const joined = new Date(w.joinedYear, 0, 1);
    return joined >= todayStart;
  }).length;

  // Active workers (verified + active subscription)
  const activeWorkers = workers.filter(
    (w: { verified: boolean; subscription: { status: string } }) => w.verified && w.subscription.status === "active"
  ).length;

  // Pending actions count
  const pendingActions = pendingVerifications + pendingPayouts.length + pendingManualPayments.length;

  // Estimated revenue today (from analytics)
  const estimatedRevenueToday = analytics.dailyRevenue;

  const metrics = {
    timestamp: new Date().toISOString(),
    responseMs: Date.now() - startTime,
    activeUsers: Math.floor(Math.random() * 20) + 5, // Placeholder - would come from WebSocket
    activeBookings: Math.floor(Math.random() * 8) + 2, // Placeholder
    todaySummary: {
      newWorkers: newWorkersToday,
      pendingVerifications,
      pendingPayouts: pendingPayouts.length,
      pendingManualPayments: pendingManualPayments.length,
      pendingActions,
      estimatedRevenue: estimatedRevenueToday,
    },
    platformHealth: {
      totalWorkers: workers.length,
      activeWorkers,
      inactiveWorkers: workers.length - activeWorkers,
      verifiedWorkers: workers.filter((w) => w.verified).length,
    },      recentActivity: (analytics.activities ?? []).slice(0, 5),
  };

  return NextResponse.json(metrics);
}
