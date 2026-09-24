"use client";

/**
 * Worker earnings statement — shows completed jobs, platform fees,
 * lead rebates, and net payouts for a selected month.
 */

import { useMemo } from "react";
import { Link } from "@/components/i18n/link";
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
import { cn, formatPrice, formatDate } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import type { EarningsStatement, CompletedJobLine, PayoutLine } from "@/lib/data/worker-earnings";
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
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Receipt className="h-6 w-6 text-brand-500" />
            <div>
              <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Earnings Statement</h1>
              <p className="text-sm text-ink-500 dark:text-ink-400">{workerName}</p>
            </div>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/earnings?month=${prevMonth}`}
            className="rounded-lg border border-ink-200 dark:border-ink-800 px-3 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            ←
          </Link>
          <select
            value={currentMonthKey}
            onChange={(e) => {
              window.location.href = `/dashboard/earnings?month=${e.target.value}`;
            }}
            className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 px-3 py-1.5 text-sm font-medium"
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
              "rounded-lg border border-ink-200 dark:border-ink-800 px-3 py-1.5 text-sm",
              canGoNext ? "hover:bg-ink-100 dark:hover:bg-ink-800" : "pointer-events-none opacity-30"
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
          <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Earnings by Source</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums">{fmt(statement.gmvFromLeadsMinor)}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">GMV from leads</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{fmt(statement.rebatesFromLeadsMinor)}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">Rebates from leads</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {fmt(statement.gmvMinor - statement.gmvFromLeadsMinor)}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">GMV from direct bookings</p>
              </div>
            </div>
          </div>
        )}

        {/* Payouts */}
        {statement.payoutsCount > 0 && (
          <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
            <div className="border-b border-ink-100 dark:border-ink-800 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                Payouts ({statement.payoutsCount}) — {fmt(statement.payoutsMinor)} total
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 dark:border-ink-800 text-start text-ink-500 dark:text-ink-400">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 text-end font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.payoutLines.map((payout) => (
                    <PayoutRow key={payout.entryId} payout={payout} fmt={fmt} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed Jobs Table */}
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
          <div className="border-b border-ink-100 dark:border-ink-800 px-5 py-3">
            <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Completed Jobs ({statement.completedCount})
            </h2>
          </div>

          {statement.completedJobs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Receipt className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
              <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">No completed jobs this month.</p>
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
                  <tr className="border-b border-ink-100 dark:border-ink-800 text-start text-ink-500 dark:text-ink-400">
                    <th className="px-5 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 text-end font-medium">GMV</th>
                    <th className="px-3 py-2 text-end font-medium">Fee</th>
                    <th className="px-3 py-2 text-end font-medium">Rebate</th>
                    <th className="px-3 py-2 text-end font-medium">Net</th>
                    <th className="px-5 py-2 text-end font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.completedJobs.map((job) => (
                    <JobRow key={job.bookingId} job={job} fmt={fmt} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 dark:border-ink-800 font-semibold">
                    <td colSpan={2} className="px-5 py-2 text-ink-700 dark:text-ink-200">Total</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(statement.gmvMinor)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(statement.effectiveFeesMinor)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{fmt(statement.rebatesMinor)}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-emerald-600">
                      {fmt(statement.netEarningsMinor)}
                    </td>
                    <td className="px-5 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Net Balance */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-xs font-medium text-emerald-700">Net Balance (earnings − payouts)</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-emerald-800">{fmt(statement.netBalanceMinor)}</p>
          <p className="mt-0.5 text-[11px] text-emerald-600">
            {fmt(statement.netEarningsMinor)} earned − {fmt(statement.payoutsMinor)} withdrawn
          </p>
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.completedCount > 0 ? fmt(statement.avgEarningsPerJobMinor) : "—"}
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">Avg per job</p>
          </div>
          <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.effectiveFeeRateBps > 0 ? `${(statement.effectiveFeeRateBps / 100).toFixed(1)}%` : "—"}
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">Effective fee rate</p>
          </div>
          <div className="rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3">
            <p className="text-lg font-bold tabular-nums">
              {statement.rebatesMinor > 0 ? fmt(statement.rebatesMinor) : "—"}
            </p>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">Total rebates saved</p>
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
    <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          color === "emerald" ? "text-emerald-600" : "text-ink-900 dark:text-ink-50"
        )}
      >
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">{subtitle}</p>}
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
    <tr className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-950">
      <td className="px-5 py-2">
        <div>
          <p className="font-medium text-ink-900 dark:text-ink-50">{job.jobTitle}</p>
          <p className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">{job.bookingNumber}</p>
        </div>
      </td>
      <td className="px-3 py-2 text-ink-600 dark:text-ink-300">{job.customerName}</td>
      <td className="px-3 py-2 text-end tabular-nums">{fmt(job.gmvMinor)}</td>
      <td className="px-3 py-2 text-end tabular-nums text-ink-500 dark:text-ink-400">{fmt(job.feeMinor)}</td>
      <td className="px-3 py-2 text-end tabular-nums">
        {job.rebateMinor > 0 ? (
          <span className="text-emerald-600">-{fmt(job.rebateMinor)}</span>
        ) : (
          <span className="text-ink-300 dark:text-ink-600">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-end tabular-nums font-medium">{fmt(job.netEarningsMinor)}</td>
      <td className="px-5 py-2 text-end">
        {job.fromLead ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-500/15 dark:text-purple-300">
            <Target className="h-2.5 w-2.5" />
            lead
          </span>
        ) : (
          <span className="text-[10px] text-ink-400 dark:text-ink-500">direct</span>
        )}
      </td>
    </tr>
  );
}

function PayoutRow({
  payout,
  fmt,
  locale,
}: {
  payout: PayoutLine;
  fmt: (minor: number) => string;
  locale: "en" | "ar";
}) {
  return (
    <tr className="border-b border-ink-50 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-950">
      <td className="px-5 py-2 text-ink-600 dark:text-ink-300">{formatDate(payout.time, locale)}</td>
      <td className="px-3 py-2">
        <Badge
          variant={
            payout.status === "processed"
              ? "success"
              : payout.status === "rejected"
                ? "danger"
                : "outline"
          }
          className="text-[10px]"
        >
          {payout.status}
        </Badge>
      </td>
      <td className="px-3 py-2 text-ink-500 dark:text-ink-400">{payout.reason || "—"}</td>
      <td className="px-3 py-2 text-end font-semibold text-red-600">-{fmt(payout.amountMinor)}</td>
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
