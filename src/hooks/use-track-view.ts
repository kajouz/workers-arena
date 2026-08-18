"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics-queue";

/**
 * Track the current page view in the analytics queue.
 * Optionally pass a workerId when viewing a worker profile.
 *
 * Usage:
 *   useTrackView();                          // generic page view
 *   useTrackView(worker.id);                 // worker profile view
 *   useTrackView(undefined, worker.id);      // worker profile view (legacy)
 */
export function useTrackView(workerId?: string | null) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Fire-and-forget: queue or send the page view.
    trackPageView(pathname, workerId ?? null).catch(() => {});
  }, [pathname, workerId]);
}
