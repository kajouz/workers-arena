"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Users, CalendarCheck, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/utils";

interface LiveMetrics {
  timestamp: string;
  responseMs: number;
  activeUsers: number;
  activeBookings: number;
  todaySummary: {
    newWorkers: number;
    pendingVerifications: number;
    pendingPayouts: number;
    pendingManualPayments: number;
    pendingActions: number;
    estimatedRevenue: number;
  };
}

export function LiveMetricsPanel({ locale = "en" }: { locale?: string }) {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-metrics");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setMetrics(data);
      setIsConnected(true);
      setLastUpdate(new Date());
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMetrics();
    setRefreshing(false);
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Pulsing indicator */}
      <div className="absolute right-4 top-4">
        <AnimatePresence>
          {isConnected ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <Wifi className="size-3 text-emerald-500" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1.5"
            >
              <span className="size-2 rounded-full bg-red-500" />
              <WifiOff className="size-3 text-red-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-5 text-brand-500" />
          {locale === "ar" ? "المؤشرات الحية" : "Live Metrics"}
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-[10px] text-ink-400">
              {locale === "ar" ? "آخر تحديث:" : "Updated:"}{" "}
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
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

      <CardContent>
        {metrics ? (
          <div className="space-y-4">
            {/* Real-time counters */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div
                key={metrics.activeUsers}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="rounded-xl bg-blue-500/10 p-3"
              >
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {locale === "ar" ? "مستخدمون نشطون" : "Active Users"}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-black text-blue-600 dark:text-blue-400">
                  {formatCompact(metrics.activeUsers)}
                </p>
              </motion.div>

              <motion.div
                key={metrics.activeBookings}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="rounded-xl bg-emerald-500/10 p-3"
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck className="size-4 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {locale === "ar" ? "حجوزات جارية" : "Active Bookings"}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCompact(metrics.activeBookings)}
                </p>
              </motion.div>
            </div>

            {/* Response time indicator */}
            <div className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
              <span className="text-xs text-ink-500">
                {locale === "ar" ? "زمن الاستجابة" : "Response Time"}
              </span>
              <Badge
                variant={metrics.responseMs < 500 ? "success" : metrics.responseMs < 1000 ? "default" : "danger"}
                className="text-[10px]"
              >
                {metrics.responseMs}ms
              </Badge>
            </div>

            {/* Connection status */}
            <div className="text-center text-[10px] text-ink-400">
              {locale === "ar"
                ? "يتحدث تلقائيًا كل 30 ثانية"
                : "Auto-refreshing every 30 seconds"}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="size-5 animate-spin text-ink-400" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
