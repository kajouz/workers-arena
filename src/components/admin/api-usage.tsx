"use client";

import { useState } from "react";
import { cn, formatNumber } from "@/lib/utils";
import { Activity, Clock, AlertTriangle, CheckCircle, TrendingUp, Zap } from "lucide-react";

interface APIEndpoint { path: string; method: string; calls: number; avgResponse: number; errorRate: number; p95Response: number; }

export function APIUsage() {
  const [endpoints] = useState<APIEndpoint[]>([
    { path: "/api/workers", method: "GET", calls: 45230, avgResponse: 125, errorRate: 0.2, p95Response: 340 },
    { path: "/api/search", method: "GET", calls: 23450, avgResponse: 89, errorRate: 0.1, p95Response: 210 },
    { path: "/api/bookings", method: "POST", calls: 8920, avgResponse: 234, errorRate: 1.2, p95Response: 560 },
    { path: "/api/auth/login", method: "POST", calls: 12340, avgResponse: 156, errorRate: 5.2, p95Response: 450 },
    { path: "/api/payments", method: "POST", calls: 4560, avgResponse: 345, errorRate: 2.1, p95Response: 890 },
    { path: "/api/categories", method: "GET", calls: 67890, avgResponse: 45, errorRate: 0, p95Response: 89 },
  ]);

  const totalCalls = endpoints.reduce((s, e) => s + e.calls, 0);
  const avgResponse = Math.round(endpoints.reduce((s, e) => s + e.avgResponse, 0) / endpoints.length);
  const avgErrorRate = (endpoints.reduce((s, e) => s + e.errorRate, 0) / endpoints.length).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{(totalCalls / 1000).toFixed(1)}k</p><p className="text-sm text-ink-500 dark:text-ink-400">Total API Calls</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-green-600">{avgResponse}ms</p><p className="text-sm text-ink-500 dark:text-ink-400">Avg Response</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-red-600">{avgErrorRate}%</p><p className="text-sm text-ink-500 dark:text-ink-400">Error Rate</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-blue-600">{endpoints.length}</p><p className="text-sm text-ink-500 dark:text-ink-400">Endpoints</p></div>
      </div>
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50 dark:bg-ink-950"><tr><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Endpoint</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Calls</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Avg Response</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">P95 Response</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Error Rate</th></tr></thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">{endpoints.map((ep) => (<tr key={ep.path} className="hover:bg-ink-50 dark:hover:bg-ink-950"><td className="px-4 py-4"><span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mr-2 dark:bg-blue-500/15 dark:text-blue-300">{ep.method}</span><span className="font-mono text-sm text-ink-900 dark:text-ink-50">{ep.path}</span></td><td className="px-4 py-4 text-sm font-medium text-ink-900 dark:text-ink-50">{formatNumber(ep.calls)}</td><td className="px-4 py-4"><span className={cn("text-sm font-medium", ep.avgResponse < 200 ? "text-green-600" : ep.avgResponse < 500 ? "text-yellow-600" : "text-red-600")}>{ep.avgResponse}ms</span></td><td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">{ep.p95Response}ms</td><td className="px-4 py-4"><span className={cn("text-sm font-medium", ep.errorRate < 1 ? "text-green-600" : ep.errorRate < 5 ? "text-yellow-600" : "text-red-600")}>{ep.errorRate}%</span></td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
