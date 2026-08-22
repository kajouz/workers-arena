"use client";

import { motion } from "framer-motion";
import {
  Users,
  UserCheck,
  UserX,
  AlarmClock,
  Wallet,
  Building2,
  Megaphone,
  Eye,
  Bell,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  CalendarDays,
  Loader2,
  DollarSign,
  FileText,
  Mail,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import type { SessionUser } from "@/lib/auth-demo";
import type { AnalyticsOverview, Campaign, CampaignPayment, LedgerEntry, PendingManualPayment, PlatformFeeStats, Worker } from "@/lib/data/types";
import { ManualPaymentsCard } from "@/components/admin/manual-payments-card";
import { StatCard } from "./stat-card";
import { WorkerManagementTable } from "./worker-management-table";
import { AreaChart, BarList, Donut } from "./charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoHeatmap } from "./geo-heatmap";
import { AcquisitionFunnel } from "./acquisition-funnel";
import { BehaviorAnalytics } from "./behavior-analytics";
import { RetentionCohorts } from "./retention-cohorts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GradientAvatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { getMonthLabel } from "@/lib/data/analytics";
import { ActivityTypeChips, type ActivityTypeFilterValue } from "./activity-type-chips";
import { EmailPreviewDialog } from "@/components/admin/email-preview-dialog";
import { RefundDialog } from "./refund-dialog";
import { BookingTrailsExportButton } from "./booking-trails-export-button";
import type { BookingStatus } from "@/lib/data/types";
import { formatCompact, formatDate, formatNumber, formatPrice } from "@/lib/utils";
import { decideVerificationAction } from "@/app/actions/business";
import { decidePayoutAction } from "@/app/actions/payouts";

/**
 * Verification workflow codes — kept in sync with ACTION_CODES in
 * src/lib/data/activity.ts (inlined here because that module imports node:fs
 * and must never reach a client bundle).
 */
const CODE_REQUEST = "VERIFICATION_REQUEST_SUBMITTED";
const CODE_VERIFIED = "WORKER_VERIFIED";
const CODE_DECLINED = "VERIFICATION_DECLINED";
const CODE_BOOKING_REQUESTED = "BOOKING_REQUESTED";
const CODE_BOOKING_CONFIRMED = "BOOKING_CONFIRMED";
const CODE_BOOKING_CANCELLED = "BOOKING_CANCELLED";
const CODE_PLAN_CHANGED = "ADMIN_PLAN_CHANGED";

/** Campaign payment status badge colors (the /admin campaign-payments card). */
const PAYMENT_STATUS_STYLE: Record<CampaignPayment["status"], string> = {
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  refunded: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  cancelled: "bg-ink-500/10 text-ink-500 dark:text-ink-400",
  failed: "bg-red-500/10 text-red-700 dark:text-red-400",
};

/**
 * Admin decision on a PENDING worker payout (docs/payouts.md §5): Approve
 * settles the withdrawal (it becomes a debit — the worker's balance drops),
 * Reject voids it (nothing moves). Either way the row is decided exactly once
 * (the adapter's CAS on status=PENDING).
 */
function PayoutDecision({ payoutId }: { payoutId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    const res = await decidePayoutAction(payoutId, approve);
    setBusy(false);
    toast("success", approve ? t("admin.payoutsApproved") : t("admin.payoutsRejected"));
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => decide(true)} disabled={busy}>
        {t("admin.payoutsApprove")}
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-600 dark:text-red-400" onClick={() => decide(false)} disabled={busy}>
        {t("admin.payoutsReject")}
      </Button>
    </div>
  );
}

/**
 * Booking funnel — canonical status display order (rescheduled is an
 * audit-event-only status, never a booking's CURRENT status, so it's left
 * out of the card) + a solid dot/bar color per status, mirroring the
 * BookingStatusBadge palette. Presentation-only — the funnel data carries no
 * colors, so these live here (module scope: static, no props).
 */
