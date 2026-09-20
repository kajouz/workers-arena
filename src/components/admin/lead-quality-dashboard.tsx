"use client";

/**
 * §12 — Lead Quality Analytics Dashboard
 *
 * Shows weekly trends in rating quality, conversion rates, and price
 * multiplier impact per grade. Uses lightweight CSS-based charts
 * (no external charting library).
 */

import { useMemo, useState } from "react";
import { TrendingUp, Star, Target, DollarSign, ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LeadQualityAnalytics, GradeWeekStats, WeekAggregate } from "@/lib/data/lead-quality-analytics";
import type { CategoryConversionReport } from "@/lib/data/category-conversion";
import type { LeadGrade } from "@/lib/data/lead-market";
import { StatCard, Sparkline, GradeBarChart, Legend } from "./lead-quality-charts";

const GRADE_COLORS: Record<LeadGrade, string> = {
  bronze: "bg-amber-600",
  silver: "bg-gray-400",
  gold: "bg-yellow-500",
  emergency: "bg-red-500",
};

const GRADE_LABELS: Record<LeadGrade, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  emergency: "Emergency",
};

const GRADE_BG: Record<LeadGrade, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  emergency: "bg-red-100 text-red-700",
};

export function LeadQualityDashboard({
  analytics,
  categoryConversion,
}: {
  analytics: LeadQualityAnalytics;
  /** §2.1 — per-category lead funnel (offered → purchased → job won). */
  categoryConversion?: CategoryConversionReport;
}) {
  const [selectedGrade, setSelectedGrade] = useState<LeadGrade | "all">("all");

  const { weeks, lifetimeByGrade, lifetimeMultipliers, totalRatings } = analytics;

  // Trend sparkline data — last 12 weeks
  const recentWeeks = useMemo(() => weeks.slice(-12), [weeks]);
  const avgQualityTrend = useMemo(() => recentWeeks.map((w) => w.overallAvgQuality), [recentWeeks]);
  const conversionTrend = useMemo(() => recentWeeks.map((w) => w.overallConversionRate), [recentWeeks]);
  const countTrend = useMemo(() => recentWeeks.map((w) => w.totalCount), [recentWeeks]);

  // Per-grade trends for the selected grade
  const gradeTrend = useMemo(() => {
    if (selectedGrade === "all") return avgQualityTrend;
    return recentWeeks.map((w) => w.byGrade[selectedGrade]?.avgQuality ?? 0);
  }, [recentWeeks, selectedGrade, avgQualityTrend]);

  // Per-grade conversion trends
  const gradeConversionTrend = useMemo(() => {
    if (selectedGrade === "all") return conversionTrend;
    return recentWeeks.map((w) => w.byGrade[selectedGrade]?.conversionRate ?? 0);
  }, [recentWeeks, selectedGrade, conversionTrend]);

  // Lifetime grade bar chart data
  const gradeBarData = useMemo(
    () =>
      (["bronze", "silver", "gold", "emergency"] as const).map((grade) => ({
        label: GRADE_LABELS[grade],
        value: lifetimeByGrade[grade].count,
        color: GRADE_COLORS[grade],
        subtitle: `${lifetimeByGrade[grade].avgQuality}★`,
      })),
    [lifetimeByGrade]
  );

  // Price multiplier bar chart
  const multiplierBarData = useMemo(
    () =>
      (["bronze", "silver", "gold", "emergency"] as const).map((grade) => ({
        label: GRADE_LABELS[grade],
        value: Math.round(lifetimeMultipliers[grade] * 100),
        maxValue: 200,
        color: lifetimeMultipliers[grade] > 1 ? "bg-emerald-500" : lifetimeMultipliers[grade] < 1 ? "bg-amber-500" : "bg-ink-300",
        subtitle: `${lifetimeMultipliers[grade]}×`,
      })),
    [lifetimeMultipliers]
  );

  // Weekly grade breakdown for selected grade
  const weeklyGradeData = useMemo(() => {
    const grade = selectedGrade === "all" ? null : selectedGrade;
    return recentWeeks.map((w) => {
      if (!grade) return w.overallAvgQuality;
      return w.byGrade[grade]?.avgQuality ?? 0;
    });
  }, [recentWeeks, selectedGrade]);

  if (totalRatings === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/revenue-settings" className="text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <BarChart3 className="h-6 w-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-gray-900">Lead Quality Analytics</h1>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">
            No lead ratings yet. Once workers rate purchased leads, trends will appear here.
          </p>
          <Link
            href="/admin/revenue-settings"
            className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Go to Revenue Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/revenue-settings" className="text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <BarChart3 className="h-6 w-6 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Quality Analytics</h1>
          <p className="text-sm text-gray-500">
            {totalRatings} ratings across {weeks.length} weeks
            {analytics.earliestRating && analytics.latestRating
              ? ` · ${analytics.earliestRating.slice(0, 10)} → ${analytics.latestRating.slice(0, 10)}`
              : ""}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Ratings"
          value={totalRatings}
          sparkValues={countTrend}
          sparkColor="bg-brand-500"
        />
        <StatCard
          label="Avg Quality"
          value={`${analytics.weeks.length > 0 ? recentWeeks[recentWeeks.length - 1]?.overallAvgQuality ?? 0 : 0}★`}
          sparkValues={avgQualityTrend}
          sparkColor="bg-yellow-500"
        />
        <StatCard
          label="Conversion Rate"
          value={`${recentWeeks.length > 0 ? recentWeeks[recentWeeks.length - 1]?.overallConversionRate ?? 0 : 0}%`}
          sparkValues={conversionTrend}
          sparkColor="bg-emerald-500"
        />
        <StatCard
          label="Grades Rated"
          value={Object.values(lifetimeByGrade).filter((g) => g.count > 0).length}
          subtitle="of 4 grades"
        />
      </div>

      {/* Grade Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-500">Filter by grade:</span>
        {(["all", "bronze", "silver", "gold", "emergency"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGrade(g)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedGrade === g
                ? "bg-brand-500 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
            )}
          >
            {g === "all" ? "All" : GRADE_LABELS[g]}
          </button>
        ))}
      </div>

      {/* Weekly Trend */}
      <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-300">
          Weekly Quality Trend{selectedGrade !== "all" ? ` — ${GRADE_LABELS[selectedGrade]}` : ""}
        </h2>
        <Sparkline values={weeklyGradeData} color="bg-yellow-500" barHeight={40} showTrend />
        <Legend
          items={recentWeeks.map((w) => ({ label: w.weekKey, color: "bg-ink-300" }))}
          className="mt-2"
        />
      </div>

      {/* Two-column layout: Grade breakdown + Price multiplier */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ratings by Grade */}
        <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-300">
            Ratings by Grade
          </h2>
          <GradeBarChart data={gradeBarData} />
        </div>

        {/* Price Multiplier Impact */}
        <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-300">
            Price Multiplier Impact
          </h2>
          <p className="mb-3 text-[11px] text-ink-400">
            100% = no adjustment · &gt;100% = surcharge (high quality) · &lt;100% = discount (low quality)
          </p>
          <GradeBarChart data={multiplierBarData} maxValue={200} />
        </div>
      </div>

      {/* Per-Grade Detail Table */}
      <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
        <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-300">
          Lifetime Grade Details
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-ink-500 dark:border-ink-800">
                <th className="pb-2 font-medium">Grade</th>
                <th className="pb-2 text-right font-medium">Count</th>
                <th className="pb-2 text-right font-medium">Avg Quality</th>
                <th className="pb-2 text-right font-medium">Conversion</th>
                <th className="pb-2 text-right font-medium">Reachability</th>
                <th className="pb-2 text-right font-medium">Price Multiplier</th>
                <th className="pb-2 text-right font-medium">Match Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {(["bronze", "silver", "gold", "emergency"] as const).map((grade) => {
                const stats = lifetimeByGrade[grade];
                return (
                  <tr key={grade} className="border-b border-ink-50 last:border-0 dark:border-ink-900">
                    <td className="py-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", GRADE_BG[grade])}>
                        {GRADE_LABELS[grade]}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{stats.count}</td>
                    <td className="py-2 text-right tabular-nums">
                      {stats.count > 0 ? `${stats.avgQuality}★` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {stats.count > 0 ? `${stats.conversionRate}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {stats.count > 0 ? `${stats.reachabilityRate}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {stats.count > 0 ? (
                        <span className={cn(
                          "font-medium",
                          lifetimeMultipliers[grade] > 1 ? "text-emerald-600" : lifetimeMultipliers[grade] < 1 ? "text-amber-600" : ""
                        )}>
                          {lifetimeMultipliers[grade]}×
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {stats.count > 0 ? (
                        <span className={cn(
                          "font-medium",
                          stats.avgQuality > 3 ? "text-emerald-600" : stats.avgQuality < 3 ? "text-red-500" : ""
                        )}>
                          {stats.avgQuality > 3 ? "+" : ""}{Math.round((stats.avgQuality - 3) * 5)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Breakdown Table */}
      {recentWeeks.length > 0 && (
        <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
          <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-300">
            Weekly Breakdown (Last {recentWeeks.length} Weeks)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500 dark:border-ink-800">
                  <th className="pb-2 font-medium">Week</th>
                  <th className="pb-2 text-right font-medium">Ratings</th>
                  <th className="pb-2 text-right font-medium">Avg Quality</th>
                  <th className="pb-2 text-right font-medium">Conversion</th>
                  <th className="pb-2 text-right font-medium">Bronze</th>
                  <th className="pb-2 text-right font-medium">Silver</th>
                  <th className="pb-2 text-right font-medium">Gold</th>
                  <th className="pb-2 text-right font-medium">Emergency</th>
                </tr>
              </thead>
              <tbody>
                {recentWeeks.map((w) => (
                  <tr key={w.weekKey} className="border-b border-ink-50 last:border-0 dark:border-ink-900">
                    <td className="py-2 font-medium tabular-nums">{w.weekKey}</td>
                    <td className="py-2 text-right tabular-nums">{w.totalCount}</td>
                    <td className="py-2 text-right tabular-nums">{w.overallAvgQuality}★</td>
                    <td className="py-2 text-right tabular-nums">{w.overallConversionRate}%</td>
                    <td className="py-2 text-right tabular-nums">{w.byGrade.bronze.count || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{w.byGrade.silver.count || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{w.byGrade.gold.count || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{w.byGrade.emergency.count || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* §2.1 — per-category lead funnel: offered → purchased → job won.
          Rows with zero purchases still matter — a category where leads are
          shown but never bought is a pricing or quality signal. */}
      {categoryConversion && categoryConversion.window.length > 0 && (
        <div className="rounded-xl border border-ink-100 bg-white p-5 dark:border-ink-800">
          <h2 className="mb-1 text-sm font-semibold text-ink-700 dark:text-ink-300">
            Category Conversion (Last {categoryConversion.windowDays} Days)
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            Lead funnel per trade — jobs won are completions attributed by a lead rebate or the worker&apos;s own converted rating.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500 dark:border-ink-800">
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Offers</th>
                  <th className="pb-2 text-right font-medium">Purchased</th>
                  <th className="pb-2 text-right font-medium">Buy rate</th>
                  <th className="pb-2 text-right font-medium">Jobs won</th>
                  <th className="pb-2 text-right font-medium">Lead → job</th>
                  <th className="pb-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {categoryConversion.window.map((row) => (
                  <tr key={row.categorySlug} className="border-b border-ink-50 last:border-0 dark:border-ink-900">
                    <td className="py-2 font-medium capitalize">{row.categorySlug.replace(/-/g, " ")}</td>
                    <td className="py-2 text-right tabular-nums">{row.leads}</td>
                    <td className="py-2 text-right tabular-nums">{row.offers}</td>
                    <td className="py-2 text-right tabular-nums">{row.purchased}</td>
                    <td className="py-2 text-right tabular-nums">{row.purchaseRate}%</td>
                    <td className="py-2 text-right tabular-nums">{row.jobsWon}</td>
                    <td className="py-2 text-right tabular-nums">{row.jobRate}%</td>
                    <td className="py-2 text-right tabular-nums">{row.grossCredits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
