"use client";

import { motion } from "framer-motion";
import {
  CalendarCheck,
  UserPlus,
  ShieldCheck,
  Wallet,
  Clock,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatCompact } from "@/lib/utils";

interface TodaySummaryProps {
  newWorkers: number;
  pendingVerifications: number;
  pendingPayouts: number;
  pendingManualPayments: number;
  pendingActions: number;
  estimatedRevenue: number;
  locale?: string;
}

export function TodaySummary({
  newWorkers,
  pendingVerifications,
  pendingPayouts,
  pendingManualPayments,
  pendingActions,
  estimatedRevenue,
  locale = "en",
}: TodaySummaryProps) {
  const items = [
    {
      label: locale === "ar" ? "عامل جديد اليوم" : "New Workers Today",
      value: newWorkers,
      icon: <UserPlus className="size-5" />,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: locale === "ar" ? "توثيق معلق" : "Pending Verifications",
      value: pendingVerifications,
      icon: <ShieldCheck className="size-5" />,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      urgent: pendingVerifications > 0,
    },
    {
      label: locale === "ar" ? "صرف معلق" : "Pending Payouts",
      value: pendingPayouts,
      icon: <Wallet className="size-5" />,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: locale === "ar" ? "مدفوعات يدوية" : "Manual Payments",
      value: pendingManualPayments,
      icon: <Clock className="size-5" />,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
  ];

  return (
    <Card className="border-brand-500/20 bg-gradient-to-br from-brand-500/5 to-transparent">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="size-5 text-brand-500" />
          {locale === "ar" ? "ملخص اليوم" : "Today's Summary"}
        </CardTitle>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <TrendingUp className="size-3" />
          {locale === "ar" ? "مباشر" : "Live"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
            >
              <div className={`mb-2 inline-flex rounded-lg p-2 ${item.bgColor}`}>
                <span className={item.color}>{item.icon}</span>
              </div>
              <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
                {formatCompact(item.value)}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-ink-500 dark:text-ink-400">
                {item.label}
              </p>
              {item.urgent && (
                <span className="absolute right-2 top-2 size-2 animate-pulse rounded-full bg-amber-500" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Revenue today */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="size-4 text-brand-500" />
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              {locale === "ar" ? "الإيرادات اليومية" : "Estimated Revenue Today"}
            </span>
          </div>
          <span className="text-lg font-black text-brand-600 dark:text-brand-400">
            {formatPrice(estimatedRevenue / 100, "SAR", locale as "en" | "ar")}
          </span>
        </div>

        {/* Pending actions alert */}
        {pendingActions > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2.5">
            <Clock className="size-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {locale === "ar"
                ? `${pendingActions} إجراءات معلقة تحتاج مراجعتك`
                : `${pendingActions} pending actions need your attention`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
