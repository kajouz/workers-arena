"use client";

/**
 * Worker earnings statement — shows completed jobs, platform fees,
 * lead rebates, and net payouts for a selected month.
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  DollarSign,
  TrendingUp,
  Wallet,
  BadgeCheck,
  Receipt,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { formatPrice } from "@/lib/utils";
import type { EarningsStatement, CompletedJobLine } from "@/lib/data/worker-earnings";
import { shiftRoiMonth, recentRoiMonthKeys } from "@/lib/data/worker-roi";

interface Props {
  statement: EarningsStatement;
  currentMonthKey: string;
  workerName: string;
}

export function EarningsStatementView({ statement, currentMonthKey, workerName }: Props) {
  const { locale, t } = useLocale();

  const monthKeys = useMemo(() => recentRoiMonthKeys(currentMonthKey, 12), [currentMonthKey]);
  const prevMonth = shiftRoiMonth(currentMonthKey, -1);
  const nextMonth = shiftRoiMonth(currentMonthKey, 1);
  const canGoNext = nextMonth <= roiMonthKeyNow();

  const fmt = (minor: number) => formatPrice(minor / 100, statement.currency as "USD", locale);
  const pct = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Receipt className="h-6 w-6 text-brand-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Earnings Statement</h1>
              <p className="text-sm text-gray-500">{workerName}</p>
            </div>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/earnings?month=${prevMonth}`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            ←
          </Link>
          <select
            value={currentMonthKey}
            onChange={(e) => {
              window.location.href = `/dashboard/earnings?month=${e.target.value}`;
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium"
          >
            {monthKeys.map((key) => (
              <option key={key} value={key}>
                {formatMonthLabel(key)}
              </option>
            ))}
          </select>
          <Link
            href={`/dashboard/earnings?month=${nextMonth}`}
            className={cn(
              "rounded-lg border border-gray-200 px-3 py-1.5 text-sm",
              canGoNext ? "hover:bg-gray-100" : "pointer-events-none opacity-30"
            )}
          >
            →
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Net Earnings"
            value={fmt(statement.netEarningsMinor)}
            icon={<Wallet className="h-4 w-4 text-emerald-500" />}
            color="emerald"
          />
          <SummaryCard
            label="GMV"
            value={fmt(statement.gmvMinor)}
            icon={<DollarSign className="h-4 w-4 text-brand-500" />}
            subtitle={`${statement.completedCount} job${statement.completedCount !== 1 ? "s" : ""}`}
          />
          <SummaryCard
            label="Platform Fees"
            value={fmt(statement.effectiveFeesMinor)}
            icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
            subtitle={`${pct(statement.effectiveFeesMinor, statement.gmvMinor)} effective rate`}
          />
          <SummaryCard
            label="Lead Rebates"
            value={fmt(statement.rebatesMinor)}
            icon={<Target className="h-4 w-4 text-purple-500" />}
            subtitle={statement.rebatesMinor > 0 ? "fees reduced" : "no rebates"}
          />
        </div>

        {/* Source Breakdown */}
        {statement.gmvFromLeadsMinor > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Earnings by Source</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums">{fmt(statement.gmvFromLeadsMinor)}</p>
                <p className="text-xs text-gray-500">GMV from leads</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{fmt(statement.rebatesFromLeadsMinor)}</p>
                <p className="text-xs text-gray-500">Rebates from leads</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {fmt(statement.gmvMinor - statement.gmvFromLeadsMinor)}
                </p>
                <p className="text-xs text-gray-500">GMV from direct bookings</p>
              </div>
            </div>
          </div>
        )}

        {/* Completed Jobs Table */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Completed Jobs ({statement.completedCount})
            </h2>
          </div>

          {statement.completedJobs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Receipt className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No completed jobs this month.</p>
              <Link
                href={`/dashboard/earnings?month=${prevMonth}`}
                className="mt-2 inline-block text-xs text-brand-600 hover:underline"
              >
                Check previous months →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-5 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 text-right font-medium">GMV</th>
                    <th className="px-3 py-2 text-right font-medium">Fee</th>
                    <th className="px-3 py-2 text-right font-medium">Rebate</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-5 py-2 text-right font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.completedJobs.map((job) => (
                    <JobRow key={job.bookingId} job={job} fmt={fmt} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td colSpan={2} className="px-5 py-2 text-gray-700">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(statement.gmvMinor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(statement.effectiveFeesMinor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(statement.rebatesMinor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                      {fmt(statement.netEarningsMinor)}
                    </td>
                    <td className="px-5 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.completedCount > 0 ? fmt(statement.avgEarningsPerJobMinor) : "—"}
            </p>
            <p className="text-[11px] text-gray-500">Avg per job</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.effectiveFeeRateBps > 0 ? `${(statement.effectiveFeeRateBps / 100).toFixed(1)}%` : "—"}
            </p>
            <p className="text-[11px] text-gray-500">Effective fee rate</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.rebatesMinor > 0 ? fmt(statement.rebatesMinor) : "—"}
            </p>
            <p className="text-[11px] text-gray-500">Total rebates saved</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SummaryCard({
  label,
  value,
  icon,
  subtitle,
  color = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  color?: "emerald" | "default";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          color === "emerald" ? "text-emerald-600" : "text-gray-900"
        )}
      >
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p>}
    </div>
  );
}

function JobRow({
  job,
  fmt,
}: {
  job: CompletedJobLine;
  fmt: (minor: number) => string;
}) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="px-5 py-2">
        <div>
          <p className="font-medium text-gray-900">{job.jobTitle}</p>
          <p className="text-[10px] text-gray-400 tabular-nums">{job.bookingNumber}</p>
        </div>
      </td>
      <td className="px-3 py-2 text-gray-600">{job.customerName}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(job.gmvMinor)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(job.feeMinor)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {job.rebateMinor > 0 ? (
          <span className="text-emerald-600">-{fmt(job.rebateMinor)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(job.netEarningsMinor)}</td>
      <td className="px-5 py-2 text-right">
        {job.fromLead ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
            <Target className="h-2.5 w-2.5" />
            lead
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">direct</span>
        )}
      </td>
    </tr>
  );
}

/* ─── Helpers ─── */

function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function formatMonthLabel(key: string): string {
  return formatMonthKey(key);
}

function roiMonthKeyNow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
