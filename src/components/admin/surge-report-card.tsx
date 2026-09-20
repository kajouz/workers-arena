"use client";

/**
 * Phase 2 — Emergency surge evaluation card (admin revenue settings).
 *
 * Renders the 30-day cohort report from `computeSurgeReport` so the 1.5×
 * emergency dispatch premium can be judged with real data before being
 * tuned: how many emergency leads were shown, how many were bought, what
 * the premium earned net of refunds, and a deterministic verdict.
 */

import Link from "next/link";
import { AlertTriangle, Scale } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/admin/lead-quality-charts";
import type { SurgeReport, SurgeVerdictCode } from "@/lib/data/surge-report";

/** Tailwind intent per verdict code (variants that exist on Badge). */
const VERDICT_BADGE: Record<SurgeVerdictCode, { variant: "success" | "secondary" | "solid" | "outline" | "danger" }> = {
  healthy: { variant: "success" },
  watch: { variant: "secondary" },
  overpriced: { variant: "solid" },
  "quality-risk": { variant: "danger" },
  "insufficient-data": { variant: "outline" },
};

export function SurgeReportCard({ report }: { report: SurgeReport | null }) {
  const { locale, t } = useLocale();

  if (!report) return null;
  const { summary, verdict, goldBaseline, weeks, multipliers } = report;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Scale className="h-5 w-5" />
          {t("leadMarket.surgeTitle")}
          <Badge {...VERDICT_BADGE[verdict.code]} className="font-medium">
            {t(`leadMarket.surgeVerdict.${verdict.code}`)}
          </Badge>
        </CardTitle>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.surgeSubtitle", { days: report.windowDays })}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline cohort numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label={t("leadMarket.surgeOffers")}
            value={String(summary.offers)}
            hint={t("leadMarket.surgePurchased", { count: summary.purchased })}
          />
          <Metric
            label={t("leadMarket.surgeConversion")}
            value={`${summary.conversionPct}%`}
            hint={t("leadMarket.surgeGoldBaseline", { pct: goldBaseline.conversionPct, count: goldBaseline.offers })}
          />
          <Metric
            label={t("leadMarket.surgeMultiplier")}
            value={`${summary.avgMultiplier}×`}
            hint={t("leadMarket.surgeTargetMultiplier")}
          />
          <Metric
            label={t("leadMarket.surgeNetPremium")}
            value={String(summary.netPremiumCredits)}
            hint={t("leadMarket.surgeGrossPremium", { gross: summary.premiumCredits, refunded: summary.refundedPremiumCredits })}
          />
        </div>

        {/* Refund rates — the quality half of the evaluation */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label={t("leadMarket.surgeRefundRate")}
            value={`${summary.approvedRefundRatePct}%`}
            hint={t("leadMarket.surgeRefundCredits", { credits: summary.refundRequests > 0 ? summary.approvedRefunds : 0, requests: summary.refundRequests })}
          />
          <Metric
            label={t("leadMarket.surgePendingRefunds")}
            value={String(summary.pendingRefunds)}
            hint={t("leadMarket.surgePendingRefundsHint")}
          />
          <Metric
            label={t("leadMarket.surgeBaseVsPremium")}
            value={`${summary.baseCredits}/${summary.premiumCredits}`}
            hint={t("leadMarket.surgeBaseVsPremiumHint")}
          />
        </div>

        {/* Weekly conversion trend */}
        {weeks.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.surgeWeeklyTrend")}</p>
            <Sparkline values={weeks.map((w) => w.conversionPct)} max={100} barHeight={20} />
            <div className="flex justify-between text-[11px] text-ink-400">
              <span>{weeks[0]!.weekStart}</span>
              <span>
                {t("leadMarket.surgeWeekSpan", {
                  first: weeks[0]!.conversionPct,
                  last: weeks[weeks.length - 1]!.conversionPct,
                })}
              </span>
              <span>{weeks[weeks.length - 1]!.weekKey}</span>
            </div>
          </div>
        )}

        {/* Multiplier audit — is the locked pricing actually the surge? */}
        <div className="rounded-lg border border-ink-100 p-3 dark:border-ink-800">
          <p className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.surgeMultiplierAudit")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500 dark:text-ink-400">
            <span>{t("leadMarket.surgeBucketFlat", { count: multipliers.exactly1 })}</span>
            <span>{t("leadMarket.surgeBucketLow", { count: multipliers.upTo1_3 })}</span>
            <span>{t("leadMarket.surgeBucketSurge", { count: multipliers.upTo1_6 })}</span>
            <span>{t("leadMarket.surgeBucketHigh", { count: multipliers.above1_6 })}</span>
          </div>
        </div>

        {/* The verdict's numbers, spelled out */}
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {t(`leadMarket.surgeVerdictReason.${verdict.code}`, {
            conversion: verdict.conversionPct,
            refunds: verdict.approvedRefundRatePct,
            offers: verdict.offers,
            purchases: verdict.purchases,
          })}
        </p>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-400">
            {t("leadMarket.surgeWindow", { from: formatDate(report.from), to: formatDate(report.to) })}
          </span>
          <Link
            href="/api/admin/revenue/surge-report?format=csv"
            className="font-medium text-brand-600 underline hover:text-brand-700 dark:text-brand-400"
            prefetch={false}
          >
            {t("leadMarket.surgeExportCsv")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-ink-100 p-3 dark:border-ink-800">
      <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-400">{hint}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
