"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/* ─── Button Spinner ─── */
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("size-4 animate-spin", className)}
      aria-hidden="true"
    />
  );
}

/* ─── Inline Loading ─── */
export function InlineLoading({ text }: { text?: string }) {
  // If no text provided, the caller should pass a translated string.
  return (
    <div className="flex items-center gap-3 py-4 text-sm text-ink-500 dark:text-ink-400">
      <div className="size-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-400" />
      <span>{text}</span>
    </div>
  );
}

/* ─── Search Loading Bar ─── */
export function SearchLoadingBar() {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-brand-100 dark:bg-brand-900/30">
      <div className="h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] rounded-full bg-brand-500" />
      <style jsx>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

/* ─── Content Placeholder ─── */
export function ContentPlaceholder({
  lines = 4,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded-lg"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/* ─── Card Loading Overlay ─── */
export function CardLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm dark:bg-ink-900/60">
      <div className="flex flex-col items-center gap-2">
        <div className="size-8 animate-spin rounded-full border-3 border-ink-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-400" />
        <span className="text-xs font-medium text-ink-500 dark:text-ink-400">
          Loading...
        </span>
      </div>
    </div>
  );
}

/* ─── Avatar Skeleton ─── */
export function AvatarSkeleton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8", md: "size-12", lg: "size-16" };
  return <div className={cn("skeleton rounded-full", sizes[size])} />;
}

/* ─── Image Skeleton ─── */
export function ImageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "skeleton relative overflow-hidden rounded-xl",
        className
      )}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="size-8 text-ink-300 dark:text-ink-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    </div>
  );
}

/* ─── Table Row Skeleton ─── */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-ink-100 dark:border-ink-800">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded-lg" style={{ width: `${60 + Math.random() * 30}%` }} />
        </td>
      ))}
    </tr>
  );
}

/* ─── List Item Skeleton ─── */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <AvatarSkeleton />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-1/3 rounded-lg" />
        <div className="skeleton h-3 w-2/3 rounded-lg" />
      </div>
      <div className="skeleton h-8 w-20 rounded-lg" />
    </div>
  );
}

/* ─── Chart Skeleton ─── */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2" style={{ height }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="skeleton flex-1 rounded-t-lg"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}
