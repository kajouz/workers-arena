"use client";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/data/types";

/**
 * Shared booking-status badge — used by BOTH the customer /bookings list and
 * the worker-dashboard panel, so the color map lives once (mirrors the
 * notification TYPE_DOT convention in notification-bell.tsx).
 */
const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  quoting: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  quoted: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  pendingPayment: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  confirmed: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  inProgress: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  completionPending: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  completed: "border-transparent bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  declined: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  noShow: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  rescheduled: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  // audit-event only (never a booking's CURRENT status) — kept for the Record type.
  message: "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-400",
  refunded: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const { t } = useLocale();
  return (
    <Badge variant="outline" className={cn(STATUS_STYLE[status], className)}>
      {t(`booking.status.${status}`)}
    </Badge>
  );
}
