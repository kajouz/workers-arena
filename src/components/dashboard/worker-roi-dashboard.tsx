"use client";

import { useState } from "react";
import { useLocaleRouter } from "@/components/i18n/link";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shiftRoiMonth } from "@/lib/data/worker-roi";
import { formatNumber } from "@/lib/utils";
import type { WorkerRoiReport } from "@/lib/data/repo";
import type { WorkerRoi } from "@/lib/data/worker-roi";

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function GradeBadge({ grade, count }: { grade: string; count: number }) {
  if (count === 0) return null;
  const color =
    grade === "emergency"
      ? "danger"
      : grade === "gold"
        ? "premium"
        : grade === "silver"
          ? "default"
          : "secondary";
  return (
    <Badge variant={color as "default"} className="text-[10px]">
      {grade} ×{count}
    </Badge>
  );
}

/** Minimal inline spark bar — no charting library. */
function SparkBar({ series, pick }: { series: WorkerRoi[]; pick: (r: WorkerRoi) => number }) {
  const values = series.map(pick);
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-brand-500/30 rounded-t"
          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
          title={`${series[i].month.key}: ${formatNumber(v)}`}
        />
      ))}
    </div>
  );
}

export function WorkerRoiDashboard({ report }: { report: WorkerRoiReport | null }) {
  const { t } = useLocale();
  const router = useLocaleRouter();
  const [month, setMonth] = useState(report?.month.key ?? "");

  const roi = report?.roi;
  const series = report?.series ?? [];
  const total = report?.total;

  const navigateMonth = (delta: number) => {
    const next = shiftRoiMonth(month, delta);
    setMonth(next);
    router.push(`/dashboard/roi?month=${next}`);
  };

  if (!roi) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">{t("roi.title")}</h1>
        <p className="text-muted-foreground">No data available for this month.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header + month picker */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("roi.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {roi.month.key}
            {report?.plan && ` · ${report.plan} plan`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>
            ←
          </Button>
          <span className="text-sm font-mono min-w-[6rem] text-center">{month}</span>
          <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>
            →
          </Button>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={t("roi.returnMultiple")}
          value={roi.returnMultiple !== null ? `${roi.returnMultiple}×` : "—"}
          hint={roi.netMultiple !== null ? `${roi.netMultiple}× net` : undefined}
          accent
        />
        <StatCard
          label={t("roi.gmv")}
          value={money(roi.gmvMinor)}
          hint={roi.pipelineGmvMinor > 0 ? `+${money(roi.pipelineGmvMinor)} pipeline` : undefined}
        />
        <StatCard
          label={t("roi.earnings")}
          value={money(roi.earningsMinor)}
          hint={`fee ${money(roi.effectiveFeesMinor)}${roi.rebatesMinor > 0 ? ` (−${money(roi.rebatesMinor)} rebate)` : ""}`}
        />
        <StatCard
          label={t("roi.totalSpend")}
          value={money(roi.totalSpendMinor)}
          hint={`leads ${money(roi.leadSpendMinor)} + sub ${money(roi.subscriptionCostMinor)}`}
        />
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("roi.funnel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="font-semibold">{roi.quotesSent} {t("roi.quotesSent")}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{roi.jobsWon} {t("roi.jobsWon")}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{roi.jobsCompleted} {t("roi.jobsCompleted")}</span>
            {roi.winRatePct !== null && (
              <Badge variant="success" className="ml-2">{roi.winRatePct}% win rate</Badge>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{t("roi.leadsBought")}:</span>{" "}
              {roi.leadsBought}
              <div className="flex gap-1 mt-1">
                {(Object.entries(roi.leadsBoughtByGrade) as [string, number][]).map(([g, c]) => (
                  <GradeBadge key={g} grade={g} count={c} />
                ))}
              </div>
            </div>
            <div>
              <span className="font-medium text-foreground">{t("roi.quotesFromLeads")}:</span>{" "}
              {roi.quotesSentFromLeads}/{roi.quotesSent}
            </div>
            <div>
              <span className="font-medium text-foreground">{t("roi.wonFromLeads")}:</span>{" "}
              {roi.jobsWonFromLeads}/{roi.jobsWon}
            </div>
            <div>
              <span className="font-medium text-foreground">{t("roi.gmvPerLead")}:</span>{" "}
              {roi.gmvPerLeadMinor !== null ? money(roi.gmvPerLeadMinor) : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6-month trend */}
      {series.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("roi.trend")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("roi.gmvTrend")}</p>
              <SparkBar series={series} pick={(r) => r.gmvMinor} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("roi.spendTrend")}</p>
              <SparkBar series={series} pick={(r) => r.totalSpendMinor} />
            </div>

            {/* Period summary */}
            {total && (
              <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">{t("roi.periodGmv")}:</span>{" "}
                  <span className="font-semibold">{money(total.gmvMinor)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("roi.periodSpend")}:</span>{" "}
                  <span className="font-semibold">{money(total.totalSpendMinor)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("roi.periodMultiple")}:</span>{" "}
                  <span className="font-semibold">{total.returnMultiple !== null ? `${total.returnMultiple}×` : "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("roi.periodJobs")}:</span>{" "}
                  <span className="font-semibold">{total.jobsCompleted} / {total.jobsWon} won</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cost breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("roi.costBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t("roi.leadSpend")}</p>
              <p className="font-semibold">{roi.leadSpendCredits} credits ({money(roi.leadSpendMinor)})</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("roi.subscriptionCost")}</p>
              <p className="font-semibold">{money(roi.subscriptionCostMinor)}/mo</p>
              {roi.subscriptionPaidMinor > 0 && (
                <p className="text-[11px] text-muted-foreground">invoiced {money(roi.subscriptionPaidMinor)}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("roi.platformFees")}</p>
              <p className="font-semibold">{money(roi.feesMinor)}</p>
              {roi.rebatesMinor > 0 && (
                <p className="text-[11px] text-emerald-600">−{money(roi.rebatesMinor)} rebate</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
