"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Users, TrendingDown, AlertTriangle, Heart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/utils";

interface CohortData {
  month: string;
  registered: number;
  retained: number;
  churned: number;
  retentionRate: number;
}

interface PlanTransition {
  from: string;
  to: string;
  count: number;
  percentage: number;
}

interface AtRiskWorker {
  id: string;
  name: string;
  nameAr: string;
  plan: string;
  daysUntilExpiry: number;
  lastActivity: string;
  hue: number;
}

interface RetentionData {
  cohorts: CohortData[];
  overallRetention: number;
  churnRate: number;
  avgLifetimeMonths: number;
  ltv: number;
  planTransitions: PlanTransition[];
  atRiskWorkers: AtRiskWorker[];
}

interface RetentionCohortsProps {
  data: RetentionData;
  locale?: string;
}

export function RetentionCohorts({ data, locale = "en" }: RetentionCohortsProps) {
  // Calculate trend indicators
  const retentionTrend = data.overallRetention > 70 ? "positive" : data.overallRetention > 50 ? "neutral" : "negative";
  const churnTrend = data.churnRate < 5 ? "positive" : data.churnRate < 10 ? "neutral" : "negative";

  // Color coding for retention rates
  const getRetentionColor = (rate: number) => {
    if (rate >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (rate >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRetentionBg = (rate: number) => {
    if (rate >= 80) return "bg-emerald-500/10";
    if (rate >= 60) return "bg-amber-500/10";
    return "bg-red-500/10";
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="size-5 text-brand-500" />
          {locale === "ar" ? "الاحتفاظ والانسحاب" : "Retention & Churn"}
        </CardTitle>
        <Badge variant="outline" className="text-[10px]">
          {locale === "ar" ? "آخر 6 أشهر" : "Last 6 months"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-emerald-500/10 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {locale === "ar" ? "معدل الاحتفاظ" : "Retention Rate"}
                </span>
              </div>
              {retentionTrend === "positive" ? (
                <ArrowUpRight className="size-4 text-emerald-500" />
              ) : retentionTrend === "negative" ? (
                <ArrowDownRight className="size-4 text-red-500" />
              ) : null}
            </div>
            <p className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {data.overallRetention.toFixed(1)}%
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl bg-red-500/10 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4 text-red-500" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {locale === "ar" ? "معدل الانسحاب" : "Churn Rate"}
                </span>
              </div>
              {churnTrend === "positive" ? (
                <ArrowUpRight className="size-4 text-emerald-500" />
              ) : churnTrend === "negative" ? (
                <ArrowDownRight className="size-4 text-red-500" />
              ) : null}
            </div>
            <p className="mt-2 text-3xl font-black text-red-600 dark:text-red-400">
              {data.churnRate.toFixed(1)}%
            </p>
          </motion.div>
        </div>

        {/* Lifetime Value */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "متوسط العمر" : "Avg Lifetime"}
            </p>
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
              {data.avgLifetimeMonths.toFixed(1)}
            </p>
            <p className="text-[10px] text-ink-400">{locale === "ar" ? "أشهر" : "months"}</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "قيمة العميل" : "LTV"}
            </p>
            <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
              ${data.ltv.toFixed(0)}
            </p>
            <p className="text-[10px] text-ink-400">{locale === "ar" ? "للعامل" : "per worker"}</p>
          </div>
        </div>

        {/* Cohort Retention Table */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
            {locale === "ar" ? "جدول الاحتفاظ" : "Cohort Retention"}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 dark:border-ink-800">
                  <th className="px-2 py-2 text-left font-semibold text-ink-500">{locale === "ar" ? "الشهر" : "Month"}</th>
                  <th className="px-2 py-2 text-right font-semibold text-ink-500">{locale === "ar" ? "مسجلون" : "Registered"}</th>
                  <th className="px-2 py-2 text-right font-semibold text-ink-500">{locale === "ar" ? "احتفاظ" : "Retained"}</th>
                  <th className="px-2 py-2 text-right font-semibold text-ink-500">{locale === "ar" ? "انسحاب" : "Churned"}</th>
                  <th className="px-2 py-2 text-right font-semibold text-ink-500">{locale === "ar" ? "النسبة" : "Rate"}</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort, i) => (
                  <motion.tr
                    key={cohort.month}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b border-ink-50 dark:border-ink-800/50"
                  >
                    <td className="px-2 py-2 font-medium text-ink-700 dark:text-ink-200">{cohort.month}</td>
                    <td className="px-2 py-2 text-right text-ink-600 dark:text-ink-300">{formatCompact(cohort.registered)}</td>
                    <td className="px-2 py-2 text-right text-emerald-600 dark:text-emerald-400">{formatCompact(cohort.retained)}</td>
                    <td className="px-2 py-2 text-right text-red-600 dark:text-red-400">{formatCompact(cohort.churned)}</td>
                    <td className="px-2 py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getRetentionBg(cohort.retentionRate)} ${getRetentionColor(cohort.retentionRate)}`}>
                        {cohort.retentionRate.toFixed(1)}%
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Plan Transitions */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
            {locale === "ar" ? "تحركات الخطط" : "Plan Transitions"}
          </h4>
          <div className="space-y-2">
            {data.planTransitions.slice(0, 5).map((transition, i) => (
              <motion.div
                key={`${transition.from}-${transition.to}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 dark:bg-ink-900/70"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{transition.from}</Badge>
                  <span className="text-ink-400">→</span>
                  <Badge variant="outline" className="text-[9px]">{transition.to}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-900 dark:text-ink-50">{transition.count}</span>
                  <span className="text-[10px] text-ink-400">({transition.percentage.toFixed(1)}%)</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* At-Risk Workers */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <AlertTriangle className="size-4 text-amber-500" />
            {locale === "ar" ? "عمال معرضون للخطر" : "At-Risk Workers"}
          </h4>
          <div className="space-y-2">
            {data.atRiskWorkers.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-400">
                {locale === "ar" ? "لا يوجد عمال معرضون للخطر" : "No at-risk workers"}
              </p>
            ) : (
              data.atRiskWorkers.slice(0, 5).map((worker, i) => (
                <motion.div
                  key={worker.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="size-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: `hsl(${worker.hue}, 70%, 50%)` }}
                    >
                      {worker.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        {locale === "ar" ? worker.nameAr : worker.name}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        {worker.plan} · {worker.daysUntilExpiry}d {locale === "ar" ? "متبقي" : "left"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[9px] bg-amber-500/10 text-amber-600">
                    {worker.daysUntilExpiry <= 3 ? "🔴" : worker.daysUntilExpiry <= 7 ? "🟡" : "🟢"}
                  </Badge>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
