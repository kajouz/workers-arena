"use client";

/**
 * Lightweight CSS-based chart components for the lead quality analytics
 * dashboard. No external charting library — pure Tailwind + inline styles
 * for the sparklines and bars. Keeps the bundle small.
 */

import { cn } from "@/lib/utils";

/* ─── Sparkline (horizontal bars showing a time series) ─── */

interface SparklineProps {
  /** One value per time bucket, oldest first. */
  values: number[];
  /** Max value for scaling (auto-computed if omitted). */
  max?: number;
  /** Height of each bar in px. */
  barHeight?: number;
  /** Color class for the bars. */
  color?: string;
  /** Whether to show the trend direction arrow. */
  showTrend?: boolean;
  className?: string;
}

export function Sparkline({
  values,
  max: maxProp,
  barHeight = 16,
  color = "bg-brand-500",
  showTrend = false,
  className,
}: SparklineProps) {
  if (values.length === 0) return <div className={cn("text-xs text-ink-400", className)}>No data</div>;

  const max = maxProp ?? Math.max(...values, 1);
  const trend =
    values.length >= 2
      ? values[values.length - 1] - values[values.length - 2]
      : 0;

  return (
    <div className={cn("flex items-end gap-px", className)}>
      {values.map((v, i) => (
        <div
          key={i}
          className={cn("rounded-sm transition-all", color)}
          style={{
            height: `${Math.max(2, (v / max) * barHeight)}px`,
            width: `${Math.max(4, Math.floor(100 / values.length))}%`,
            opacity: 0.4 + (i / values.length) * 0.6,
          }}
          title={`${v}`}
        />
      ))}
      {showTrend && (
        <span
          className={cn(
            "ms-1 text-[10px] font-medium tabular-nums",
            trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-ink-400"
          )}
        >
          {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}
        </span>
      )}
    </div>
  );
}

/* ─── Stat Card (a single KPI with optional sparkline) ─── */

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  sparkValues?: number[];
  sparkColor?: string;
  trend?: number;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  sparkValues,
  sparkColor = "bg-brand-500",
  trend,
  className,
}: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-ink-100 p-4 dark:border-ink-800", className)}>
      <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {trend !== undefined && (
          <span
            className={cn(
              "text-xs font-medium",
              trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-ink-400"
            )}
          >
            {trend > 0 ? `+${trend}%` : `${trend}%`}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[11px] text-ink-400">{subtitle}</p>}
      {sparkValues && sparkValues.length > 0 && (
        <Sparkline values={sparkValues} color={sparkColor} className="mt-2" />
      )}
    </div>
  );
}

/* ─── Grade Bar Chart (horizontal bars per grade) ─── */

interface GradeBarChartProps {
  data: Array<{
    label: string;
    value: number;
    maxValue?: number;
    color: string;
    subtitle?: string;
  }>;
  maxValue?: number;
  className?: string;
}

export function GradeBarChart({ data, maxValue: maxProp, className }: GradeBarChartProps) {
  const max = maxProp ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-medium text-ink-600 dark:text-ink-300">
            {d.label}
          </span>
          <div className="flex-1">
            <div className="h-5 rounded bg-ink-100 dark:bg-ink-800">
              <div
                className={cn("h-full rounded transition-all", d.color)}
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
              />
            </div>
          </div>
          <span className="w-12 text-end text-xs font-medium tabular-nums text-ink-600 dark:text-ink-300">
            {d.value}
          </span>
          {d.subtitle && (
            <span className="w-16 text-end text-[10px] text-ink-400">{d.subtitle}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Multi-series Sparkline (overlapping lines for multiple grades) ─── */

interface MultiSeriesSparklineProps {
  series: Array<{
    label: string;
    values: number[];
    color: string;
  }>;
  height?: number;
  className?: string;
}

export function MultiSeriesSparkline({
  series,
  height = 60,
  className,
}: MultiSeriesSparklineProps) {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 1);
  const bucketWidth = series[0]?.values.length ?? 0;

  if (bucketWidth === 0) return null;

  return (
    <div className={cn("relative", className)} style={{ height }}>
      {series.map((s) => (
        <div key={s.label} className="absolute inset-0 flex items-end gap-px">
          {s.values.map((v, i) => (
            <div
              key={i}
              className={cn("rounded-sm", s.color)}
              style={{
                height: `${Math.max(2, (v / max) * height)}px`,
                width: `${100 / bucketWidth}%`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Legend ─── */

interface LegendProps {
  items: Array<{ label: string; color: string }>;
  className?: string;
}

export function Legend({ items, className }: LegendProps) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", item.color)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
