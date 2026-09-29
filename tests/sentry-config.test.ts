import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * next.config.ts wraps the app with Sentry inside a try/catch, so a wrong
 * import path does not fail the build — it silently drops the wrap (tunnel
 * route, source maps). That is exactly what the Sentry 11 upgrade would have
 * done: it removed `withSentryConfig` from the package root. Pin both halves.
 */
describe("Sentry build wrap", () => {
  it("next.config.ts reads withSentryConfig from @sentry/nextjs/config", () => {
    const src = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
    expect(src).toContain('require("@sentry/nextjs/config")');
  });

  it("the installed Sentry exports withSentryConfig there", () => {
    const req = createRequire(join(__dirname, "..", "package.json"));
    expect(typeof req("@sentry/nextjs/config").withSentryConfig).toBe("function");
  });
});
