"use client";

import { useState, useEffect } from "react";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Bell,
  BellOff,
  ChevronRight,
  RefreshCw,
  Info
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

interface Anomaly {
  id: string;
  type: "spike" | "drop" | "pattern" | "threshold";
  metric: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: Date;
  currentValue: number;
  expectedValue: number;
  unit: string;
  acknowledged: boolean;
  details?: string;
}

interface AnomalyDetectionProps {
  className?: string;
}

/**
 * Anomaly Detection component
 * Highlight unusual spikes/drops in bookings, revenue, churn
 */
export function AnomalyDetection({ className }: AnomalyDetectionProps) {
  const { locale } = useLocale();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([
    {
      id: "a1",
      type: "spike",
      metric: "New Registrations",
      description: "250% increase in worker registrations today",
      severity: "high",
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      currentValue: 45,
      expectedValue: 18,
      unit: "workers",
      acknowledged: false,
      details: "Possible viral social media post driving registrations",
    },
    {
      id: "a2",
      type: "drop",
      metric: "Booking Conversion",
      description: "35% drop in search-to-booking conversion rate",
      severity: "critical",
      detectedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      currentValue: 12.5,
      expectedValue: 19.2,
      unit: "%",
      acknowledged: false,
      details: "May be related to recent UI changes or pricing update",
    },
    {
      id: "a3",
      type: "pattern",
      metric: "Review Distribution",
      description: "Unusual pattern: 80% of new reviews are 5-star",
      severity: "medium",
      detectedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      currentValue: 80,
      expectedValue: 45,
      unit: "%",
      acknowledged: true,
      details: "Could indicate review manipulation or genuine improvement",
    },
    {
      id: "a4",
      type: "threshold",
      metric: "Payment Failures",
      description: "Payment failure rate exceeded 5% threshold",
      severity: "high",
      detectedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      currentValue: 7.2,
      expectedValue: 3.5,
      unit: "%",
      acknowledged: false,
      details: "Check payment gateway status and recent transaction errors",
    },
  ]);

  const [loading, setLoading] = useState(false);

  const refreshAnomalies = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoading(false);
  };

  const acknowledgeAnomaly = (id: string) => {
    setAnomalies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  const dismissAnomaly = (id: string) => {
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
  };

  const getSeverityColor = (severity: Anomaly["severity"]) => {
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

  const getTypeIcon = (type: Anomaly["type"]) => {
    switch (type) {
      case "spike":
        return <TrendingUp className="w-5 h-5" />;
      case "drop":
        return <TrendingDown className="w-5 h-5" />;
      case "pattern":
        return <Minus className="w-5 h-5" />;
      case "threshold":
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: Anomaly["type"]) => {
    switch (type) {
      case "spike":
        return "text-orange-500";
      case "drop":
        return "text-red-500";
      case "pattern":
        return "text-blue-500";
      case "threshold":
        return "text-yellow-500";
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return formatDate(date, locale);
  };

  const unacknowledgedCount = anomalies.filter((a) => !a.acknowledged).length;

  return (
    <div className={cn("bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Anomaly Detection</h3>
        </div>
        <div className="flex items-center gap-2">
          {unacknowledgedCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full dark:bg-red-500/15 dark:text-red-300">
              {unacknowledgedCount} new
            </span>
          )}
          <button
            onClick={refreshAnomalies}
            disabled={loading}
            className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-ink-500 dark:text-ink-400", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Anomalies list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {anomalies.length === 0 ? (
          <div className="p-8 text-center text-ink-500 dark:text-ink-400">
            <Info className="w-8 h-8 mx-auto text-ink-300 dark:text-ink-600" />
            <p className="mt-2">No anomalies detected</p>
            <p className="text-sm">All metrics are within normal ranges</p>
          </div>
        ) : (
          anomalies.map((anomaly) => (
            <div
              key={anomaly.id}
              className={cn(
                "px-4 py-3 transition-colors",
                !anomaly.acknowledged && "bg-orange-50/50"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5", getTypeColor(anomaly.type))}>
                  {getTypeIcon(anomaly.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-full",
                      getSeverityColor(anomaly.severity)
                    )}>
                      {anomaly.severity}
                    </span>
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      {formatTime(anomaly.detectedAt)}
                    </span>
                  </div>
                  <p className="font-medium text-ink-900 dark:text-ink-50 mt-1">{anomaly.metric}</p>
                  <p className="text-sm text-ink-600 dark:text-ink-300">{anomaly.description}</p>
                  
                  {/* Values */}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-ink-500 dark:text-ink-400">Current: </span>
                      <span className="font-medium text-ink-900 dark:text-ink-50">
                        {anomaly.currentValue}{anomaly.unit === "%" ? "%" : ` ${anomaly.unit}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-500 dark:text-ink-400">Expected: </span>
                      <span className="font-medium text-ink-900 dark:text-ink-50">
                        {anomaly.expectedValue}{anomaly.unit === "%" ? "%" : ` ${anomaly.unit}`}
                      </span>
                    </div>
                  </div>

                  {anomaly.details && (
                    <p className="text-xs text-ink-500 dark:text-ink-400 mt-2">{anomaly.details}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {!anomaly.acknowledged && (
                      <button
                        onClick={() => acknowledgeAnomaly(anomaly.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-ink-700 dark:text-ink-200 bg-ink-100 dark:bg-ink-800 rounded-lg hover:bg-ink-200 dark:hover:bg-ink-800"
                      >
                        <BellOff className="w-3 h-3" />
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => dismissAnomaly(anomaly.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-800 bg-red-50 rounded-lg hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300"
                    >
                      Dismiss
                    </button>
                    <button className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-800 bg-blue-50 rounded-lg hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300">
                      <ChevronRight className="w-3 h-3" />
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