const FUNNEL_STATUS_ORDER = [
  "requested",
  "pendingPayment",
  "confirmed",
  "inProgress",
  "completionPending",
  "completed",
  "cancelled",
  "declined",
  "noShow",
] as const satisfies readonly BookingStatus[];

const FUNNEL_STATUS_COLOR: Record<BookingStatus, string> = {
  requested: "#f59e0b",
  quoting: "#06b6d4", // multi-candidate quote invites — counted, not converted
  quoted: "#0891b2", // multi-candidate quote bids — counted, not converted
  pendingPayment: "#8b5cf6",
  confirmed: "#10b981",
  inProgress: "#0ea5e9",
  completionPending: "#a78bfa",
  completed: "#94a3b8",
  cancelled: "#ef4444",
  declined: "#f43f5e",
  noShow: "#dc2626",
  rescheduled: "#38bdf8", // unused in the card (audit-only) — kept for the Record type
  message: "#0ea5e9", // unused in the card (audit-only) — kept for the Record type
  refunded: "#f59e0b", // unused in the card (audit-only) — kept for the Record type
};

/**
 * Approve/Reject controls for a queue row. Calls the server action directly
 * (so the outcome is known), then toasts + refreshes — the same feedback
 * pattern as the worker-side resubmit (verification-banner.tsx).
 */
function DecisionButtons({ worker }: { worker: Worker }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("workerSlug", worker.slug);
      fd.set("approve", approve ? "1" : "0");
      await decideVerificationAction(fd);
      toast("success", t(approve ? "verification.decidedApproved" : "verification.decidedRejected"));
    } catch {
      toast("error", t("verification.decidedError"));
    } finally {
      // Always re-enable and refresh, even if the action rejected mid-way.
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <div className="flex shrink-0 gap-1.5">
      <Button size="sm" variant="default" onClick={() => void decide(true)} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("verification.approve")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => void decide(false)} disabled={busy}>
        {t("verification.reject")}
      </Button>
    </div>
  );
}

