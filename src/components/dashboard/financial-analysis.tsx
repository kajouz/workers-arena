"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Briefcase,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calculator,
  CreditCard,
  Headphones,
  BarChart3,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { formatPrice, formatCompact } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────

interface KpiValue {
  value: number;
  net?: number;
  rate?: number;
  label: string;
  format: "currency" | "percentage";
}

interface FinancialKpis {
  customerAcquisitionCost: KpiValue;
  workerAcquisitionCost: KpiValue;
  averageJobValue: KpiValue;
  platformCommission: KpiValue;
  repeatBookingRate: KpiValue;
  quoteToBookingRate: KpiValue;
  cancellationRate: KpiValue;
  refundDisputeRate: KpiValue;
  supportCostPerJob: KpiValue;
  contributionMargin: KpiValue;
}

interface Summary {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  declinedBookings: number;
  refundedBookings: number;
  totalCustomers: number;
  repeatBookingCustomers: number;
  totalWorkers: number;
  activeWorkers: number;
  totalJobValue: number;
  totalCommission: number;
  netCommission: number;
}

interface MonthlyTrend {
  month: string;
  revenue: number;
  bookings: number;
  refunds: number;
  contributionMargin: number;
}

interface ContributionBreakdown {
  platformRevenue: number;
  paymentCosts: number;
  supportCosts: number;
  refunds: number;
  variableMarketing: number;
  net: number;
}

interface FinancialData {
  kpis: FinancialKpis;
  summary: Summary;
  monthlyTrend: MonthlyTrend[];
  contributionBreakdown: ContributionBreakdown;
}

// ─── Helper: Format KPI Value ─────────────────────────────────────

function formatKpiValue(kpi: KpiValue, locale: string): string {
  if (kpi.format === "percentage") {
    return `${kpi.value.toFixed(1)}%`;
  }
  return formatPrice(kpi.value / 100, "USD", locale as "en" | "ar");
}

// ─── KPI Card ─────────────────────────────────────────────────────

