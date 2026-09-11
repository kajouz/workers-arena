import type { NextConfig } from "next";

// NEXT_DIST_DIR isolates the build/dev cache (used by the E2E hydration smoke
// test so its `next dev` can't clash with a concurrently running preview).
// NOTE: Next treats distDir as a project-relative NAME — an absolute path is
// not honored and yields a confusing split build. Use a relative scratch name
// like `tmp/…` (git- and lint-ignored) when isolation is needed.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.sentry.io",
  "connect-src 'self' https://vitals.vercel-insights.com https://*.sentry.io https://*.ingest.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
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
