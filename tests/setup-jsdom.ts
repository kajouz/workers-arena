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
