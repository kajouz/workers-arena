import { Link } from "@/components/i18n/link";
import { ArrowLeft, DollarSign, TrendingUp, CreditCard, Building2, Wallet, Download } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import {
  getAllWorkers,
  getCampaigns,
  getPendingManualPayments,
  getPlatformFeeStats,
  getWeeklyNumbers,
} from "@/lib/data/repo";
import { pct, REVENUE_SCOPES } from "@/lib/data/weekly-numbers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCompact, formatDate } from "@/lib/utils";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Revenue Dashboard" };

export default async function RevenueDashboardPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");

  const { locale } = await getI18n();

  const [workers, campaigns, manualPayments, feeStats, sheet] = await Promise.all([
    getAllWorkers(),
    getCampaigns(),
    getPendingManualPayments(),
    getPlatformFeeStats(90),
    getWeeklyNumbers(8),
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

  // Weekly trend from confirmed payments and collected commission (oldest
  // first for the bars). Worker purchases = every non-campaign revenue scope.
  const weeklyTrend = [...sheet.weeks].reverse().map((w) => {
    const campaigns = w.revenueMinor.campaign / 100;
    const fees = w.commissionCollectedMinor / 100;
    const purchases = w.totalRevenueMinor / 100 - campaigns - fees;
    return { week: w, purchases, campaigns, fees, total: purchases + campaigns + fees };
  });

  // Growth = the last FULL week against the one before (the current week is
  // still running, so comparing it would always read as a drop).
  const lastFullWeek = sheet.weeks[1];
  const weekBefore = sheet.weeks[2];
  const weeklyGrowth =
    lastFullWeek && weekBefore && weekBefore.totalRevenueMinor > 0
      ? (lastFullWeek.totalRevenueMinor / weekBefore.totalRevenueMinor - 1) * 100
      : null;
  const showPct = (v: number | null) => (v === null ? "—" : `${v}%`);

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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/api/admin/revenue/weekly?format=csv&weeks=12"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <Download className="size-4" />
            Weekly numbers CSV
          </Link>
          <Link
            href="/api/admin/revenue/reconciliation?format=csv"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <Download className="size-4" />
            Manual reconciliation CSV
          </Link>
          <Link
            href="/api/admin/retention?format=csv"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <Download className="size-4" />
            Retention CSV
          </Link>
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
              {weeklyGrowth === null ? (
                <span className="text-ink-400">No revenue the week before to compare</span>
              ) : (
                <>
                  <span className={weeklyGrowth >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {weeklyGrowth >= 0 ? "+" : ""}
                    {weeklyGrowth.toFixed(1)}%
                  </span>
                  <span className="text-ink-400">last full week vs the week before</span>
                </>
              )}
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

        {/* Weekly Trend — confirmed money only */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Revenue (confirmed)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {weeklyTrend.map(({ week, purchases, campaigns, fees, total }) => {
                const peak = Math.max(...weeklyTrend.map((t) => t.total), 1);
                return (
                  <div key={week.weekStart} className="flex items-center gap-3">
                    <span className="w-20 text-xs font-medium text-ink-500">
                      {formatDate(week.weekStart, locale)}
                      {week.partial ? "*" : ""}
                    </span>
                    <div className="flex-1">
                      <div
                        className="flex h-4 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"
                        style={{ width: `${Math.max((total / peak) * 100, 0)}%` }}
                      >
                        {total > 0 && (
                          <>
                            <div className="bg-blue-500" style={{ width: `${(Math.max(purchases, 0) / total) * 100}%` }} />
                            <div className="bg-violet-500" style={{ width: `${(Math.max(campaigns, 0) / total) * 100}%` }} />
                            <div className="bg-brand-500" style={{ width: `${(Math.max(fees, 0) / total) * 100}%` }} />
                          </>
                        )}
                      </div>
                    </div>
                    <span className="w-20 text-end text-xs font-bold text-ink-900 dark:text-ink-50">
                      ${formatCompact(total)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink-400">* current week, still running. Weeks start Monday (UTC).</p>
            <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-blue-500" />
                Worker purchases
              </div>
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-violet-500" />
                Campaigns
              </div>
              <div className="flex items-center gap-1">
                <div className="size-2 rounded-full bg-brand-500" />
                Commission collected
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly numbers sheet — the revenue plan's Step 1 scoreboard */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Numbers</CardTitle>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {sheet.activePlans} workers on an active plan (trials included) · {sheet.pendingPayments} manual
              payments waiting, {sheet.pendingOverTarget} of them for more than 2 hours
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-start text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                    <th className="py-2 pe-3 text-start font-semibold">Week of</th>
                    <th className="py-2 pe-3 text-end font-semibold">Revenue</th>
                    <th className="py-2 pe-3 text-end font-semibold">Commission recorded</th>
                    <th className="py-2 pe-3 text-end font-semibold">Collected</th>
                    <th className="py-2 pe-3 text-end font-semibold">Jobs done</th>
                    <th className="py-2 pe-3 text-end font-semibold">Paid in cash</th>
                    <th className="py-2 pe-3 text-end font-semibold">Confirmed ≤ 2h</th>
                    <th className="py-2 pe-3 text-end font-semibold">Median wait</th>
                    <th className="py-2 pe-3 text-end font-semibold">Renewals / lapses</th>
                    <th className="py-2 pe-3 text-end font-semibold">New trials</th>
                    <th className="py-2 text-end font-semibold">Customer requests</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.weeks.map((w) => (
                    <tr key={w.weekStart} className="border-b border-ink-100 last:border-0 dark:border-ink-800/60">
                      <td className="py-2 pe-3 font-medium text-ink-700 dark:text-ink-200">
                        {formatDate(w.weekStart, locale)}
                        {w.partial && <span className="ms-1 text-xs text-ink-400">(so far)</span>}
                      </td>
                      <td
                        className="py-2 pe-3 text-end font-bold text-ink-900 dark:text-ink-50"
                        title={REVENUE_SCOPES.map((s) => `${s}: ${formatPrice(w.revenueMinor[s] / 100)}`).join(" · ")}
                      >
                        {formatPrice(w.totalRevenueMinor / 100)}
                      </td>
                      <td className="py-2 pe-3 text-end">{formatPrice(w.commissionRecordedMinor / 100)}</td>
                      <td className="py-2 pe-3 text-end">{showPct(pct(w.commissionCollectedMinor, w.commissionRecordedMinor))}</td>
                      <td className="py-2 pe-3 text-end">{w.jobsCompleted}</td>
                      <td className="py-2 pe-3 text-end">{showPct(pct(w.jobsPaidOutside, w.jobsCompleted))}</td>
                      <td className="py-2 pe-3 text-end">{showPct(pct(w.confirmedWithinTarget, w.paymentsConfirmed))}</td>
                      <td className="py-2 pe-3 text-end">
                        {w.medianConfirmHours === null ? "—" : `${w.medianConfirmHours.toFixed(1)}h`}
                      </td>
                      <td className="py-2 pe-3 text-end">
                        {w.renewals} / {w.lapses}
                      </td>
                      <td className="py-2 pe-3 text-end">{w.trialsStarted}</td>
                      <td className="py-2 text-end">{w.customerRequests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Revenue = confirmed worker and company purchases, net of refunds, plus commission collected. Commission is
              counted in the week the job finished; &ldquo;Collected&rdquo; is how much of it has been collected so far.
              Hover a revenue figure for the split by stream.
            </p>
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
                    <div className="text-end">
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
