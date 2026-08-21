"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3, Clock, Smartphone, Monitor, Globe, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/utils";

interface BehaviorData {
  sessionDuration: { avg: number; median: number; p95: number };
  bounceRate: number;
  peakHours: { hour: number; count: number }[];
  deviceBreakdown: { device: string; percentage: number }[];
  languageSplit: { language: string; percentage: number }[];
  searchToContactRatio: number;
  topPages: { path: string; views: number }[];
}

interface BehaviorAnalyticsProps {
  data: BehaviorData;
  locale?: string;
}

// Hour heatmap component
function HourHeatmap({ data, locale }: { data: { hour: number; count: number }[]; locale: string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Group by day of week (simulated - using hour as proxy)
  const hours = Array.from({ length: 24 }, (_, i) => {
    const found = data.find((d) => d.hour === i);
    return { hour: i, count: found?.count ?? 0 };
  });

  const getColor = (count: number) => {
    const intensity = count / maxCount;
    if (intensity > 0.8) return "bg-brand-600";
    if (intensity > 0.6) return "bg-brand-500";
    if (intensity > 0.4) return "bg-brand-400";
    if (intensity > 0.2) return "bg-brand-300";
    return "bg-brand-200 dark:bg-brand-800";
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-1">
        {hours.slice(0, 12).map((h) => (
          <div key={h.hour} className="text-center">
            <div className={`h-8 rounded-sm ${getColor(h.count)} transition-colors`} title={`${h.hour}:00 - ${h.count}`} />
            <span className="text-[8px] text-ink-400">{h.hour}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1">
        {hours.slice(12, 24).map((h) => (
          <div key={h.hour} className="text-center">
            <div className={`h-8 rounded-sm ${getColor(h.count)} transition-colors`} title={`${h.hour}:00 - ${h.count}`} />
            <span className="text-[8px] text-ink-400">{h.hour}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1 text-[9px] text-ink-400">
        <span>{locale === "ar" ? "منخفض" : "Low"}</span>
        <div className="flex gap-0.5">
          <div className="size-3 rounded-sm bg-brand-200 dark:bg-brand-800" />
          <div className="size-3 rounded-sm bg-brand-300" />
          <div className="size-3 rounded-sm bg-brand-400" />
          <div className="size-3 rounded-sm bg-brand-500" />
          <div className="size-3 rounded-sm bg-brand-600" />
        </div>
        <span>{locale === "ar" ? "مرتفع" : "High"}</span>
      </div>
    </div>
  );
}

export function BehaviorAnalytics({ data, locale = "en" }: BehaviorAnalyticsProps) {
  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="size-5 text-brand-500" />
          {locale === "ar" ? "تحليلات السلوك" : "Behavior Analytics"}
        </CardTitle>
        <Badge variant="outline" className="text-[10px]">
          {locale === "ar" ? "آخر 30 يوم" : "Last 30 days"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Session Duration */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <Clock className="size-4 text-blue-500" />
            {locale === "ar" ? "مدة الجلسة" : "Session Duration"}
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-blue-500/10 p-3 text-center"
            >
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {formatDuration(data.sessionDuration.avg)}
              </p>
              <p className="text-[10px] text-ink-500">{locale === "ar" ? "المتوسط" : "Average"}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-xl bg-indigo-500/10 p-3 text-center"
            >
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {formatDuration(data.sessionDuration.median)}
              </p>
              <p className="text-[10px] text-ink-500">{locale === "ar" ? "المتوسط" : "Median"}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl bg-violet-500/10 p-3 text-center"
            >
              <p className="text-2xl font-black text-violet-600 dark:text-violet-400">
                {formatDuration(data.sessionDuration.p95)}
              </p>
              <p className="text-[10px] text-ink-500">{locale === "ar" ? "٩٥٪" : "P95"}</p>
            </motion.div>
          </div>
        </div>

        {/* Bounce Rate & Search-to-Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "معدل الارتداد" : "Bounce Rate"}
            </p>
            <p className={`text-2xl font-black ${data.bounceRate > 60 ? "text-red-600" : data.bounceRate > 40 ? "text-amber-600" : "text-emerald-600"}`}>
              {data.bounceRate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {locale === "ar" ? "نسبة البحث للتواصل" : "Search→Contact"}
            </p>
            <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
              {data.searchToContactRatio.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Peak Hours Heatmap */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <Clock className="size-4 text-amber-500" />
            {locale === "ar" ? "ساعات الذروة" : "Peak Hours"}
          </h4>
          <HourHeatmap data={data.peakHours} locale={locale} />
        </div>

        {/* Device Breakdown */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <Smartphone className="size-4 text-emerald-500" />
            {locale === "ar" ? "تحليل الأجهزة" : "Device Breakdown"}
          </h4>
          <div className="space-y-2">
            {data.deviceBreakdown.map((device, i) => (
              <motion.div
                key={device.device}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <div className="size-8 shrink-0 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center">
                  {device.device === "mobile" ? (
                    <Smartphone className="size-4 text-ink-500" />
                  ) : device.device === "desktop" ? (
                    <Monitor className="size-4 text-ink-500" />
                  ) : (
                    <Globe className="size-4 text-ink-500" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-600 dark:text-ink-300 capitalize">
                      {device.device}
                    </span>
                    <span className="text-xs font-bold text-ink-900 dark:text-ink-50">
                      {device.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${device.percentage}%` }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className="h-full rounded-full bg-brand-500"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Language Split */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <Globe className="size-4 text-violet-500" />
            {locale === "ar" ? "توزيع اللغات" : "Language Split"}
          </h4>
          <div className="flex gap-2">
            {data.languageSplit.map((lang) => (
              <div
                key={lang.language}
                className="flex-1 rounded-xl bg-white/70 p-3 text-center dark:bg-ink-900/70"
              >
                <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                  {lang.percentage.toFixed(1)}%
                </p>
                <p className="text-[10px] font-medium uppercase text-ink-400">
                  {lang.language}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Top Pages */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            <TrendingUp className="size-4 text-brand-500" />
            {locale === "ar" ? "الصفحات الأكثر زيارة" : "Top Pages"}
          </h4>
          <div className="space-y-1.5">
            {data.topPages.slice(0, 5).map((page, i) => (
              <div
                key={page.path}
                className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 dark:bg-ink-900/70"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-ink-400">#{i + 1}</span>
                  <span className="text-xs font-medium text-ink-700 dark:text-ink-200">{page.path}</span>
                </div>
                <span className="text-xs font-bold text-ink-900 dark:text-ink-50">{formatCompact(page.views)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
