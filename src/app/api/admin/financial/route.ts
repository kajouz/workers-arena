import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllWorkers, getAllBookings, getPlatformFeeStats, getCampaigns } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * Financial Analysis API — computes 10 core KPIs from the full booking and
 * worker population. All numbers are derived from the same in-memory store
 * (demo) or Prisma (real) that powers the rest of the admin dashboard, so
 * there's no secondary data source that could drift.
 *
 * KPIs:
 * 1. Customer Acquisition Cost (CAC)
 * 2. Worker Acquisition Cost (WAC)
 * 3. Average Job Value (AJV)
 * 4. Platform Commission
 * 5. Customer Repeat-Booking Rate
 * 6. Quote-to-Booking Conversion Rate
 * 7. Cancellation Rate
 * 8. Refund & Dispute Rate
 * 9. Customer Support Cost per Job
 * 10. Contribution Margin per Completed Job
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [workers, bookings, feeStats, campaigns] = await Promise.all([
    getAllWorkers(),
    getAllBookings(),
    getPlatformFeeStats(365),
    getCampaigns(),
  ]);

  // ─── Derived Data ────────────────────────────────────────────────

  const totalBookings = bookings.length;
  const completedBookings = bookings.filter((b) => b.status === "completed");
  const cancelledBookings = bookings.filter((b) => b.status === "cancelled");
  const declinedBookings = bookings.filter((b) => b.status === "declined");
  const refundedBookings = bookings.filter((b) => b.status === "refunded");

  // Unique customers (by phone as fallback, customerId as primary)
  const uniqueCustomerIds = new Set<string>();
  const customerBookingCounts = new Map<string, number>();
  for (const b of bookings) {
    const key = b.customerId || b.customerPhone;
    uniqueCustomerIds.add(key);
    customerBookingCounts.set(key, (customerBookingCounts.get(key) || 0) + 1);
  }
  const totalCustomers = uniqueCustomerIds.size;

  // Repeat customers (2+ bookings)
  const repeatCustomers = Array.from(customerBookingCounts.values()).filter((c) => c >= 1).length;
  const repeatBookingCustomers = Array.from(customerBookingCounts.values()).filter((c) => c >= 2).length;

  // ─── KPI 1: Customer Acquisition Cost (CAC) ──────────────────────
  // Marketing spend proxy = campaign revenue collected (companies pay to acquire customers)
  const marketingSpend = campaigns.reduce((sum, c) => {
    // Use the campaign's budget as a proxy for platform marketing investment
    return sum + (c.budget || 0);
  }, 0);
  const cac = totalCustomers > 0 ? Math.round(marketingSpend / totalCustomers) : 0;

  // ─── KPI 2: Worker Acquisition Cost (WAC) ────────────────────────
  // Worker onboarding cost proxy = total platform fees / number of workers
  // (platform invests in worker acquisition through reduced fees)
  const totalWorkers = workers.length;
  const activeWorkers = workers.filter((w) => w.subscription.status === "active").length;
  const wac = totalWorkers > 0 ? Math.round(feeStats.netMinor / totalWorkers) : 0;

  // ─── KPI 3: Average Job Value (AJV) ──────────────────────────────
  const totalJobValue = completedBookings.reduce((sum, b) => sum + (b.quote || 0), 0);
  const avgJobValue = completedBookings.length > 0 ? Math.round(totalJobValue / completedBookings.length) : 0;

  // ─── KPI 4: Platform Commission ──────────────────────────────────
  const totalCommission = feeStats.grossMinor;
  const netCommission = feeStats.netMinor;
  const commissionRate = totalJobValue > 0 ? Math.round((totalCommission / totalJobValue) * 100 * 100) / 100 : 0;

  // ─── KPI 5: Customer Repeat-Booking Rate ──────────────────────────
  const repeatBookingRate = totalCustomers > 0 ? Math.round((repeatBookingCustomers / totalCustomers) * 100 * 100) / 100 : 0;

  // ─── KPI 6: Quote-to-Booking Conversion Rate ─────────────────────
  const requestedBookings = bookings.filter((b) => b.status === "requested").length;
  const convertedBookings = completedBookings.length + bookings.filter((b) =>
    ["confirmed", "inProgress", "completionPending"].includes(b.status)
  ).length;
  const quoteToBookingRate = requestedBookings > 0 ? Math.round((convertedBookings / (requestedBookings + convertedBookings)) * 100 * 100) / 100 : 0;

  // ─── KPI 7: Cancellation Rate ────────────────────────────────────
  const cancellationRate = totalBookings > 0 ? Math.round((cancelledBookings.length / totalBookings) * 100 * 100) / 100 : 0;

  // ─── KPI 8: Refund & Dispute Rate ────────────────────────────────
  const refundDisputeRate = totalBookings > 0 ? Math.round(((refundedBookings.length + declinedBookings.length) / totalBookings) * 100 * 100) / 100 : 0;

  // ─── KPI 9: Customer Support Cost per Job ────────────────────────
  // Support cost proxy = platform fees * overhead ratio (20% of commission)
  const supportCostTotal = Math.round(totalCommission * 0.20);
  const supportCostPerJob = completedBookings.length > 0 ? Math.round(supportCostTotal / completedBookings.length) : 0;

  // ─── KPI 10: Contribution Margin per Completed Job ───────────────
  // = Platform revenue − payment costs − support costs − refunds − variable marketing
  const paymentCosts = Math.round(totalCommission * 0.029 + totalBookings * 30); // Stripe ~2.9% + $0.30
  const refundCosts = feeStats.refundedMinor;
  const variableMarketing = Math.round(marketingSpend * 0.3); // 30% of marketing is variable
  const contributionMargin = completedBookings.length > 0
    ? Math.round((totalCommission - paymentCosts - supportCostTotal - refundCosts - variableMarketing) / completedBookings.length)
    : 0;

  // ─── Trend Data (monthly) ────────────────────────────────────────
  const monthlyData = new Map<string, { revenue: number; bookings: number; refunds: number }>();
  for (const b of bookings) {
    const d = new Date(b.events?.[0]?.time || Date.now());
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyData.has(key)) monthlyData.set(key, { revenue: 0, bookings: 0, refunds: 0 });
    const m = monthlyData.get(key)!;
    m.bookings += 1;
    m.revenue += b.platformFee || 0;
    if (b.status === "refunded") m.refunds += b.platformFee || 0;
  }

  const monthlyTrend = Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, data]) => ({
      month,
      revenue: data.revenue,
      bookings: data.bookings,
      refunds: data.refunds,
      contributionMargin: Math.round(
        (data.revenue - data.revenue * 0.029 - data.revenue * 0.20 - data.refunds - data.revenue * 0.30 * 0.30) /
        Math.max(data.bookings, 1)
      ),
    }));

  // ─── Response ────────────────────────────────────────────────────
  return NextResponse.json({
    kpis: {
      customerAcquisitionCost: { value: cac, label: "Customer Acquisition Cost", format: "currency" },
      workerAcquisitionCost: { value: wac, label: "Worker Acquisition Cost", format: "currency" },
      averageJobValue: { value: avgJobValue, label: "Average Job Value", format: "currency" },
      platformCommission: { value: totalCommission, net: netCommission, rate: commissionRate, label: "Platform Commission", format: "currency" },
      repeatBookingRate: { value: repeatBookingRate, label: "Repeat-Booking Rate", format: "percentage" },
      quoteToBookingRate: { value: quoteToBookingRate, label: "Quote-to-Booking Conversion", format: "percentage" },
      cancellationRate: { value: cancellationRate, label: "Cancellation Rate", format: "percentage" },
      refundDisputeRate: { value: refundDisputeRate, label: "Refund & Dispute Rate", format: "percentage" },
      supportCostPerJob: { value: supportCostPerJob, label: "Support Cost per Job", format: "currency" },
      contributionMargin: { value: contributionMargin, label: "Contribution Margin per Job", format: "currency" },
    },
    summary: {
      totalBookings,
      completedBookings: completedBookings.length,
      cancelledBookings: cancelledBookings.length,
      declinedBookings: declinedBookings.length,
      refundedBookings: refundedBookings.length,
      totalCustomers,
      repeatBookingCustomers,
      totalWorkers,
      activeWorkers,
      totalJobValue,
      totalCommission,
      netCommission,
    },
    monthlyTrend,
    contributionBreakdown: {
      platformRevenue: totalCommission,
      paymentCosts,
      supportCosts: supportCostTotal,
      refunds: refundCosts,
      variableMarketing,
      net: totalCommission - paymentCosts - supportCostTotal - refundCosts - variableMarketing,
    },
  });
}
