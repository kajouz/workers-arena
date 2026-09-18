import type { NextConfig } from "next";

import { buildCsp } from "./src/lib/security/csp";

// NEXT_DIST_DIR isolates the build/dev cache (used by the E2E hydration smoke
// test so its `next dev` can't clash with a concurrently running preview).
// NOTE: Next treats distDir as a project-relative NAME — an absolute path is
// not honored and yields a confusing split build. Use a relative scratch name
// like `tmp/…` (git- and lint-ignored) when isolation is needed.
//
// CSP is single-sourced with src/proxy.ts's dynamic header — see
// src/lib/security/csp.ts (the dev-only unsafe-eval allowance lives there).
const CSP = buildCsp();

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  // Optional runtime deps that are lazy-imported but not installed in every
  // environment. Listing them here prevents Turbopack from resolving them at
  // build time (they are loaded at runtime only when configured).
  serverExternalPackages: ["twilio", "nodemailer", "resend"],
  async headers() {
    return [
      {
        // Covers _next/static, images, etc. that proxy matcher excludes — proxy still sets same CSP dynamically
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  // Next 16 blocks cross-origin dev resources (HMR, first-compile chunks, fonts)
  // from hosts outside this list — the local preview runs on 127.0.0.1, so the
  // on-demand chunk compiles 403 and the first page load never hydrates without
  // this entry. Dev-only: production builds are unaffected.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // Standalone output enables a slim Docker image (see Dockerfile).
  // Disabled on Vercel — Turbopack doesn't generate .nft.json for standalone.
  // NEXT_DISABLE_STANDALONE=1 opts out for prod-build E2E: Playwright's CI job
  // serves the build with plain `next start`, which refuses a standalone dir
  // (standalone expects `node .next/standalone/server.js` instead).
  ...(process.env.VERCEL || process.env.NEXT_DISABLE_STANDALONE ? {} : { output: "standalone" }),
  images: {
    // Demo mode: offline-safe (no remote optimizer needed). Production uses
    // Next's optimizer with Cloudinary / remotePatterns (M5).
    unoptimized: process.env.DEMO_MODE !== "false",
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  poweredByHeader: false,
};

// Wrap with Sentry if DSN is configured.
// Uses dynamic import to avoid type-resolution issues with the optional dep.
function withSentry(nextCfg: NextConfig): NextConfig {
  try {
    const mod = require("@sentry/nextjs") as {
      withSentryConfig: (cfg: NextConfig, opts?: Record<string, unknown>) => NextConfig;
    };
    if (mod.withSentryConfig) {
      return mod.withSentryConfig(nextCfg, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        silent: true,
        widenClientFileUpload: true,
        hideSourceMaps: true,
        // disableLogger is deprecated in Sentry v10 — use logger.enabled instead
        tunnelRoute: "/api/sentry-tunnel",
        // automaticVercelMonitors removed — not supported with Turbopack
        // (Vercel uses Turbopack for builds)
      });
    }
  } catch {
    // @sentry/nextjs not available — proceed without it
  }
  return nextCfg;
}

export default withSentry(nextConfig);
