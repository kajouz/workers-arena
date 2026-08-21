"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ArrowRight, Users, Search, Eye, Phone, Calendar, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/utils";

interface FunnelStage {
  label: string;
  labelAr: string;
  icon: React.ReactNode;
  value: number;
  color: string;
  bgColor: string;
}

interface AcquisitionFunnelProps {
  data: {
    visitors: number;
    searches: number;
    profileViews: number;
    contacts: number;
    bookings: number;
    completed: number;
  };
  previousData?: {
    visitors: number;
    searches: number;
    profileViews: number;
    contacts: number;
    bookings: number;
    completed: number;
  };
  locale?: string;
}

export function AcquisitionFunnel({
  data,
  previousData,
  locale = "en",
}: AcquisitionFunnelProps) {
  const stages: FunnelStage[] = useMemo(
    () => [
      {
        label: "Visitors",
        labelAr: "الزوار",
        icon: <Users className="size-4" />,
        value: data.visitors,
        color: "text-blue-600",
        bgColor: "bg-blue-500",
      },
      {
        label: "Searches",
        labelAr: "البحث",
        icon: <Search className="size-4" />,
        value: data.searches,
        color: "text-indigo-600",
        bgColor: "bg-indigo-500",
      },
      {
        label: "Profile Views",
        labelAr: "عرض الملفات",
        icon: <Eye className="size-4" />,
        value: data.profileViews,
        color: "text-violet-600",
        bgColor: "bg-violet-500",
      },
      {
        label: "Contacts",
        labelAr: "التواصل",
        icon: <Phone className="size-4" />,
        value: data.contacts,
        color: "text-purple-600",
        bgColor: "bg-purple-500",
      },
      {
        label: "Bookings",
        labelAr: "الحجوزات",
        icon: <Calendar className="size-4" />,
        value: data.bookings,
        color: "text-brand-600",
        bgColor: "bg-brand-500",
      },
      {
        label: "Completed",
        labelAr: "مكتملة",
        icon: <CheckCircle2 className="size-4" />,
        value: data.completed,
        color: "text-emerald-600",
        bgColor: "bg-emerald-500",
      },
    ],
    [data]
  );

  // Calculate conversion rates
  const conversions = useMemo(() => {
    return stages.map((stage, i) => {
      if (i === 0) return { rate: 100, dropoff: 0 };
      const prevValue = stages[i - 1].value;
      const rate = prevValue > 0 ? (stage.value / prevValue) * 100 : 0;
      const dropoff = prevValue > 0 ? ((prevValue - stage.value) / prevValue) * 100 : 0;
      return { rate, dropoff };
    });
  }, [stages]);

  // Calculate overall conversion
  const overallConversion = data.visitors > 0 ? (data.completed / data.visitors) * 100 : 0;

  // Calculate changes vs previous period
  const getChange = (current: number, previous?: number) => {
    if (!previous) return null;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    return change;
  };

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-5 text-brand-500" />
          {locale === "ar" ? "قمع التحويل" : "Acquisition Funnel"}
        </CardTitle>
        <Badge variant="success" className="gap-1 text-[10px]">
          {overallConversion.toFixed(1)}% {locale === "ar" ? "التحويل" : "conversion"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visual funnel */}
        <div className="relative space-y-2">
          {stages.map((stage, i) => {
            const widthPercent = (stage.value / maxValue) * 100;
            const change = previousData
              ? getChange(
                  stage.value,
                  Object.values(previousData)[i] as number
                )
              : null;

            return (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                {/* Icon */}
                <div className={`size-8 shrink-0 rounded-lg ${stage.bgColor}/10 flex items-center justify-center`}>
                  <span className={stage.color}>{stage.icon}</span>
                </div>

                {/* Bar */}
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                      {locale === "ar" ? stage.labelAr : stage.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        {formatCompact(stage.value)}
                      </span>
                      {change !== null && (
                        <Badge
                          variant={change >= 0 ? "success" : "danger"}
                          className="text-[9px]"
                        >
                          {change >= 0 ? (
                            <TrendingUp className="size-2.5" />
                          ) : (
                            <TrendingDown className="size-2.5" />
                          )}
                          {Math.abs(change).toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPercent}%` }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className={`h-full rounded-full ${stage.bgColor}`}
                    />
                  </div>
                </div>

                {/* Drop-off indicator */}
                {i > 0 && conversions[i].dropoff > 0 && (
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] text-red-500">
                      -{conversions[i].dropoff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Conversion arrows between stages */}
        <div className="flex items-center justify-center gap-1 pt-2">
          {stages.slice(0, -1).map((stage, i) => (
            <div key={i} className="flex items-center gap-1">
              <ArrowRight className="size-3 text-ink-300 dark:text-ink-600" />
              <span className="text-[10px] font-medium text-ink-400">
                {conversions[i + 1].rate.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
          <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "معدل التحويل" : "Conversion Rate"}
            </p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {overallConversion.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "أكبر انخفاض" : "Biggest Drop"}
            </p>
            <p className="text-lg font-black text-red-600 dark:text-red-400">
              {(() => {
                let maxDrop = 0;
                let maxDropStage = "";
                for (let i = 1; i < stages.length; i++) {
                  if (conversions[i].dropoff > maxDrop) {
                    maxDrop = conversions[i].dropoff;
                    maxDropStage = locale === "ar" ? stages[i].labelAr : stages[i].label;
                  }
                }
                return maxDrop > 0 ? `-${maxDrop.toFixed(0)}%` : "—";
              })()}
            </p>
          </div>
          <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "العملاء المكتملين" : "Completed"}
            </p>
            <p className="text-lg font-black text-ink-900 dark:text-ink-50">
              {formatCompact(data.completed)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
