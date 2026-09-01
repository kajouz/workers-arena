import type { NextConfig } from "next";

// NEXT_DIST_DIR isolates the build/dev cache (used by the E2E hydration smoke
// test so its `next dev` can't clash with a concurrently running preview).
const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  // Next 16 blocks cross-origin dev resources (HMR, first-compile chunks, fonts)
  // from hosts outside this list — the local preview runs on 127.0.0.1, so the
  // on-demand chunk compiles 403 and the first page load never hydrates without
  // this entry. Dev-only: production builds are unaffected.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // Standalone output enables a slim Docker image (see Dockerfile).
  // Disabled on Vercel — Turbopack doesn't generate .nft.json for standalone.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  images: {
    // Demo mode: the app ships fully offline-safe visuals (no remote images).
    // For production with Cloudinary/S3, remove this and configure remotePatterns.
    unoptimized: true,
  },
  poweredByHeader: false,
};

// Wrap with Sentry if DSN is configured.
// Uses dynamic import to avoid type-resolution issues with the optional dep.
function withSentry(nextCfg: NextConfig): NextConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
