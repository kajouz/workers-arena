"use client";

import { useEffect } from "react";
import { initCapacitor } from "@/lib/mobile/capacitor-init";

/**
 * Initializes Capacitor native features (push notifications, status bar,
 * keyboard, network detection) when the app runs inside a native shell.
 *
 * This component is rendered once in the root layout and runs the init
 * on mount. All Capacitor imports are dynamic so the web bundle remains
 * tree-shakeable.
 */
export function CapacitorProvider() {
  useEffect(() => {
    initCapacitor();
  }, []);

  return null; // no UI — side-effect only
}
