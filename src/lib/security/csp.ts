/**
 * The Content Security Policy — built in ONE place.
 *
 * Two surfaces consume it and must never drift:
 *   • `src/proxy.ts` — the dynamic header on every matched page request, and
 *   • `next.config.ts` — the static header fallback for the paths the proxy
 *     matcher skips (`_next/static`, images, fonts).
 * Until now each file carried its own copy of the directive list, so a change
 * to one silently left the other behind.
 *
 * `unsafe-eval` is **development-only**. React's development build needs
 * `eval()` for its dev-only diagnostics (component stacks, hydrated-value
 * inspection) and otherwise logs:
 *
 *     eval() is not supported in this environment. If this page was served with
 *     a `Content-Security-Policy` header, make sure that `unsafe-eval` is
 *     included. React requires eval() in development mode for various features.
 *
 * That is the error a dev-mode Preview tab used to show. It never wedged the
 * page on its own (the wedge was an unrelated render loop — see
 * `src/components/providers/theme-transition.tsx`) but it disabled React's dev
 * diagnostics, so the allowance is granted for `next dev` only and a production
 * build keeps the hardened policy untouched.
 *
 * `upgrade-insecure-requests` is granted only when the document is actually
 * served over HTTPS (`secure`). The directive exists to stop mixed content on a
 * secure page; on a plain-HTTP origin it can only misfire — the browser
 * rewrites request URLs to `https://`, so an absolute same-origin reference
 * (or a redirect target) stops matching `form-action 'self'` and is blocked.
 * Nothing in the app depends on that rewriting in dev, and the e2e/preview run
 * over http, so the policy now follows the transport.
 *
 * This is a LEAF module (no imports) so `next.config.ts` can load it outside the
 * app bundle, where the `@/` path alias is not resolved.
 */
export function buildCsp(
  dev: boolean = process.env.NODE_ENV === "development",
  secure = true
): string {
  const scriptSrc = [
    "'self'",
    // The theme bootstrap in src/app/layout.tsx is an inline script, and Next
    // emits inline style/flight tags — nonce-per-request is the next step.
    "'unsafe-inline'",
    ...(dev ? ["'unsafe-eval'"] : []),
    "https://va.vercel-scripts.com",
    "https://fonts.googleapis.com",
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.sentry.io",
    // The worker profile embeds OpenStreetMap's map frame
    // (src/components/worker/map-embed.tsx). Without an explicit `frame-src`
    // the browser falls back to `default-src 'self'` and blocks it, so the map
    // silently failed to render on every profile — the exception is named here
    // rather than by loosening default-src.
    "frame-src https://www.openstreetmap.org",
    "connect-src 'self' https://vitals.vercel-insights.com https://*.sentry.io https://*.ingest.sentry.io",
    // Only THIS app may frame itself: the map exception above is a frame this
    // page embeds, not a document allowed to embed us.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // HTTPS-only — see the header note: on an http origin this directive makes
    // same-origin form submissions/redirects stop matching `form-action 'self'`.
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
