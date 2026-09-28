"use client";

import { LazyMotion, domAnimation } from "framer-motion";

/**
 * Components import Framer Motion's lightweight `m` (aliased to `motion`) and
 * get their features from here: `domAnimation` covers animate/exit/variants,
 * hover/tap/focus and whileInView — everything the app uses. The full
 * `motion` component bundled ~130 KB (raw) on every page, and loading the
 * larger `domMax` asynchronously moved the cost into Total Blocking Time
 * instead (search TBT 84 → 273 ms). Layout animations (`layout`, `layoutId`)
 * need domMax, so the app doesn't use them.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
