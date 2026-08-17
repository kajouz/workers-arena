/**
 * Guarded polyfills for the jsdom component tests (respond-dialog,
 * booking-dialog, worker-card…). Loaded for every suite via vitest
 * setupFiles, but only acts when a browser-like global exists — node-env
 * suites are untouched.
 *
 * - matchMedia: zustand stores (src/lib/store.ts getInitialTheme) and
 *   framer-motion call it eagerly at import/render time; jsdom lacks it.
 * - ResizeObserver: some Radix primitives and layout libs reference it.
 */

// Durable feed isolation — every worker gets its own temp admin-activity feed
// unless a suite explicitly stubs ADMIN_ACTIVITY_FILE (bookings, lebanon,
// campaign-payments, notifications… all do). Without this default, any test
// that drives a booking/campaign/purchase seam that audits to the feed
// (confirm, cancel, refund, …) writes straight into the dev's
// .data/admin-activity.json and pollutes the live /admin/activity preview.
// The live-DB prisma chain tests deliberately clear this env (see
// booking-email-chain-prisma / campaign-email-chain-prisma) so their activity
// assertions keep exercising the real Prisma adapter.
process.env.ADMIN_ACTIVITY_FILE ??=
  `${require("node:os").tmpdir()}/wa-test-activity-${process.pid}.json`;

if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof window.ResizeObserver !== "function") {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}
