import { describe, expect, it } from "vitest";

import { buildCsp } from "@/lib/security/csp";

/**
 * The CSP is one policy built in one place (src/lib/security/csp.ts) and
 * consumed by both `src/proxy.ts` and `next.config.ts`. These tests pin the
 * property that matters for dev: React's development build needs `eval()`, so
 * `unsafe-eval` is allowed for `next dev` — and ONLY there. A production build
 * (or the test runner) must never ship it.
 */
describe("Content Security Policy", () => {
  it("production forbids eval", () => {
    const csp = buildCsp(false);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("development allows eval so React's dev build can run its diagnostics", () => {
    expect(buildCsp(true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("differs ONLY by the eval allowance", () => {
    const stripEval = (csp: string) => csp.replace(" 'unsafe-eval'", "");
    expect(buildCsp(false)).toBe(stripEval(buildCsp(true)));
  });

  it("keeps every hardening directive in both modes", () => {
    for (const csp of [buildCsp(true), buildCsp(false)]) {
      for (const directive of [
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        // The map embed is a real frame-src consumer; naming it here is what
        // keeps `default-src 'self'` from silently blocking the map again.
        "frame-src https://www.openstreetmap.org",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ]) {
        expect(csp, `missing ${directive}`).toContain(directive);
      }
    }
  });

  it("allows the worker-profile map frame without loosening default-src", () => {
    // Regression pin: `default-src 'self'` (correct) blocks any cross-origin
    // frame unless `frame-src` names it, so the OSM map rendered as an empty
    // box and logged a CSP violation on every profile page.
    for (const csp of [buildCsp(true), buildCsp(false)]) {
      expect(csp).toContain("frame-src https://www.openstreetmap.org");
      expect(csp).toContain("default-src 'self'");
      // frame-ancestors must stay locked down — embedding is one-way.
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("frame-src *");
    }
  });

  it("emits upgrade-insecure-requests only for an HTTPS document", () => {
    // On a plain-HTTP origin the directive rewrites same-origin form POSTs (and
    // their redirects) to https, so `form-action 'self'` blocks them — the
    // simulated checkout could not be completed locally because of it.
    expect(buildCsp(false, true)).toContain("upgrade-insecure-requests");
    expect(buildCsp(false, false)).not.toContain("upgrade-insecure-requests");
    // …and that is the ONLY difference between the two transport variants.
    expect(buildCsp(true, false)).toBe(buildCsp(true, true).replace("; upgrade-insecure-requests", ""));
  });

  it("does not allow eval by default outside next dev", () => {
    // `npm test` runs with NODE_ENV=test — the default must still be hardened,
    // so the dev allowance can never leak into a build by accident.
    expect(buildCsp()).not.toContain("unsafe-eval");
  });
});
