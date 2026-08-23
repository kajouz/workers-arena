"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  MousePointerClick,
  Target,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  RefreshCw,
} from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "./stat-card";
import { formatCompact } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  summary: {
    totalImpressions: number;
    totalClicks: number;
    totalSpent: number;
    totalBudget: number;
    remaining: number;
    ctr: number;
    cpc: number;
    cpm: number;
    roas: number;
    estimatedConversions: number;
    estimatedRevenue: number;
  };
  placementStats: Record<string, { impressions: number; clicks: number; spent: number; count: number }>;
  dailyPerformance: Array<{ date: string; impressions: number; clicks: number; spent: number; ctr: number }>;
  topCampaigns: Array<{ id: string; name: string; nameAr: string; impressions: number; clicks: number; ctr: number; spent: number; status: string }>;
  campaignCount: number;
  activeCampaigns: number;
}

export function CampaignAnalytics() {
  const { locale, t } = useLocale();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/analytics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 w-24 rounded bg-ink-200 dark:bg-ink-700" />
              <div className="mt-2 h-8 w-32 rounded bg-ink-200 dark:bg-ink-700" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { summary, placementStats, dailyPerformance, topCampaigns } = data;
  const maxImpressions = Math.max(...dailyPerformance.map((d) => d.impressions));

  const getTrendIcon = (value: number) =>
    value >= 0 ? (
      <ArrowUpRight className="size-4 text-emerald-500" />
    ) : (
      <ArrowDownRight className="size-4 text-red-500" />
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            {locale === "ar" ? "تحليلات الحملات الإعلانية" : "Campaign Analytics"}
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "تتبع أداء حملاتك وإيراداتك" : "Track your campaign performance and ROI"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  period === p
                    ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50"
                    : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
                )}
              >
                {p === "7d" ? "7D" : p === "30d" ? "30D" : "90D"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnalytics}>
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            {locale === "ar" ? "تصدير" : "Export"}
          </Button>
        </div>
      </div>

      {/* ROI Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {locale === "ar" ? "العائد على الإنفاق" : "ROAS"}
                </p>
                <p className="mt-1 text-3xl font-black text-emerald-700 dark:text-emerald-300">
                  {summary.roas}x
                </p>
                <p className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">
                  {locale === "ar" ? "إيرادات / إنفاق" : "Revenue / Spend"}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <TrendingUp className="size-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-brand-50 to-brand-100/50 dark:from-brand-950/30 dark:to-brand-900/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  {locale === "ar" ? "تكلفة لكل نقرة" : "Cost per Click"}
                </p>
                <p className="mt-1 text-3xl font-black text-brand-700 dark:text-brand-300">
                  ${summary.cpc}
                </p>
                <p className="mt-1 text-xs text-brand-600/70 dark:text-brand-400/70">
                  {locale === "ar" ? "متوسط تكلفة النقرة" : "Average click cost"}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-brand-500/10">
                <MousePointerClick className="size-6 text-brand-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  {locale === "ar" ? "تكلفة لكل 1000 ظهور" : "CPM"}
                </p>
                <p className="mt-1 text-3xl font-black text-violet-700 dark:text-violet-300">
                  ${summary.cpm}
                </p>
                <p className="mt-1 text-xs text-violet-600/70 dark:text-violet-400/70">
                  {locale === "ar" ? "تكلفة الألف ظهور" : "Cost per 1K impressions"}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/10">
                <Eye className="size-6 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {locale === "ar" ? "الإيرادات المقدرة" : "Est. Revenue"}
                </p>
                <p className="mt-1 text-3xl font-black text-amber-700 dark:text-amber-300">
                  ${formatCompact(summary.estimatedRevenue)}
                </p>
                <p className="mt-1 text-xs text-amber-600/70 dark:text-amber-400/70">
                  {summary.estimatedConversions} {locale === "ar" ? "تحويلات" : "conversions"}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10">
                <DollarSign className="size-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Performance Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {locale === "ar" ? "الأداء اليومي" : "Daily Performance"}
            </CardTitle>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-500" />
                {locale === "ar" ? "ظهور" : "Impressions"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                {locale === "ar" ? "نقرات" : "Clicks"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {/* Bar chart visualization */}
              <div className="flex h-full items-end gap-2">
                {dailyPerformance.map((day, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end gap-1" style={{ height: "200px" }}>
                      <div
                        className="flex-1 rounded-t bg-brand-500/80 transition-all hover:bg-brand-500"
                        style={{ height: `${(day.impressions / maxImpressions) * 100}%` }}
                        title={`${locale === "ar" ? "ظهور" : "Impressions"}: ${formatCompact(day.impressions)}`}
                      />
                      <div
                        className="flex-1 rounded-t bg-emerald-500/80 transition-all hover:bg-emerald-500"
                        style={{ height: `${(day.clicks / maxImpressions) * 100}%` }}
                        title={`${locale === "ar" ? "نقرات" : "Clicks"}: ${formatCompact(day.clicks)}`}
                      />
                    </div>
                    <span className="text-[10px] text-ink-400">
                      {new Date(day.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { weekday: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Placement Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {locale === "ar" ? "الأداء حسب الموقع" : "By Placement"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(placementStats).map(([placement, stats]) => {
              const ctr = stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(1) : "0";
              const percentage = (stats.impressions / summary.totalImpressions) * 100;
              return (
                <div key={placement} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700 dark:text-ink-200">{placement}</span>
                    <span className="text-xs text-ink-500">{ctr}% CTR</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>{formatCompact(stats.impressions)} {locale === "ar" ? "ظهور" : "impressions"}</span>
                    <span>${formatCompact(stats.spent)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Top Campaigns & Budget */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Performing Campaigns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {locale === "ar" ? "أفضل الحملات أداءً" : "Top Performing Campaigns"}
            </CardTitle>
            <Badge variant="outline">
              <BarChart3 className="size-3 mr-1" />
              {topCampaigns.length}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                    <th className="px-6 py-3 text-start font-semibold">{locale === "ar" ? "الحملة" : "Campaign"}</th>
                    <th className="px-4 py-3 text-end font-semibold">{locale === "ar" ? "ظهور" : "Impressions"}</th>
                    <th className="px-4 py-3 text-end font-semibold">{locale === "ar" ? "نقرات" : "Clicks"}</th>
                    <th className="px-4 py-3 text-end font-semibold">CTR</th>
                    <th className="px-6 py-3 text-end font-semibold">{locale === "ar" ? "الإنفاق" : "Spent"}</th>
                  </tr>
                </thead>
                <tbody>
                  {topCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40">
                      <td className="px-6 py-4">
                        <p className="font-bold text-ink-900 dark:text-ink-50">
                          {locale === "ar" ? c.nameAr : c.name}
                        </p>
                        <Badge className={cn(
                          "mt-1 text-[10px]",
                          c.status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-ink-500/10 text-ink-500"
                        )}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-end font-bold text-ink-900 dark:text-ink-50">
                        {formatCompact(c.impressions)}
                      </td>
                      <td className="px-4 py-4 text-end font-bold text-ink-900 dark:text-ink-50">
                        {formatCompact(c.clicks)}
                      </td>
                      <td className="px-4 py-4 text-end font-bold text-brand-600 dark:text-brand-400">
                        {c.ctr}%
                      </td>
                      <td className="px-6 py-4 text-end font-bold text-ink-900 dark:text-ink-50">
                        ${formatCompact(c.spent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Budget Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {locale === "ar" ? "نظرة عامة على الميزانية" : "Budget Overview"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Circular progress */}
            <div className="flex justify-center">
              <div className="relative size-32">
                <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="fill-none stroke-ink-100 dark:stroke-ink-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(summary.totalSpent / summary.totalBudget) * 251.2} 251.2`}
                    className="fill-none"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-ink-900 dark:text-ink-50">
                    {Math.round((summary.totalSpent / summary.totalBudget) * 100)}%
                  </span>
                  <span className="text-xs text-ink-400">{locale === "ar" ? "من الميزانية" : "of budget"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800">
                <span className="text-sm text-ink-500">{locale === "ar" ? "الميزانية الإجمالية" : "Total Budget"}</span>
                <span className="font-black text-ink-900 dark:text-ink-50">${formatCompact(summary.totalBudget)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-950/30">
                <span className="text-sm text-brand-600">{locale === "ar" ? "الإنفاق" : "Spent"}</span>
                <span className="font-black text-brand-700 dark:text-brand-400">${formatCompact(summary.totalSpent)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
                <span className="text-sm text-emerald-600">{locale === "ar" ? "المتبقي" : "Remaining"}</span>
                <span className="font-black text-emerald-700 dark:text-emerald-400">${formatCompact(summary.remaining)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-800">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-ink-50">
                <Target className="size-4 text-brand-500" />
                {locale === "ar" ? "ملخص الأداء" : "Performance Summary"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-2xl font-black text-brand-600 dark:text-brand-400">{summary.ctr}%</p>
                  <p className="text-xs text-ink-400">{locale === "ar" ? "معدل النقر" : "CTR"}</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{data.activeCampaigns}</p>
                  <p className="text-xs text-ink-400">{locale === "ar" ? "حملات نشطة" : "Active"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
