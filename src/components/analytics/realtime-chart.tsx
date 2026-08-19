"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface RealtimeChartProps {
  data: DataPoint[];
  title: string;
  type?: "bar" | "line" | "area";
  height?: number;
  showValues?: boolean;
  className?: string;
}

/**
 * Lightweight real-time chart component using SVG.
 * No external dependencies required.
 */
export function RealtimeChart({
  data,
  title,
  type = "bar",
  height = 200,
  showValues = true,
  className,
}: RealtimeChartProps) {
  const [animatedData, setAnimatedData] = useState<DataPoint[]>([]);

  // Animate data on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedData(data);
    }, 100);
    return () => clearTimeout(timer);
  }, [data]);

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(40, (100 / data.length) - 2);

  return (
    <div className={cn("rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900", className)}>
      <h3 className="mb-4 text-sm font-bold text-ink-900 dark:text-ink-50">{title}</h3>
      
      {type === "bar" && (
        <div className="flex items-end justify-between gap-1" style={{ height }}>
          {animatedData.map((point, i) => {
            const barHeight = (point.value / maxValue) * (height - 30);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                {showValues && (
                  <span className="text-[10px] font-bold text-ink-500 dark:text-ink-400">
                    {point.value}
                  </span>
                )}
                <div
                  className="w-full rounded-t-md transition-all duration-500 ease-out"
                  style={{
                    height: barHeight,
                    backgroundColor: point.color || "hsl(262 83% 58%)",
                    maxWidth: barWidth,
                  }}
                />
                <span className="text-[10px] text-ink-400 dark:text-ink-500 truncate max-w-full">
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {type === "line" && (
        <svg
          viewBox={`0 0 ${animatedData.length * 40} ${height}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1={0}
              y1={height * (1 - pct)}
              x2={animatedData.length * 40}
              y2={height * (1 - pct)}
              stroke="currentColor"
              className="text-ink-100 dark:text-ink-800"
              strokeDasharray="4 4"
            />
          ))}
          
          {/* Line path */}
          <polyline
            points={animatedData
              .map((point, i) => {
                const x = i * 40 + 20;
                const y = height - (point.value / maxValue) * (height - 20);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="hsl(262 83% 58%)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {animatedData.map((point, i) => {
            const x = i * 40 + 20;
            const y = height - (point.value / maxValue) * (height - 20);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={4} fill="hsl(262 83% 58%)" />
                <text
                  x={x}
                  y={y - 10}
                  textAnchor="middle"
                  className="fill-ink-500 dark:fill-ink-400"
                  fontSize={10}
                >
                  {point.value}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {type === "area" && (
        <svg
          viewBox={`0 0 ${animatedData.length * 40} ${height}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
        >
          {/* Area fill */}
          <polygon
            points={[
              `0,${height}`,
              ...animatedData.map((point, i) => {
                const x = i * 40 + 20;
                const y = height - (point.value / maxValue) * (height - 20);
                return `${x},${y}`;
              }),
              `${animatedData.length * 40},${height}`,
            ].join(" ")}
            fill="url(#areaGradient)"
          />
          
          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(262 83% 58%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(262 83% 58%)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          
          {/* Line */}
          <polyline
            points={animatedData
              .map((point, i) => {
                const x = i * 40 + 20;
                const y = height - (point.value / maxValue) * (height - 20);
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="hsl(262 83% 58%)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {data.map((point, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: point.color || "hsl(262 83% 58%)" }}
            />
            <span className="text-[10px] text-ink-500 dark:text-ink-400">
              {point.label}: {point.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Metric card for displaying a single KPI.
 */
export function MetricCard({
  label,
  value,
  change,
  icon,
  color = "brand",
}: {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  color?: "brand" | "emerald" | "amber" | "red";
}) {
  const colorClasses = {
    brand: "bg-brand-500/10 text-brand-600 dark:text-brand-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center justify-between">
        <div className={cn("flex size-10 items-center justify-center rounded-xl", colorClasses[color])}>
          {icon}
        </div>
        {change !== undefined && (
          <span
            className={cn(
              "text-xs font-bold",
              change >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            {change >= 0 ? "+" : ""}{change}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{value}</p>
        <p className="text-xs text-ink-500 dark:text-ink-400">{label}</p>
      </div>
    </div>
  );
}
