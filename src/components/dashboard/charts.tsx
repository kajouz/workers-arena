"use client";

import { useId } from "react";
import { cn, formatCompact } from "@/lib/utils";

/* ─────────────── Area chart ─────────────── */

export function AreaChart({
  data,
  height = 220,
  color = "#f97316",
  labels,
  className,
}: {
  data: number[];
  height?: number;
  color?: string;
  labels?: string[];
  className?: string;
}) {
  const gradId = useId();
  const w = 640;
  const h = 240;
  const pad = 10;
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data) * 0.85;
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Chart">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={h * f}
            y2={h * f}
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeDasharray="4 6"
          />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={color} className="opacity-0 transition-opacity hover:opacity-100" />
        ))}
      </svg>
      {labels && (
        <div className="mt-1 flex justify-between px-1 text-[10px] font-medium text-ink-400">
          <span>{labels[0]}</span>
          <span>{labels[Math.floor(labels.length / 2)]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Horizontal bar list ─────────────── */

export function BarList({
  items,
  color = "#f97316",
}: {
  items: { label: string; value: number; sub?: string }[];
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="group">
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="clamp-1 font-medium text-ink-700 dark:text-ink-200">{item.label}</span>
            <span className="shrink-0 font-bold text-ink-900 dark:text-ink-50">
              {formatCompact(item.value)}
              {item.sub && <span className="ms-1 text-xs font-medium text-ink-400">{item.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div
              className="h-full rounded-full transition-all duration-1000 group-hover:opacity-80"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Donut chart ─────────────── */

export function Donut({
  items,
  size = 170,
  thickness = 22,
}: {
  items: { label: string; value: number; hue: number }[];
  size?: number;
  thickness?: number;
}) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={thickness} />
          {items.map((item, i) => {
            const frac = item.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={`hsl(${item.hue} 70% 50%)`}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-ink-900 dark:text-ink-50">{formatCompact(total)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">total</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: `hsl(${item.hue} 70% 50%)` }} />
            <span className="flex-1 text-ink-600 dark:text-ink-300">{item.label}</span>
            <span className="font-bold text-ink-900 dark:text-ink-50">{formatCompact(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────── Sparkline ─────────────── */

export function Sparkline({ data, color = "#f97316", className }: { data: number[]; color?: string; className?: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(...data) || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-9 w-full", className)} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
