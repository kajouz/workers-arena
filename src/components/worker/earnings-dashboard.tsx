"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/micro-interactions";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface EarningsData {
  totalEarnings: number;
  pendingPayout: number;
  withdrawn: number;
  thisMonth: number;
  lastMonth: number;
  currency: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "earning" | "withdrawal" | "refund" | "subscription";
  status: "completed" | "pending" | "failed";
  bookingNumber?: string;
}

interface PayoutMethod {
  id: string;
  type: "bank" | "omt" | "whish";
  label: string;
  last4: string;
  isDefault: boolean;
}

/* ─── Mock Data ─── */
const MOCK_EARNINGS: EarningsData = {
  totalEarnings: 1245000, // in minor units (LBP cents)
  pendingPayout: 185000,
  withdrawn: 960000,
  thisMonth: 342000,
  lastMonth: 298000,
  currency: "LBP",
};

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "t1",
    date: "2026-08-18",
    description: "Plumbing repair — Sara Al-Mansouri",
    amount: 85000,
    type: "earning",
    status: "completed",
    bookingNumber: "WA-2024-1847",
  },
  {
    id: "t2",
    date: "2026-08-15",
    description: "AC maintenance — James Carter",
    amount: 120000,
    type: "earning",
    status: "completed",
    bookingNumber: "WA-2024-1832",
  },
  {
    id: "t3",
    date: "2026-08-12",
    description: "Withdrawal to OMT",
    amount: -200000,
    type: "withdrawal",
    status: "completed",
  },
  {
    id: "t4",
    date: "2026-08-10",
    description: "Pipe installation — Layla Haddad",
    amount: 145000,
    type: "earning",
    status: "completed",
    bookingNumber: "WA-2024-1819",
  },
  {
    id: "t5",
    date: "2026-08-08",
    description: "Subscription — Professional plan",
    amount: -5900,
    type: "subscription",
    status: "completed",
  },
  {
    id: "t6",
    date: "2026-08-05",
    description: "Emergency call — Ahmed Hassan",
    amount: 95000,
    type: "earning",
    status: "pending",
    bookingNumber: "WA-2024-1801",
  },
];

const MOCK_PAYOUT_METHODS: PayoutMethod[] = [
  { id: "p1", type: "omt", label: "OMT Transfer", last4: "4521", isDefault: true },
  { id: "p2", type: "whish", label: "Whish Money", last4: "7890", isDefault: false },
  { id: "p3", type: "bank", label: "Bank of Beirut", last4: "3344", isDefault: false },
];

/* ─── Helper to format amount ─── */
function formatAmount(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (currency === "LBP") {
    return `${abs.toLocaleString()} LBP`;
  }
  if (currency === "USD") {
    return `$${(abs / 100).toFixed(2)}`;
  }
  return `${abs.toLocaleString()} ${currency}`;
}

/* ─── Monthly Chart (simple bar chart) ─── */
function MonthlyChart() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const values = [180000, 220000, 195000, 260000, 310000, 285000, 298000, 342000];
  const max = Math.max(...values);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-40">
        {months.map((month, i) => (
          <div key={month} className="flex flex-1 flex-col items-center gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(values[i] / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={cn(
                "w-full rounded-t-lg",
                i === months.length - 1
                  ? "bg-brand-500"
                  : "bg-brand-200 dark:bg-brand-800"
              )}
            />
            <span className="text-[10px] text-ink-400">{month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export function EarningsDashboard() {
  const [earnings] = useState(MOCK_EARNINGS);
  const [transactions] = useState(MOCK_TRANSACTIONS);
  const [payoutMethods] = useState(MOCK_PAYOUT_METHODS);
  const [period, setPeriod] = useState<"month" | "year">("month");

  const monthlyGrowth =
    earnings.lastMonth > 0
      ? ((earnings.thisMonth - earnings.lastMonth) / earnings.lastMonth * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-ink-50">
            Earnings
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Track your income and payouts
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="mr-2 size-4" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FadeIn delay={0}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-500">Total Earnings</span>
              <DollarSign className="size-4 text-brand-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {formatAmount(earnings.totalEarnings, earnings.currency)}
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-500">Pending Payout</span>
              <Clock className="size-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {formatAmount(earnings.pendingPayout, earnings.currency)}
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-500">This Month</span>
              <TrendingUp className="size-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {formatAmount(earnings.thisMonth, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <ArrowUpRight className="size-3" />
              +{monthlyGrowth}% vs last month
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-500">Withdrawn</span>
              <CreditCard className="size-4 text-ink-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {formatAmount(earnings.withdrawn, earnings.currency)}
            </p>
          </div>
        </FadeIn>
      </div>

      {/* Chart + Payout Methods */}
      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Monthly Chart */}
        <FadeIn delay={0.2}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink-900 dark:text-ink-50">
                Monthly Earnings
              </h3>
              <div className="flex gap-1">
                {(["month", "year"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                      period === p
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                        : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
                    )}
                  >
                    {p === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
            <MonthlyChart />
          </div>
        </FadeIn>

        {/* Payout Methods */}
        <FadeIn delay={0.25}>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink-900 dark:text-ink-50">
                Payout Methods
              </h3>
              <Button variant="ghost" size="sm">
                + Add
              </Button>
            </div>
            <div className="space-y-3">
              {payoutMethods.map((method) => (
                <div
                  key={method.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    method.isDefault
                      ? "border-brand-300 bg-brand-50/50 dark:border-brand-700 dark:bg-brand-950/20"
                      : "border-ink-100 dark:border-ink-800"
                  )}
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-ink-100 dark:bg-ink-800">
                    <CreditCard className="size-5 text-ink-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                      {method.label}
                    </p>
                    <p className="text-xs text-ink-400">****{method.last4}</p>
                  </div>
                  {method.isDefault && (
                    <Badge variant="outline" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <Button className="mt-4 w-full" variant="outline">
              Withdraw {formatAmount(earnings.pendingPayout, earnings.currency)}
            </Button>
          </div>
        </FadeIn>
      </div>

      {/* Transaction History */}
      <FadeIn delay={0.3}>
        <div className="rounded-2xl border border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center justify-between p-5 border-b border-ink-100 dark:border-ink-800">
            <h3 className="font-semibold text-ink-900 dark:text-ink-50">
              Transaction History
            </h3>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    tx.type === "earning"
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : tx.type === "withdrawal"
                        ? "bg-sky-100 dark:bg-sky-900/30"
                        : "bg-ink-100 dark:bg-ink-800"
                  )}
                >
                  {tx.type === "earning" ? (
                    <ArrowUpRight className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : tx.type === "withdrawal" ? (
                    <ArrowDownRight className="size-5 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <AlertCircle className="size-5 text-ink-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">
                    {tx.description}
                  </p>
                  <p className="text-xs text-ink-400">
                    {new Date(tx.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {tx.bookingNumber && ` · ${tx.bookingNumber}`}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      tx.amount > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-ink-600 dark:text-ink-400"
                    )}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {formatAmount(tx.amount, earnings.currency)}
                  </p>
                  <Badge
                    variant={tx.status === "completed" ? "outline" : "secondary"}
                    className="text-[10px]"
                  >
                    {tx.status === "completed" && (
                      <CheckCircle2 className="mr-1 size-2.5" />
                    )}
                    {tx.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
