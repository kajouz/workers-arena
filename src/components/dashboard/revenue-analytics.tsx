"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface SpendingEntry {
  date: string;
  credits: number;
  tokens: number;
  promoted: number;
  total: number;
}

interface ConversionMetrics {
  totalLeads: number;
  totalBookings: number;
  conversionRate: number;
  avgRevenuePerBooking: number;
  totalRevenue: number;
}

interface ROIByTool {
  tool: string;
  toolAr: string;
  spent: number;
  revenueGenerated: number;
  roi: number;
  usage: number;
}

interface WorkerAnalytics {
  spendingHistory: SpendingEntry[];
  conversion: ConversionMetrics;
  roiByTool: ROIByTool[];
  monthlyTrend: {
    currentMonth: number;
    previousMonth: number;
    change: number;
  };
  recommendations: string[];
  recommendationsAr: string[];
}

export function RevenueAnalyticsCard() {
  const [analytics, setAnalytics] = useState<WorkerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<
    "overview" | "spending" | "roi" | "recommendations"
  >("overview");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch("/api/worker/analytics");
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-gray-200 rounded" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const maxSpending = Math.max(
    ...analytics.spendingHistory.map((s) => s.total)
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium">Revenue Analytics</span>
          </div>
          <span className="text-sm opacity-80">تحليل الإيرادات</span>
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {[
            { id: "overview" as const, label: "Overview" },
            { id: "spending" as const, label: "Spending" },
            { id: "roi" as const, label: "ROI" },
            { id: "recommendations" as const, label: "Tips" },
          ].map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                activeView === view.id
                  ? "border-indigo-500 text-indigo-600 bg-indigo-50"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              )}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Overview */}
        {activeView === "overview" && (
          <div className="space-y-4">
            {/* Monthly Trend */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">This Month</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">
                  ${analytics.monthlyTrend.currentMonth}
                </span>
                <span
                  className={cn(
                    "flex items-center text-sm font-medium",
                    analytics.monthlyTrend.change >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {analytics.monthlyTrend.change >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {Math.abs(analytics.monthlyTrend.change)}%
                </span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {analytics.conversion.conversionRate}%
                </div>
                <div className="text-xs text-blue-600">Conversion Rate</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  ${analytics.conversion.avgRevenuePerBooking}
                </div>
                <div className="text-xs text-green-600">
                  Avg. Revenue/Booking
                </div>
              </div>
            </div>

            {/* Mini Chart */}
            <div className="h-24 flex items-end gap-1">
              {analytics.spendingHistory.slice(-7).map((entry, i) => (
                <div
                  key={i}
                  className="flex-1 bg-indigo-200 rounded-t"
                  style={{
                    height: `${(entry.total / maxSpending) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>6 months ago</span>
              <span>Now</span>
            </div>
          </div>
        )}

        {/* Spending History */}
        {activeView === "spending" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Spending History</h4>
            <div className="space-y-2">
              {analytics.spendingHistory
                .slice()
                .reverse()
                .slice(0, 6)
                .map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <span className="text-sm text-gray-600">{entry.date}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-amber-600">
                        {entry.credits} cr
                      </span>
                      <span className="text-purple-600">
                        {entry.tokens} tk
                      </span>
                      <span className="text-blue-600">
                        ${entry.promoted}
                      </span>
                      <span className="font-medium">
                        ${Math.round(entry.total)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
            <div className="text-xs text-gray-500">
              cr = credits, tk = tokens, $ = promoted spend
            </div>
          </div>
        )}

        {/* ROI by Tool */}
        {activeView === "roi" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              ROI by Revenue Tool
            </h4>
            <div className="space-y-3">
              {analytics.roiByTool.map((tool, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {tool.tool}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        tool.roi >= 500
                          ? "text-green-600"
                          : tool.roi >= 300
                          ? "text-amber-600"
                          : "text-red-600"
                      )}
                    >
                      {tool.roi}% ROI
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Spent: ${tool.spent}</span>
                    <span>Revenue: ${tool.revenueGenerated}</span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        tool.roi >= 500
                          ? "bg-green-500"
                          : tool.roi >= 300
                          ? "bg-amber-500"
                          : "bg-red-500"
                      )}
                      style={{ width: `${Math.min(tool.usage, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Usage: {tool.usage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {activeView === "recommendations" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Smart Recommendations
            </h4>
            <div className="space-y-3">
              {analytics.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="p-3 bg-amber-50 border border-amber-200 rounded-lg"
                >
                  <p className="text-sm text-gray-800">{rec}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {analytics.recommendationsAr[i]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