function KpiCard({
  kpi,
  icon: Icon,
  color,
  trend,
  locale,
  index,
}: {
  kpi: KpiValue;
  icon: React.ElementType;
  color: string;
  trend?: number;
  locale: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Card className="relative overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                {kpi.label}
              </p>
              <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
                {formatKpiValue(kpi, locale)}
              </p>
              {kpi.net !== undefined && (
                <p className="text-xs text-ink-500">
                  Net: {formatPrice(kpi.net / 100, "USD", locale as "en" | "ar")}
                </p>
              )}
              {kpi.rate !== undefined && (
                <p className="text-xs text-ink-500">
                  Rate: {kpi.rate.toFixed(1)}%
                </p>
              )}
            </div>
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon className="size-5" style={{ color }} />
            </div>
          </div>
          {trend !== undefined && (
            <div className="mt-3 flex items-center gap-1">
              {trend >= 0 ? (
                <ArrowUpRight className="size-3 text-emerald-500" />
              ) : (
                <ArrowDownRight className="size-3 text-red-500" />
              )}
              <span
                className={`text-xs font-bold ${
                  trend >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {Math.abs(trend).toFixed(1)}%
              </span>
              <span className="text-xs text-ink-400">vs last month</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Contribution Waterfall ───────────────────────────────────────

function ContributionWaterfall({
  breakdown,
  locale,
}: {
  breakdown: ContributionBreakdown;
  locale: string;
}) {
  const items = [
    { label: "Platform Revenue", value: breakdown.platformRevenue, color: "#10b981" },
    { label: "Payment Costs", value: -breakdown.paymentCosts, color: "#ef4444" },
    { label: "Support Costs", value: -breakdown.supportCosts, color: "#f59e0b" },
    { label: "Refunds", value: -breakdown.refunds, color: "#f43f5e" },
    { label: "Variable Marketing", value: -breakdown.variableMarketing, color: "#8b5cf6" },
    { label: "Net Contribution", value: breakdown.net, color: "#0ea5e9" },
  ];

  const maxValue = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-36 text-xs font-medium text-ink-600 dark:text-ink-300">
            {item.label}
          </span>
          <div className="flex-1">
            <div
              className="h-6 rounded-lg transition-all"
              style={{
                width: `${Math.min((Math.abs(item.value) / maxValue) * 100, 100)}%`,
                backgroundColor: item.color,
                minWidth: item.value !== 0 ? "4px" : "0",
              }}
            />
          </div>
          <span
            className={`w-24 text-right text-xs font-bold ${
              item.value >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {item.value >= 0 ? "+" : ""}
            {formatPrice(item.value / 100, "USD", locale as "en" | "ar")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly Trend Chart ──────────────────────────────────────────

function MonthlyTrendChart({
  data,
  locale,
}: {
  data: MonthlyTrend[];
  locale: string;
}) {
  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <div className="space-y-4">
      {/* Revenue bars */}
      <div className="flex items-end gap-1 h-40">
        {data.map((d, i) => (
          <div
            key={d.month}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div className="w-full relative" style={{ height: "100%" }}>
              <div
                className="absolute bottom-0 w-full bg-emerald-500/80 rounded-t-sm transition-all hover:bg-emerald-500"
                style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
                title={`Revenue: ${formatPrice(d.revenue / 100, "USD", locale as "en" | "ar")}`}
              />
              {d.refunds > 0 && (
                <div
                  className="absolute bottom-0 w-full bg-red-400/60 rounded-t-sm"
                  style={{ height: `${(d.refunds / maxRevenue) * 100}%` }}
                  title={`Refunds: ${formatPrice(d.refunds / 100, "USD", locale as "en" | "ar")}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Month labels */}
      <div className="flex gap-1">
        {data.map((d) => (
          <div key={d.month} className="flex-1 text-center text-[10px] text-ink-400">
            {d.month.slice(5)}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-400" /> Refunds
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function FinancialAnalysis() {
  const { locale, t } = useLocale();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/financial");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch financial data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="size-6 animate-spin text-ink-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-sm text-ink-400">
        Failed to load financial data
      </div>
    );
  }

  const { kpis, summary, monthlyTrend, contributionBreakdown } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            Financial Analysis
          </h2>
          <p className="text-sm text-ink-500">
            Platform economics and unit economics since launch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 py-1.5">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Pause" : "Resume"} Auto-refresh
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="size-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          kpi={kpis.customerAcquisitionCost}
          icon={Users}
          color="#f97316"
          locale={locale}
          index={0}
        />
        <KpiCard
          kpi={kpis.workerAcquisitionCost}
          icon={Briefcase}
          color="#0ea5e9"
          locale={locale}
          index={1}
        />
        <KpiCard
          kpi={kpis.averageJobValue}
          icon={DollarSign}
          color="#10b981"
          locale={locale}
          index={2}
        />
        <KpiCard
          kpi={kpis.platformCommission}
          icon={CreditCard}
          color="#8b5cf6"
          locale={locale}
          index={3}
        />
        <KpiCard
          kpi={kpis.contributionMargin}
          icon={Calculator}
          color="#06b6d4"
          locale={locale}
          index={4}
        />
      </div>

      {/* Second row of KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          kpi={kpis.repeatBookingRate}
          icon={Target}
          color="#f59e0b"
          locale={locale}
          index={5}
        />
        <KpiCard
          kpi={kpis.quoteToBookingRate}
          icon={TrendingUp}
          color="#10b981"
          locale={locale}
          index={6}
        />
        <KpiCard
          kpi={kpis.cancellationRate}
          icon={AlertTriangle}
          color="#ef4444"
          locale={locale}
          index={7}
        />
        <KpiCard
          kpi={kpis.refundDisputeRate}
          icon={TrendingDown}
          color="#f43f5e"
          locale={locale}
          index={8}
        />
        <KpiCard
          kpi={kpis.supportCostPerJob}
          icon={Headphones}
          color="#64748b"
          locale={locale}
          index={9}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Total Bookings
            </p>
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
              {formatCompact(summary.totalBookings)}
            </p>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-emerald-600">{summary.completedBookings} completed</span>
              <span className="text-red-600">{summary.cancelledBookings} cancelled</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Total Customers
            </p>
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
              {formatCompact(summary.totalCustomers)}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              {summary.repeatBookingCustomers} repeat customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Active Workers
            </p>
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
              {summary.activeWorkers}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              of {summary.totalWorkers} total workers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Total Job Value
            </p>
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
              {formatPrice(summary.totalJobValue / 100, "USD", locale)}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Commission: {formatPrice(summary.totalCommission / 100, "USD", locale)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-brand-500" />
              Monthly Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart data={monthlyTrend} locale={locale} />
          </CardContent>
        </Card>

        {/* Contribution Waterfall */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="size-4 text-brand-500" />
              Contribution Margin Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContributionWaterfall breakdown={contributionBreakdown} locale={locale} />
          </CardContent>
        </Card>
      </div>

      {/* Formula Reference */}
      <Card className="border-ink-200 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-ink-600 dark:text-ink-300">
            Contribution Margin Formula
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 font-mono text-xs text-ink-500">
            <p>Contribution Margin = Platform Revenue − Payment Costs − Support Costs − Refunds − Variable Marketing</p>
            <p className="text-ink-400">
              Payment Costs = Commission × 2.9% + Bookings × $0.30 (Stripe fees)
            </p>
            <p className="text-ink-400">
              Support Costs = Commission × 20% (overhead ratio)
            </p>
            <p className="text-ink-400">
              Variable Marketing = Campaign Budget × 30%
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
