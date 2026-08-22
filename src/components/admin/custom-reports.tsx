"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar, Download, BarChart3, TrendingUp, Users, DollarSign, Filter } from "lucide-react";

interface ReportData { label: string; value: number; change: number; }

export function CustomReports() {
  const [dateRange, setDateRange] = useState({ start: "2025-01-01", end: "2025-01-17" });
  const [selectedMetric, setSelectedMetric] = useState("revenue");

  const metrics: Record<string, ReportData[]> = {
    revenue: [
      { label: "Total Revenue", value: 15420, change: 12.5 },
      { label: "Subscriptions", value: 8900, change: 8.2 },
      { label: "Booking Fees", value: 4520, change: 15.3 },
      { label: "Campaigns", value: 2000, change: 5.1 },
    ],
    bookings: [
      { label: "Total Bookings", value: 234, change: 18.2 },
      { label: "Completed", value: 189, change: 22.1 },
      { label: "Cancelled", value: 23, change: -5.3 },
      { label: "Avg Value", value: 65, change: 3.2 },
    ],
    users: [
      { label: "New Workers", value: 45, change: 25.3 },
      { label: "New Customers", value: 156, change: 32.1 },
      { label: "Active Users", value: 892, change: 8.5 },
      { label: "Churned", value: 12, change: -15.2 },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-500" /><input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg" /><span className="text-gray-500">to</span><input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg" /></div>
        <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-lg"><option value="revenue">Revenue</option><option value="bookings">Bookings</option><option value="users">Users</option></select>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"><Download className="w-4 h-4" /> Export</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(metrics[selectedMetric] || []).map((m) => (
          <div key={m.label} className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-sm text-gray-500">{m.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{typeof m.value === "number" && m.value > 999 ? `$${(m.value / 1000).toFixed(1)}k` : m.value.toLocaleString()}</p>
            <p className={cn("text-sm mt-1", m.change > 0 ? "text-green-600" : "text-red-600")}>{m.change > 0 ? "+" : ""}{m.change}% vs previous period</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6"><div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center"><BarChart3 className="w-12 h-12 text-gray-400" /><p className="text-gray-500 ml-4">Chart visualization</p></div></div>
    </div>
  );
}
