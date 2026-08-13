"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Filter options — kept in sync with ACTIVITY_TYPES in src/lib/data/activity.ts.
 * Defined here (not imported) because activity.ts imports node:fs/path and must
 * never be pulled into a client bundle. Both admin surfaces (the dashboard
 * feed and the history page) share this single source.
 */
export const ACTIVITY_TYPE_OPTIONS = [
  "worker",
  "company",
  "review",
  "payment",
  "system",
  "verification",
  "booking",
] as const;

export type ActivityTypeFilterValue = (typeof ACTIVITY_TYPE_OPTIONS)[number] | "";

/**
 * Single pill chip — module scope (not nested inside ActivityTypeChips) so its
 * component identity is stable across renders. A plain <button> (not ui/Button)
 * so the rounded-full pill radius can't be overridden unpredictably by the
 * Button cva variants (rounded-xl base / rounded-lg in size=sm).
 */
function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.98]",
        active
          ? "bg-brand-500 text-white shadow-[0_8px_24px_-6px_rgb(249_115_22/0.5)]"
          : "border border-ink-200 bg-transparent text-ink-800 hover:border-ink-300 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800"
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-black leading-4",
            active
              ? "bg-white/25 text-white"
              : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Quick-filter pill row for the admin activity surfaces. "All types" + one
 * chip per ACTIVITY_TYPES value, wired to the existing admin.activityType.*
 * i18n keys. The `counts` prop renders a small numeral on chips (used by the
 * dashboard feed, where the pool is in memory); the history page is
 * server-paged, so it omits counts.
 */
export function ActivityTypeChips({
  value,
  onChange,
  counts,
}: {
  value: ActivityTypeFilterValue;
  onChange: (v: ActivityTypeFilterValue) => void;
  counts?: Partial<Record<(typeof ACTIVITY_TYPE_OPTIONS)[number], number>>;
}) {
  const { t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("admin.activityHistoryType")}
      className="flex flex-wrap items-center gap-1.5"
    >
      <Chip active={value === ""} onClick={() => onChange("")} label={t("admin.activityHistoryAllTypes")} />
      {ACTIVITY_TYPE_OPTIONS.map((tp) => (
        <Chip
          key={tp}
          active={value === tp}
          onClick={() => onChange(tp)}
          label={t(`admin.activityType.${tp}`)}
          count={counts?.[tp]}
        />
      ))}
    </div>
  );
}
