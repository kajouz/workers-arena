"use client";

import { useEffect, useState } from "react";
import {
  FlaskConical,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
  MousePointerClick,
  Target,
  Award,
  Plus,
  Play,
  Pause,
  StopCircle,
} from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useABTesting, DEFAULT_EXPERIMENTS, type ABExperiment } from "@/hooks/use-ab-testing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCompact } from "@/lib/utils";

export function ABTestingDashboard() {
  const { locale, t } = useLocale();
  const {
    experiments,
    registerExperiment,
    getExperimentResults,
  } = useABTesting();

  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);

  // Register default experiments on mount
  useEffect(() => {
    DEFAULT_EXPERIMENTS.forEach((exp) => registerExperiment(exp));
  }, [registerExperiment]);

  const results = selectedExperiment ? getExperimentResults(selectedExperiment) : null;

  const getStatusColor = (status: ABExperiment["status"]) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      case "paused":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      case "ended":
        return "bg-ink-500/10 text-ink-500 dark:text-ink-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-ink-900 dark:text-ink-50 flex items-center gap-2">
            <FlaskConical className="size-6 text-violet-500" />
            {locale === "ar" ? "اختبار A/B" : "A/B Testing"}
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "قارن بين الإعلانات المختلفة وحسّن الأداء" : "Compare ad variants and optimize performance"}
          </p>
        </div>
        <Button>
          <Plus className="size-4 mr-2" />
          {locale === "ar" ? "تجربة جديدة" : "New Experiment"}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-500">{locale === "ar" ? "التجارب" : "Experiments"}</p>
                <p className="mt-1 text-2xl font-black text-ink-900 dark:text-ink-50">{experiments.length}</p>
              </div>
              <FlaskConical className="size-5 text-violet-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-500">{locale === "ar" ? "النشطة" : "Active"}</p>
                <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {experiments.filter((e) => e.status === "active").length}
                </p>
              </div>
              <Play className="size-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-500">{locale === "ar" ? "إجمالي الظهور" : "Total Impressions"}</p>
                <p className="mt-1 text-2xl font-black text-brand-600 dark:text-brand-400">
                  {formatCompact(
                    experiments.reduce((s, e) =>
                      s + Object.values(e.metrics.impressions).reduce((a, b) => a + b, 0), 0
                    )
                  )}
                </p>
              </div>
              <Users className="size-5 text-brand-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-500">{locale === "ar" ? "إجمالي النقرات" : "Total Clicks"}</p>
                <p className="mt-1 text-2xl font-black text-orange-600 dark:text-orange-400">
                  {formatCompact(
                    experiments.reduce((s, e) =>
                      s + Object.values(e.metrics.clicks).reduce((a, b) => a + b, 0), 0
                    )
                  )}
                </p>
              </div>
              <MousePointerClick className="size-5 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Experiments List & Results */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Experiments List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{locale === "ar" ? "التجارب" : "Experiments"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {experiments.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => setSelectedExperiment(exp.id)}
                  className={cn(
                    "w-full p-4 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50",
                    selectedExperiment === exp.id && "bg-violet-50 dark:bg-violet-950/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-ink-900 dark:text-ink-50 truncate">{exp.name}</p>
                      <p className="mt-0.5 text-xs text-ink-400 truncate">{exp.description}</p>
                    </div>
                    <Badge className={cn("shrink-0 text-[10px]", getStatusColor(exp.status))}>
                      {exp.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-ink-400">
                    <span>{exp.variants.length} variants</span>
                    <span>·</span>
                    <span>
                      {formatCompact(
                        Object.values(exp.metrics.impressions).reduce((a, b) => a + b, 0)
                      )} views
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedExperiment
                ? experiments.find((e) => e.id === selectedExperiment)?.name
                : locale === "ar" ? "اختر تجربة" : "Select an experiment"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedExperiment || !results ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical className="size-12 text-ink-300 dark:text-ink-600" />
                <p className="mt-4 text-sm text-ink-500">
                  {locale === "ar" ? "اختر تجربة لعرض النتائج" : "Select an experiment to view results"}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Winner Banner */}
                {results.winner && results.totalImpressions > 0 && (
                  <div className="rounded-xl border-2 border-dashed border-emerald-400/50 bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
                        <Award className="size-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {locale === "ar" ? "الlander متقدم" : "Leading Variant"}: {results.winner.variant.name}
                        </p>
                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                          CTR: {results.winner.ctr.toFixed(2)}% · {results.winner.impressions} impressions
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Variants Comparison */}
                <div className="space-y-4">
                  {results.variants.map((variant, i) => {
                    const isWinner = variant.variant.id === results.winner?.variant.id && results.totalImpressions > 0;
                    const maxImpressions = Math.max(...results.variants.map((v) => v.impressions));
                    const barWidth = maxImpressions > 0 ? (variant.impressions / maxImpressions) * 100 : 0;

                    return (
                      <div
                        key={variant.variant.id}
                        className={cn(
                          "rounded-xl border p-4 transition-all",
                          isWinner
                            ? "border-emerald-400/50 bg-emerald-50/30 dark:bg-emerald-950/20"
                            : "border-ink-200 dark:border-ink-800"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-ink-900 dark:text-ink-50">
                                {variant.variant.name}
                              </span>
                              {isWinner && (
                                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px]">
                                  Winner
                                </Badge>
                              )}
                              <span className="text-xs text-ink-400">
                                ({variant.variant.weight}% traffic)
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isWinner
                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
                                    : "bg-gradient-to-r from-brand-500 to-violet-500"
                                )}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="mt-4 grid grid-cols-4 gap-4">
                          <div className="text-center">
                            <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                              {formatCompact(variant.impressions)}
                            </p>
                            <p className="text-[10px] text-ink-400">{locale === "ar" ? "ظهور" : "Impressions"}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                              {formatCompact(variant.clicks)}
                            </p>
                            <p className="text-[10px] text-ink-400">{locale === "ar" ? "نقرات" : "Clicks"}</p>
                          </div>
                          <div className="text-center">
                            <p className={cn(
                              "text-lg font-black",
                              variant.ctr > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink-400"
                            )}>
                              {variant.ctr.toFixed(2)}%
                            </p>
                            <p className="text-[10px] text-ink-400">CTR</p>
                          </div>
                          <div className="text-center">
                            <p className={cn(
                              "text-lg font-black",
                              variant.conversionRate > 0 ? "text-brand-600 dark:text-brand-400" : "text-ink-400"
                            )}>
                              {variant.conversionRate.toFixed(2)}%
                            </p>
                            <p className="text-[10px] text-ink-400">{locale === "ar" ? "التحويل" : "Conv."}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Statistical Significance Note */}
                {results.totalImpressions > 0 && (
                  <div className="rounded-xl bg-ink-50 p-4 text-center dark:bg-ink-800/50">
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {results.totalImpressions < 1000
                        ? locale === "ar"
                          ? `يحتاج ${1000 - results.totalImpressions} ظهور إضافي للحسم الإحصائي`
                          : `${1000 - results.totalImpressions} more impressions needed for statistical significance`
                        : locale === "ar"
                        ? "النتائج ذات دلالة إحصائية"
                        : "Results are statistically significant"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
