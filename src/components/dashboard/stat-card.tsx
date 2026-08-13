"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "./charts";
import { formatNumber } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  trend,
  spark,
  color = "#f97316",
  index = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  spark?: number[];
  color?: string;
  index?: number;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
    >
      <Card className="relative overflow-hidden p-5 transition-shadow hover:shadow-lift">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
          </div>
          <span
            className="flex size-10 items-center justify-center rounded-xl text-white"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          {spark && spark.length > 1 && <Sparkline data={spark} color={color} />}
          {trend != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
              }`}
            >
              {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