export function AdminDashboard({
  session,
  analytics: a,
  campaigns,
  campaignPayments,
  campaignEmailPreviews,
  verificationQueue,
  platformFeeStats,
  pendingPayouts,
  pendingManualPayments,
  workers,
  workerManagementInit,
}: {
  session: SessionUser;
  analytics: AnalyticsOverview;
  /** Every worker with plans — the worker-management audit (fee-waived filter). */
  workers: Worker[];
  /** URL-persisted audit state (wm / sort / feeWaived) — initial values only. */
  workerManagementInit?: {
    query: string;
    sort: "name" | "planAsc" | "planDesc";
    feeWaivedOnly: boolean;
  };
  campaigns: Campaign[];
  campaignPayments: { campaign: Campaign; payment: CampaignPayment }[];
  /**
   * Server-rendered campaign refund emails (refunded purchases only) — keyed
   * by campaign id, so the payments table's Preview button shows exactly what
   * the company received in the admin's UI locale (renderCampaignRefundEmail
   * output for both locales, same pattern as the booking dispute view).
   */
  campaignEmailPreviews: Record<
    string,
    {
      subjectEn: string;
      htmlEn: string;
      subjectAr: string;
      htmlAr: string;
      recipient?: { name: string; email: string };
    }
  >;
  verificationQueue: Worker[];
  /** M5 take-rate revenue over the last 30 days (gross / refunded / net / avg). */
  platformFeeStats: PlatformFeeStats;
  /** Worker withdrawals waiting for review (docs/payouts.md). */
  pendingPayouts: { entry: LedgerEntry; workerName: string }[];
  /** §Lebanon — PENDING OMT/Whish manual payments awaiting the admin's confirm
   * (booking deposits, campaign purchases, paid upgrades). */
  pendingManualPayments: PendingManualPayment[];
}) {
  const { locale, t } = useLocale();
  const revenueLabels = a.revenueSeries.map((p) => getMonthLabel(p.label, locale));
  const monthRevenue = Array.from({ length: 12 }, (_, i) => i).map((i) => {
    const pt = a.revenueSeries.find((p) => p.label === i);
    return pt?.value ?? 0;
  });

  const activities = a.activities;
  const revenueGrowth = 12.4;

  // Campaign purchases (admin payments card) — revenue by campaign (major
  // units for display; the payment rows are minor) + collected/refunded totals.
  const campaignRevenue = [...campaignPayments]
    .map(({ campaign, payment }) => ({
      label: locale === "ar" ? campaign.nameAr : campaign.nameEn,
      value: payment.amount / 100,
    }))
    .sort((x, y) => y.value - x.value);
  const collectedMinor = campaignPayments
    .filter(({ payment }) => payment.status === "paid")
    .reduce((s, { payment }) => s + payment.amount, 0);
  const refundedMinor = campaignPayments
    .filter(({ payment }) => payment.status === "refunded")
    .reduce((s, { payment }) => s + payment.amount, 0);
  // Net collected = gross (paid) minus refunded — the revenue actually kept
  // (equals gross when nothing was refunded, so the badge only shows it then).
  const netMinor = collectedMinor - refundedMinor;

  // Feed quick-filter (client-side — the feed is a bounded in-memory pool) +
  // per-type counts shown on the chips so admins can spot booking lifecycles.
  const [feedType, setFeedType] = useState<ActivityTypeFilterValue>("");
  const feedTypeCounts: Record<string, number> = {};
  for (const act of activities) feedTypeCounts[act.type] = (feedTypeCounts[act.type] ?? 0) + 1;
  const visibleActivities = feedType ? activities.filter((act) => act.type === feedType) : activities;

  /**
   * Dot color per activity — verification entries split by side of the
   * workflow: worker-side requests read as amber, admin decisions as emerald
   * (approved) / red (declined).
   */
  function activityDot(act: (typeof activities)[number]): string {
    if (act.type === "verification") {
      if (act.code === CODE_REQUEST) return "bg-amber-400";
      if (act.code === CODE_VERIFIED) return "bg-emerald-500";
      if (act.code === CODE_DECLINED) return "bg-red-500";
      return "bg-violet-500"; // legacy / uncoded verification rows
    }
    // Booking lifecycle — the same colors as the booking funnel's status
    // buckets, so the feed and the funnel visually tell one story.
    if (act.type === "booking") {
      if (act.code === CODE_BOOKING_REQUESTED) return "bg-amber-400";
      if (act.code === CODE_BOOKING_CONFIRMED) return "bg-emerald-500";
      if (act.code === CODE_BOOKING_CANCELLED) return "bg-red-500";
      return "bg-sky-500"; // legacy / uncoded booking rows
    }
    if (act.type === "payment") return "bg-emerald-500";
    if (act.type === "company") return "bg-sky-500";
    if (act.type === "review") return "bg-amber-500";
    if (act.type === "worker") return "bg-brand-500";
    return "bg-ink-400";
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">{t("admin.title")}</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{t("admin.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1.5">
            <Eye className="size-3" /> {formatCompact(a.visitors)} · {t("admin.visitors")}
          </Badge>
          <Badge variant="danger" className="px-3 py-1.5">
            <Bell className="size-3" /> {a.alerts.reduce((s, x) => s + x.count, 0)}
          </Badge>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/revenue" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400">
          <DollarSign className="size-3" /> Revenue
        </Link>
        <Link href="/admin/invoices" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400">
          <FileText className="size-3" /> Invoices
        </Link>
        <Link href="/admin/customers" className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400">
          <Users className="size-3" /> Customers
        </Link>
        <Link href="/admin/categories" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400">
          <Building2 className="size-3" /> Categories
        </Link>
        <Link href="/admin/communications" className="inline-flex items-center gap-1.5 rounded-lg bg-pink-500/10 px-3 py-1.5 text-xs font-semibold text-pink-600 transition-colors hover:bg-pink-500/20 dark:text-pink-400">
          <Mail className="size-3" /> Communications
        </Link>
        <Link href="/admin/security" className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400">
          <Shield className="size-3" /> Security
        </Link>
        <Link href="/admin/automation" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400">
          <Zap className="size-3" /> Automation
        </Link>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("admin.totalWorkers")} value={a.totalWorkers} icon={<Users className="size-5" />} trend={8.2} color="#f97316" index={0} />
        <StatCard label={t("admin.activeWorkers")} value={a.activeWorkers} icon={<UserCheck className="size-5" />} trend={5.1} color="#10b981" index={1} />
        <StatCard label={t("admin.inactiveWorkers")} value={a.inactiveWorkers} icon={<UserX className="size-5" />} trend={-3.4} color="#64748b" index={2} />
        <StatCard label={t("admin.expiredSubs")} value={a.expiredSubs} icon={<AlarmClock className="size-5" />} trend={-12} color="#ef4444" index={3} />
        <StatCard label={t("admin.revenue")} value={`$${formatCompact(a.revenue)}`} icon={<Wallet className="size-5" />} trend={12.4} spark={monthRevenue} color="#f59e0b" index={4} />
        <StatCard label={t("admin.monthlyRevenue")} value={`$${formatCompact(a.monthlyRevenue)}`} icon={<Wallet className="size-5" />} trend={9.8} color="#f59e0b" index={5} />
        <StatCard label={t("admin.companies")} value={a.companies} icon={<Building2 className="size-5" />} trend={6.5} color="#0ea5e9" index={6} />
        <StatCard label={t("admin.ads")} value={a.activeAds} icon={<Megaphone className="size-5" />} trend={15.2} color="#8b5cf6" index={7} />
      </div>

      {/* Phase 2: Geographic & Behavioral Analytics */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <GeoHeatmap workers={workers} locale={locale} />
        <AcquisitionFunnel
          data={{
            visitors: a.visitors,
            searches: Math.floor(a.visitors * 0.65),
            profileViews: Math.floor(a.visitors * 0.42),
            contacts: Math.floor(a.visitors * 0.12),
            bookings: Math.floor(a.visitors * 0.08),
            completed: Math.floor(a.visitors * 0.05),
          }}
          locale={locale}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <BehaviorAnalytics
          data={{
            sessionDuration: { avg: 185, median: 142, p95: 420 },
            bounceRate: 34.2,
            peakHours: Array.from({ length: 24 }, (_, i) => ({
              hour: i,
              count: Math.floor(Math.random() * 80) + 10,
            })),
            deviceBreakdown: [
              { device: "mobile", percentage: 62.4 },
              { device: "desktop", percentage: 31.8 },
              { device: "tablet", percentage: 5.8 },
            ],
            languageSplit: [
              { language: "Arabic", percentage: 58.2 },
              { language: "English", percentage: 41.8 },
            ],
            searchToContactRatio: 12.4,
            topPages: [
              { path: "/", views: 15420 },
              { path: "/search", views: 8750 },
              { path: "/categories", views: 2890 },
            ],
          }}
          locale={locale}
        />
        <RetentionCohorts
          data={{
            cohorts: [
              { month: "Jan", registered: 45, retained: 38, churned: 7, retentionRate: 84.4 },
              { month: "Feb", registered: 52, retained: 44, churned: 8, retentionRate: 84.6 },
              { month: "Mar", registered: 61, retained: 51, churned: 10, retentionRate: 83.6 },
              { month: "Apr", registered: 58, retained: 48, churned: 10, retentionRate: 82.8 },
              { month: "May", registered: 65, retained: 55, churned: 10, retentionRate: 84.6 },
              { month: "Jun", registered: 70, retained: 60, churned: 10, retentionRate: 85.7 },
            ],
            overallRetention: 84.3,
            churnRate: 4.2,
            avgLifetimeMonths: 8.5,
            ltv: 585,
            planTransitions: [
              { from: "Free", to: "Professional", count: 12, percentage: 18.5 },
              { from: "Professional", to: "Premium", count: 8, percentage: 12.3 },
              { from: "Premium", to: "Enterprise", count: 3, percentage: 4.6 },
              { from: "Enterprise", to: "Premium", count: 2, percentage: 3.1 },
            ],
            atRiskWorkers: workers
              .filter((w) => w.subscription.status === "active")
              .slice(0, 5)
              .map((w) => ({
                id: w.id,
                name: w.nameEn,
                nameAr: w.nameAr,
                plan: w.subscription.plan,
                daysUntilExpiry: Math.floor(Math.random() * 10) + 1,
                lastActivity: "2 days ago",
                hue: w.hue,
              })),
          }}
          locale={locale}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* revenue chart */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="min-w-0 text-base">{t("admin.revenueTitle")}</CardTitle>
            <Badge variant="success">
              <ArrowUpRight className="size-3" /> {revenueGrowth}% {t("admin.vsLastMonth")}
            </Badge>
          </CardHeader>
          <CardContent>
            <AreaChart data={monthRevenue} labels={revenueLabels} color="#f59e0b" />
          </CardContent>
        </Card>

        {/* plans donut */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.plansTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Donut
              items={a.planDistribution.map((p) => ({
                label: locale === "ar" ? p.labelAr : p.labelEn,
                value: p.value,
                hue: p.hue,
              }))}
            />
          </CardContent>
        </Card>

        {/* categories */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.categoriesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={a.categoryCounts.slice(0, 8).map((c) => ({
                label: locale === "ar" ? c.labelAr : c.labelEn,
                value: c.value,
              }))}
              color="#f97316"
            />
          </CardContent>
        </Card>

        {/* search trends */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.trendsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={a.searchTrends.map((s) => ({
                label: locale === "ar" ? s.queryAr : s.queryEn,
                value: s.count,
              }))}
              color="#0ea5e9"
            />
          </CardContent>
        </Card>

        {/* top workers table */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.topWorkers")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-start text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                    <th className="px-6 py-3 text-start font-semibold">{t("common.viewProfile")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("search.category")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("admin.views")}</th>
                    <th className="px-6 py-3 text-end font-semibold">{t("search.rating")}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.topWorkers.map((w, i) => (
                    <motion.tr
                      key={w.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <GradientAvatar name={w.nameEn} hue={w.hue} className="size-9" />
                          <div>
                            <p className="font-bold text-ink-900 dark:text-ink-50">{locale === "ar" ? w.nameAr : w.nameEn}</p>
                            <p className="text-xs text-ink-400">{w.cityEn}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-ink-500 dark:text-ink-400">
                        {locale === "ar" ? w.categoryAr : w.categoryEn}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-ink-900 dark:text-ink-50">{formatCompact(w.views)}</td>
                      <td className="px-6 py-3.5 text-end">
                        <Rating value={w.rating} size={11} showValue />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* worker management — plan audit (docs/booking-take-rate.md): every
            worker with its plan + status and a fee-waived filter, so admins can
            compare live Enterprise subscriptions against what /search surfaces. */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.workerManagement")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <WorkerManagementTable workers={workers} init={workerManagementInit} />
          </CardContent>
        </Card>

        {/* ad campaigns & payments */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4 shrink-0 text-brand-500" />
              {t("admin.campaignsTitle")}
            </CardTitle>
            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
              <span>{t("admin.campaignCollected")}: ${formatCompact(collectedMinor / 100)}</span>
              {refundedMinor > 0 && (
                <>
                  <span className="text-red-600 dark:text-red-400"> · {t("admin.campaignRefunded")}: ${formatCompact(refundedMinor / 100)}</span>
                  <span className="text-emerald-600 dark:text-emerald-400"> · {t("admin.campaignNet")}: ${formatCompact(netMinor / 100)}</span>
                </>
              )}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* revenue by campaign */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{t("admin.campaignRevenue")}</p>
              {campaignRevenue.length === 0 ? (
                <p className="py-3 text-center text-sm text-ink-400">{t("admin.campaignRevenueEmpty")}</p>
              ) : (
                <BarList items={campaignRevenue} color="#8b5cf6" />
              )}
            </div>
            {/* payments table */}
            {campaignPayments.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-400">{t("admin.campaignPaymentsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-start text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                      <th className="px-4 py-3 text-start font-semibold">{t("admin.campaignName")}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t("company.placement")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("admin.campaignPaid")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("admin.campaignPaidAt")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("admin.status")}</th>
                      <th className="px-4 py-3 text-end font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {campaignPayments.map(({ campaign, payment }) => (
                      <tr
                        key={campaign.id}
                        className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-ink-900 dark:text-ink-50">{locale === "ar" ? campaign.nameAr : campaign.nameEn}</p>
                          <p className="text-xs text-ink-400">{campaign.placement}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-ink-500 dark:text-ink-400">{t(`company.${campaign.adType}`)}</td>
                        <td className="px-4 py-3.5 text-end font-bold text-ink-900 dark:text-ink-50">
                          ${formatCompact(payment.amount / 100)}
                        </td>
                        <td className="px-4 py-3.5 text-end text-xs text-ink-400">
                          {payment.paidAt ? formatDate(payment.paidAt, locale) : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-end">
                          <Badge
                            className={PAYMENT_STATUS_STYLE[payment.status]}
                            title={
                              payment.status === "refunded" && payment.refundReason
                                ? `${t("admin.refundReason")}: ${payment.refundReason}`
                                : undefined
                            }
                          >
                            {t(`admin.pay${payment.status[0].toUpperCase()}${payment.status.slice(1)}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-end">
                          {payment.status === "paid" && <RefundDialog campaign={campaign} payment={payment} />}
                          {payment.status === "refunded" && campaignEmailPreviews[campaign.id] && (
                            <EmailPreviewDialog
                              type="campaignRefunded"
                              subjectEn={campaignEmailPreviews[campaign.id].subjectEn}
                              subjectAr={campaignEmailPreviews[campaign.id].subjectAr}
                              htmlEn={campaignEmailPreviews[campaign.id].htmlEn}
                              htmlAr={campaignEmailPreviews[campaign.id].htmlAr}
                              recipient={campaignEmailPreviews[campaign.id].recipient}
                              surface="company"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* activity + alerts */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Activity className="size-4 shrink-0 text-brand-500" />
              <CardTitle className="min-w-0 text-base">{t("admin.activity")}</CardTitle>
              <div className="ms-auto flex shrink-0 items-center gap-3">
                <Link
                  href="/admin/activity"
                  className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t("admin.activityHistoryTitle")} →
                </Link>
                <Link
                  href="/admin/push-subscriptions"
                  className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t("admin.pushSubsTitle")} →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 border-b border-ink-100 pb-2.5 dark:border-ink-800">
                <ActivityTypeChips value={feedType} onChange={setFeedType} counts={feedTypeCounts} />
              </div>
              {visibleActivities.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-400">{t("admin.activityHistoryEmpty")}</p>
              )}
              {visibleActivities.slice(0, 6).map((act) => (
                <div key={act.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50">
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${activityDot(act)}`} />
                  <div className="min-w-0">
                    {/* Badge/Link render inline spans/anchors — valid phrasing content inside <p> (see tests/html-nesting.test.ts) */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-ink-800 dark:text-ink-100">
                      {act.bookingNo ? (
                        <Link
                          href={`/admin/bookings/${act.bookingNo}`}
                          className="text-brand-600 transition-colors hover:underline dark:text-brand-400"
                          title={`${t("booking.disputeSubtitle")} (${act.bookingNo})`}
                        >
                          {locale === "ar" ? act.actionAr : act.actionEn}
                        </Link>
                      ) : (
                        (locale === "ar" ? act.actionAr : act.actionEn)
                      )}
                      {act.type === "verification" &&
                        (act.code === CODE_REQUEST ? (
                          <Badge variant="default" className="text-[10px] font-bold">{t("admin.activityRequest")}</Badge>
                        ) : act.code === CODE_VERIFIED ? (
                          <Badge variant="success" className="text-[10px] font-bold">{t("admin.activityDecision")}</Badge>
                        ) : act.code === CODE_DECLINED ? (
                          <Badge variant="danger" className="text-[10px] font-bold">{t("admin.activityDecision")}</Badge>
                        ) : null)}
                      {act.code === CODE_PLAN_CHANGED && (
                        <Badge variant="default" className="bg-brand-500/10 text-[10px] font-bold text-brand-700 dark:text-brand-400">
                          {t("admin.plan")}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-ink-400">{act.actor} · {act.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* verification funnel */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-violet-500" />
              <CardTitle className="min-w-0 text-base">{t("admin.verificationFunnelTitle")}</CardTitle>
              <Badge variant="outline" className="ms-auto shrink-0 text-[10px]">{t("admin.verificationFunnelWindow")}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const f = a.verificationFunnel;
                const total = f.requests + f.approved + f.declined;
                if (total === 0) {
                  return <p className="py-3 text-center text-sm text-ink-400">{t("admin.verificationFunnelEmpty")}</p>;
                }
                const seg = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
                return (
                  <>
                    {/* stacked bar: requests vs decisions */}
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full bg-amber-400" style={{ width: seg(f.requests) }} />
                      <div className="h-full bg-emerald-500" style={{ width: seg(f.approved) }} />
                      <div className="h-full bg-red-500" style={{ width: seg(f.declined) }} />
                    </div>
                    {/* legend + counts */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                          <span className="size-2 rounded-full bg-amber-400" />
                          {t("admin.verificationFunnelRequests")}
                        </span>
                        <span className="font-bold text-ink-900 dark:text-ink-50">{formatCompact(f.requests)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          {t("admin.verificationFunnelApproved")}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCompact(f.approved)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                          <span className="size-2 rounded-full bg-red-500" />
                          {t("admin.verificationFunnelDeclined")}
                        </span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCompact(f.declined)}</span>
                      </div>
                    </div>
                    {/* conversion rates */}
                    <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                      <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.verificationFunnelApprovalRate")}</p>
                        <p className="text-lg font-black text-ink-900 dark:text-ink-50">{f.approvalRate}%</p>
                      </div>
                      <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.verificationFunnelConversion")}</p>
                        <p className="text-lg font-black text-ink-900 dark:text-ink-50">{f.conversionRate}%</p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* booking funnel (M4) */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-brand-500" />
              <CardTitle className="min-w-0 text-base">{t("admin.bookingFunnelTitle")}</CardTitle>
              <Badge variant="outline" className="ms-auto shrink-0 text-[10px]">{t("admin.bookingFunnelWindow")}</Badge>
              {/* §2.4 — CSV/PDF export of every booking's event trail. */}
              <BookingTrailsExportButton />
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const f = a.bookingFunnel;
                if (f.total === 0) {
                  return <p className="py-3 text-center text-sm text-ink-400">{t("admin.bookingFunnelEmpty")}</p>;
                }
                const seg = (n: number) => `${(n / f.total) * 100}%`;
                return (
                  <>
                    {/* stacked bar: one segment per non-zero status, in lifecycle order */}
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      {FUNNEL_STATUS_ORDER.map((s) =>
                        f.counts[s] > 0 ? (
                          <div
                            key={s}
                            className="h-full transition-all"
                            style={{ width: seg(f.counts[s]), backgroundColor: FUNNEL_STATUS_COLOR[s] }}
                          />
                        ) : null
                      )}
                    </div>
                    {/* legend + counts (non-zero statuses, lifecycle order) */}
                    <div className="space-y-1.5">
                      {FUNNEL_STATUS_ORDER.map(
                        (s) =>
                          f.counts[s] > 0 && (
                            <div key={s} className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                                <span
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: FUNNEL_STATUS_COLOR[s] }}
                                />
                                {t(`booking.status.${s}`)}
                              </span>
                              <span className="font-bold text-ink-900 dark:text-ink-50">{formatCompact(f.counts[s])}</span>
                            </div>
                          )
                      )}
                    </div>
                    {/* totals + conversion */}
                    <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                      <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.bookingFunnelTotal")}</p>
                        <p className="text-lg font-black text-ink-900 dark:text-ink-50">{formatCompact(f.total)}</p>
                      </div>
                      <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.bookingFunnelConversion")}</p>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{f.conversionRate}%</p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* platform take-rate revenue (M5) — the funnel card's money twin */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Wallet className="size-4 shrink-0 text-brand-500" />
              <CardTitle className="min-w-0 text-base">{t("admin.feesTitle")}</CardTitle>
              <Badge variant="outline" className="ms-auto shrink-0 text-[10px]">{t("admin.bookingFunnelWindow")}</Badge>
            </CardHeader>
            <CardContent>
              {(() => {
                const f = platformFeeStats;
                if (f.count === 0) {
                  return <p className="py-3 text-center text-sm text-ink-400">{t("admin.feesEmpty")}</p>;
                }
                const money = (minor: number) => formatPrice(minor / 100, f.currency, locale);
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.feesGross")}</p>
                      <p className="text-lg font-black text-ink-900 dark:text-ink-50">{money(f.grossMinor)}</p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.feesNet")}</p>
                      <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{money(f.netMinor)}</p>
                    </div>
                    {f.refundedMinor > 0 && (
                      <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.feesRefunded")}</p>
                        <p className="text-lg font-black text-red-600 dark:text-red-400">{money(f.refundedMinor)}</p>
                      </div>
                    )}
                    <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("admin.feesAvg")}</p>
                      <p className="text-lg font-black text-ink-900 dark:text-ink-50">{money(f.avgFeeMinor)}</p>
                    </div>
                    <p className="col-span-2 text-[11px] text-ink-400">
                      {formatNumber(f.count)} {t("admin.feesBookings")}
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* pending worker payouts (docs/payouts.md) */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Wallet className="size-4 shrink-0 text-brand-500" />
              <CardTitle className="min-w-0 text-base">{t("admin.payoutsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingPayouts.length === 0 ? (
                <p className="py-3 text-center text-sm text-ink-400">{t("admin.payoutsEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {pendingPayouts.map(({ entry, workerName }) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-4 py-2.5 dark:bg-ink-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{workerName}</p>
                        <p className="truncate text-xs text-ink-400">{formatDate(entry.time, locale)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-ink-900 dark:text-ink-50">
                          {formatPrice(Math.abs(entry.amount) / 100, entry.currency, locale)}
                        </p>
                        <PayoutDecision payoutId={entry.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* §Lebanon — PENDING OMT/Whish manual payments: the admin's confirm
              is the manual twin of a provider webhook (no webhook exists). */}
          <ManualPaymentsCard payments={pendingManualPayments} />

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="size-4 text-amber-500" />
                {t("admin.alertsTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.alerts.map((al) => (
                <div key={al.type} className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 dark:bg-ink-900/70">
                  <p className="min-w-0 text-sm font-medium text-ink-700 dark:text-ink-200">
                    {t(`admin.alert${al.type[0].toUpperCase()}${al.type.slice(1)}`)}
                  </p>
                  <Badge variant={al.type === "expired" ? "danger" : "default"}>{al.count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* verification queue */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
              <CardTitle className="min-w-0 text-base">{t("verification.queueTitle")}</CardTitle>
              {verificationQueue.length > 0 && <Badge variant="danger">{verificationQueue.length}</Badge>}
              <Link
                href="/admin/verifications"
                className="ms-auto shrink-0 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
              >
                {t("admin.verificationHistory")} →
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {verificationQueue.length === 0 && (
                <p className="py-4 text-center text-sm text-ink-400">{t("verification.queueEmpty")}</p>
              )}
              {verificationQueue.map((w) => (
                <div key={w.id} className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70">
                  <div className="flex items-center gap-3">
                    <GradientAvatar name={w.nameEn} hue={w.hue} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                        {locale === "ar" ? w.nameAr : w.nameEn}
                      </p>
                      <p className="truncate text-xs text-ink-400">{locale === "ar" ? w.taglineAr : w.taglineEn}</p>
                    </div>
                    <DecisionButtons worker={w} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
