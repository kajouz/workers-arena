import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, DollarSign, TrendingUp, CreditCard, Building2, Wallet, Download } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import {
  getAllWorkers,
  getCampaigns,
  getPendingManualPayments,
  getPlatformFeeStats,
} from "@/lib/data/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCompact, formatDate } from "@/lib/utils";

export const metadata = { title: "Revenue Dashboard" };

export default async function RevenueDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { locale } = await getI18n();

  const [workers, campaigns, manualPayments, feeStats] = await Promise.all([
    getAllWorkers(),
    getCampaigns(),
    getPendingManualPayments(),
    getPlatformFeeStats(90),
  ]);

  // Calculate revenue breakdown
  const subscriptionRevenue = workers.reduce((sum, w) => {
    if (w.subscription.status === "active") {
      return sum + (w.subscription.price || 0);
    }
    return sum;
  }, 0);

  const campaignRevenue = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);

  // Manual payments (OMT/Whish)
  const manualPaymentsTotal = manualPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Platform fees
  const platformFees = feeStats.netMinor / 100;

  // Total revenue
  const totalRevenue = subscriptionRevenue + campaignRevenue + platformFees;

  // Monthly breakdown (simulated for demo)
  const monthlyData = [
    { month: "Jan", subscriptions: 12500, campaigns: 3200, fees: 1800 },
    { month: "Feb", subscriptions: 14200, campaigns: 4100, fees: 2100 },
    { month: "Mar", subscriptions: 15800, campaigns: 5600, fees: 2400 },
    { month: "Apr", subscriptions: 16400, campaigns: 4800, fees: 2200 },
    { month: "May", subscriptions: 18200, campaigns: 6200, fees: 2800 },
    { month: "Jun", subscriptions: 19500, campaigns: 7100, fees: 3100 },
  ];

  const lastMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const monthlyGrowth = ((lastMonth.subscriptions + lastMonth.campaigns + lastMonth.fees) /
    (prevMonth.subscriptions + prevMonth.campaigns + prevMonth.fees) - 1) * 100;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> Back to Dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            <DollarSign className="size-6 text-brand-500" /> Revenue Dashboard
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Track revenue by source, view trends, and export financial data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Total Revenue</p>
                <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  ${formatCompact(totalRevenue)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <DollarSign className="size-5 text-emerald-500" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <TrendingUp className="size-3 text-emerald-500" />
              <span className="text-emerald-600">+{monthlyGrowth.toFixed(1)}%</span>
              <span className="text-ink-400">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Subscriptions</p>
                <p className="mt-1 text-2xl font-black text-blue-600 dark:text-blue-400">
                  ${formatCompact(subscriptionRevenue)}
                </p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-2">
                <CreditCard className="size-5 text-blue-500" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {workers.filter((w) => w.subscription.status === "active").length} active subscribers
            </p>
          </CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-violet-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400">Campaign Revenue</p>
                <p className="mt-1 text-2xl font-black text-violet-600 dark:text-violet-400">
                  ${formatCompact(campaignRevenue)}
                </p>
              </div>
              <div className="rounded-lg bg-violet-500/10 p-2">
                <Building2 className="size-5 text-violet-500" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {campaigns.length} total campaigns
            </p>
          </CardContent>
        </Card>

        <Card className="border-brand-500/20 bg-brand-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-brand-600 dark:text-brand-400">Platform Fees</p>
                <p className="mt-1 text-2xl font-black text-brand-600 dark:text-brand-400">
                  ${formatCompact(platformFees)}
                </p>
              </div>
              <div className="rounded-lg bg-brand-500/10 p-2">
                <Wallet className="size-5 text-brand-500" />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {feeStats.count} bookings processed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Source */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Subscriptions", value: subscriptionRevenue, color: "bg-blue-500", percentage: (subscriptionRevenue / totalRevenue) * 100 },
                { label: "Campaigns", value: campaignRevenue, color: "bg-violet-500", percentage: (campaignRevenue / totalRevenue) * 100 },
                { label: "Platform Fees", value: platformFees, color: "bg-brand-500", percentage: (platformFees / totalRevenue) * 100 },
              ].map((source) => (
                <div key={source.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-600 dark:text-ink-300">{source.label}</span>
                    <span className="text-sm font-bold text-ink-900 dark:text-ink-50">${formatCompact(source.value)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className={`h-full rounded-full ${source.color}`}
                      style={{ width: `${source.percentage}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{source.percentage.toFixed(1)}% of total</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthlyData.map((month) => {
                const total = month.subscriptions + month.campaigns + month.fees;
                return (
                  <div key={month.month} className="flex items-center gap-3">
                    <span className="w-10 text-xs font-medium text-ink-500">{month.month}</span>
                    <div className="flex-1">
                      <div className="flex h-4 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                        <div
                          className="bg-blue-500"
                          style={{ width: `${(month.subscriptions / total) * 100}%` }}
                        />
                        <div
                          className="bg-violet-500"
                          style={{ width: `${(month.campaigns / total) * 100}%` }}
                        />
                        <div
                          className="bg-brand-500"
                          style={{ width: `${(month.fees / total) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-20 text-right text-xs font-bold text-ink-900 dark:text-ink-50">
                      ${formatCompact(total)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-blue-500" />
                Subscriptions
              </div>
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-violet-500" />
                Campaigns
              </div>
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-brand-500" />
                Fees
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refund Tracking */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refund Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Gross Revenue</p>
                <p className="mt-1 text-2xl font-black text-ink-900 dark:text-ink-50">
                  ${formatCompact(feeStats.grossMinor / 100)}
                </p>
              </div>
              <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Refunded</p>
                <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
                  ${formatCompact(feeStats.refundedMinor / 100)}
                </p>
              </div>
              <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Net Revenue</p>
                <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  ${formatCompact(feeStats.netMinor / 100)}
                </p>
              </div>
            </div>
            <div className="mt-4 text-center text-xs text-ink-400">
              Refund rate: {feeStats.grossMinor > 0 ? ((feeStats.refundedMinor / feeStats.grossMinor) * 100).toFixed(1) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Manual Payments */}
      {manualPayments.length > 0 && (
        <div className="mt-8">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4 text-amber-500" />
                Pending Manual Payments (OMT/Whish)
              </CardTitle>
              <Badge className="bg-amber-500/10 text-amber-600">{manualPayments.length}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {manualPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
                  >
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        {locale === "ar" ? payment.labelAr : payment.labelEn}
                      </p>
                      <p className="text-xs text-ink-400">
                        {payment.method?.toUpperCase()} · {payment.reference || "No reference"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        ${formatCompact(payment.amount / 100)}
                      </p>
                      <p className="text-xs text-ink-400">{formatDate(payment.createdAt, locale)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
