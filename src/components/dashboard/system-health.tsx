"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Server,
  Database,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HealthCheck {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: string; latencyMs: number };
    memory: { usedMB: number; totalMB: number; percentage: number };
    api: { avgResponseMs: number; errorRate: number; requestsLastHour: number };
    cron: { lastRun: string | null; status: string }[];
  };
}

const STATUS_CONFIG = {
  healthy: {
    icon: <CheckCircle2 className="size-4" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    label: "Healthy",
  },
  degraded: {
    icon: <AlertTriangle className="size-4" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Degraded",
  },
  down: {
    icon: <XCircle className="size-4" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Down",
  },
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function SystemHealthMonitor({ locale = "en" }: { locale?: string }) {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHealth();
    setRefreshing(false);
  };

  if (!health) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="size-5 animate-spin text-ink-400" />
        </CardContent>
      </Card>
    );
  }

  const overallConfig = STATUS_CONFIG[health.status];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="size-5 text-brand-500" />
          {locale === "ar" ? "صحة النظام" : "System Health"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={`${overallConfig.bgColor} ${overallConfig.color} gap-1`}>
            {overallConfig.icon}
            {overallConfig.label}
          </Badge>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg p-1.5 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <RefreshCw
              className={`size-3.5 text-ink-400 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Uptime */}
        <div className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
          <span className="text-xs text-ink-500">
            {locale === "ar" ? "وقت التشغيل" : "Uptime"}
          </span>
          <span className="text-sm font-bold text-ink-900 dark:text-ink-50">
            {formatUptime(health.uptime)}
          </span>
        </div>

        {/* Database */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
        >
          <div className="flex items-center gap-2">
            <Database className="size-4 text-blue-500" />
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
              {locale === "ar" ? "قاعدة البيانات" : "Database"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-500">{health.checks.database.latencyMs}ms</span>
            <Badge
              className={
                health.checks.database.status === "healthy"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-red-500/10 text-red-600"
              }
            >
              {health.checks.database.status === "healthy" ? "OK" : "Error"}
            </Badge>
          </div>
        </motion.div>

        {/* Memory */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-violet-500" />
              <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
                {locale === "ar" ? "الذاكرة" : "Memory"}
              </span>
            </div>
            <span className="text-xs text-ink-500">
              {health.checks.memory.usedMB}MB / {health.checks.memory.totalMB}MB
            </span>
          </div>
          {/* Memory bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${health.checks.memory.percentage}%` }}
              className={`h-full rounded-full ${
                health.checks.memory.percentage > 80
                  ? "bg-red-500"
                  : health.checks.memory.percentage > 60
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-ink-400">
            {health.checks.memory.percentage}%
          </p>
        </motion.div>

        {/* API Stats */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
        >
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-brand-500" />
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
              {locale === "ar" ? "API" : "API"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500">
              {health.checks.api.avgResponseMs}ms avg
            </span>
            <Badge
              className={
                health.checks.api.errorRate < 1
                  ? "bg-emerald-500/10 text-emerald-600"
                  : health.checks.api.errorRate < 5
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-red-500/10 text-red-600"
              }
            >
              {health.checks.api.errorRate}% errors
            </Badge>
          </div>
        </motion.div>

        {/* Requests last hour */}
        <div className="text-center text-[10px] text-ink-400">
          {locale === "ar"
            ? `${health.checks.api.requestsLastHour} طلب في الساعة الأخيرة`
            : `${health.checks.api.requestsLastHour} requests in the last hour`}
        </div>
      </CardContent>
    </Card>
  );
}
