"use client";

import { useState, useEffect } from "react";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SLAMetric {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: "hours" | "minutes" | "percent";
  status: "good" | "warning" | "breach";
  trend: "up" | "down" | "stable";
}

interface SLABreach {
  id: string;
  bookingNumber: string;
  workerName: string;
  customerName: string;
  breachType: "response" | "completion" | "followup";
  elapsed: number;
  target: number;
  unit: "hours" | "days";
  severity: "low" | "medium" | "high" | "critical";
}

interface SLAMonitorProps {
  className?: string;
}

/**
 * SLA Monitoring Dashboard component
 * Track response times, breach alerts, escalation rules
 */
export function SLAMonitor({ className }: SLAMonitorProps) {
  const [metrics, setMetrics] = useState<SLAMetric[]>([
    {
      id: "response",
      name: "Avg Response Time",
      target: 24,
      current: 18.5,
      unit: "hours",
      status: "good",
      trend: "down",
    },
    {
      id: "completion",
      name: "Completion Rate",
      target: 95,
      current: 92.3,
      unit: "percent",
      status: "warning",
      trend: "up",
    },
    {
      id: "sla_compliance",
      name: "SLA Compliance",
      target: 98,
      current: 97.8,
      unit: "percent",
      status: "warning",
      trend: "stable",
    },
    {
      id: "first_contact",
      name: "First Contact Resolution",
      target: 80,
      current: 85.2,
      unit: "percent",
      status: "good",
      trend: "up",
    },
  ]);

  const [breaches, setBreaches] = useState<SLABreach[]>([
    {
      id: "b1",
      bookingNumber: "BK-1045",
      workerName: "Khaled Al-Harbi",
      customerName: "Sara Customer",
      breachType: "response",
      elapsed: 46,
      target: 24,
      unit: "hours",
      severity: "critical",
    },
    {
      id: "b2",
      bookingNumber: "BK-1042",
      workerName: "Ali Hassan",
      customerName: "Ahmed",
      breachType: "completion",
      elapsed: 3,
      target: 2,
      unit: "days",
      severity: "high",
    },
    {
      id: "b3",
      bookingNumber: "BK-1038",
      workerName: "Omar Al-Mutairi",
      customerName: "Noor E.",
      breachType: "response",
      elapsed: 30,
      target: 24,
      unit: "hours",
      severity: "medium",
    },
  ]);

  const [loading, setLoading] = useState(false);

  const refreshMetrics = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // In production, this would fetch real metrics
    setLoading(false);
  };

  const getSeverityColor = (severity: SLABreach["severity"]) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300";
    }
  };

  const getStatusColor = (status: SLAMetric["status"]) => {
    switch (status) {
      case "good":
        return "text-green-600";
      case "warning":
        return "text-yellow-600";
      case "breach":
        return "text-red-600";
    }
  };

  const formatElapsed = (elapsed: number, unit: "hours" | "days") => {
    if (unit === "hours") {
      return `${elapsed}h`;
    }
    return `${elapsed}d`;
  };

  const formatTarget = (target: number, unit: SLAMetric["unit"]) => {
    if (unit === "percent") {
      return `${target}%`;
    }
    if (unit === "hours") {
      return `${target}h`;
    }
    return `${target}min`;
  };

  const calculatePercentage = (current: number, target: number) => {
    return Math.min(100, (current / target) * 100);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Metrics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-500 dark:text-ink-400">{metric.name}</span>
              <div className="flex items-center gap-1">
                {metric.trend === "up" && (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                )}
                {metric.trend === "down" && (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                )}
                {metric.trend === "stable" && (
                  <ArrowRight className="w-4 h-4 text-ink-400 dark:text-ink-500" />
                )}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className={cn("text-2xl font-bold", getStatusColor(metric.status))}>
                {metric.unit === "percent" ? `${metric.current}%` : `${metric.current}h`}
              </span>
              <span className="text-sm text-ink-500 dark:text-ink-400 mb-1">
                / {formatTarget(metric.target, metric.unit)}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  metric.status === "good" && "bg-green-500",
                  metric.status === "warning" && "bg-yellow-500",
                  metric.status === "breach" && "bg-red-500"
                )}
                style={{
                  width: `${calculatePercentage(metric.current, metric.target)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Breaches list */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-ink-900 dark:text-ink-50">SLA Breaches</h3>
          </div>
          <button
            onClick={refreshMetrics}
            disabled={loading}
            className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-ink-500 dark:text-ink-400", loading && "animate-spin")} />
          </button>
        </div>

        <div className="divide-y max-h-[300px] overflow-y-auto">
          {breaches.length === 0 ? (
            <div className="p-8 text-center text-ink-500 dark:text-ink-400">
              <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
              <p className="mt-2 font-medium text-green-700">No SLA breaches</p>
              <p className="text-sm">All metrics are within targets</p>
            </div>
          ) : (
            breaches.map((breach) => (
              <div
                key={breach.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 border-l-4",
                  getSeverityColor(breach.severity)
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-900 dark:text-ink-50">{breach.bookingNumber}</span>
                    <span className="text-sm text-ink-500 dark:text-ink-400">•</span>
                    <span className="text-sm text-ink-500 dark:text-ink-400 capitalize">{breach.breachType}</span>
                  </div>
                  <p className="text-sm text-ink-600 dark:text-ink-300">
                    {breach.workerName} → {breach.customerName}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium text-ink-900 dark:text-ink-50">
                      {formatElapsed(breach.elapsed, breach.unit)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Target: {formatElapsed(breach.target, breach.unit)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 hover:bg-white/50 rounded-lg">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {breaches.length > 0 && (
          <div className="px-4 py-2 border-t bg-ink-50 dark:bg-ink-950">
            <button className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all breaches →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
