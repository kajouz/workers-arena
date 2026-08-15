"use client";

import { useEffect, useState } from "react";
import { useCountdownTick } from "./use-countdown-tick";

export interface UseSsrSafeNowOptions {
  /**
   * true → the live value ticks on the interval (the visibility-aware
   * useCountdownTick clock), for live countdowns like the SLA urgency bar.
   * false (default) → the live value is a single Date.now() captured at mount,
   * for static "expires in X hours" text that only changes on navigation.
   */
  tick?: boolean;
  /** Only tick while this is true (e.g. the booking is REQUESTED). Ignored when tick is false. */
  active?: boolean;
  /** Tick cadence in ms — defaults to useCountdownTick's 30s. */
  intervalMs?: number;
}

/**
 * A Date.now()-style clock that is safe to render during SSR. The server page
 * passes its own render-time clock as `seed`; until the component mounts we
 * return exactly that seed, so the server markup and the client's first render
 * are identical and React hydrates without a mismatch. After mount we switch
 * to the live clock — a normal post-hydration state update, which never warns.
 *
 * Consumers: BookingSlaCountdown (tick: true — live urgency bar), the
 * customer/worker booking rows and the quote card (tick: false — static
 * "expires in N hours" lines). The seed MUST come from the server page — a
 * client component has no safe "now" before hydration (see the
 * admin/bookings/[number] page for the canonical usage).
 */
export function useSsrSafeNow(seed: number, opts: UseSsrSafeNowOptions = {}): number {
  const ticking = opts.tick === true;
  const tickNow = useCountdownTick(ticking ? (opts.active ?? true) : false, opts.intervalMs);
  const [mounted, setMounted] = useState(false);
  const [liveNow, setLiveNow] = useState(0);
  useEffect(() => {
    setMounted(true);
    if (!ticking) setLiveNow(Date.now());
  }, [ticking]);
  return mounted ? (ticking ? tickNow : liveNow) : seed;
}
