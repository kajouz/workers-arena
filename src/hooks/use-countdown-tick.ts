"use client";

import { useEffect, useState } from "react";

/**
 * A `now`-style ticking clock for live countdowns, paused while the tab is
 * hidden and resynced on `visibilitychange` → visible.
 *
 * Browsers throttle `setInterval` in hidden/backgrounded tabs (Chrome clamps
 * to ~1/min, and can stall it entirely), so a countdown computed as
 * `expiry − now` would drift — the displayed clock falls behind the real
 * deadline. While hidden we stop ticking (the countdown is invisible anyway),
 * and the moment the tab becomes visible we resync `now` to `Date.now()`
 * immediately, so the clock is exact again without waiting for the next
 * interval tick. On non-browser environments (SSR, jsdom) `document` may be
 * undefined — treat as always visible.
 */
export function useCountdownTick(active: boolean, intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  // Track visibility as state so the effect re-runs on change — otherwise the
  // early-return branch below could never fire (the effect would only ever see
  // the visibility of its first run).
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );

  useEffect(() => {
    const onVisibility = () => {
      const v = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
      setVisible(v);
      // Resync the moment a hidden tab comes back — no waiting for the next
      // tick (the interval is torn down while hidden and recreated on the
      // visible effect run, which would otherwise wait up to intervalMs).
      if (v) setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!active || !visible) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, visible, intervalMs]);

  return now;
}
