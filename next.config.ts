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
  output: "standalone",
  images: {
    // Demo mode: the app ships fully offline-safe visuals (no remote images).
    // For production with Cloudinary/S3, remove this and configure remotePatterns.
    unoptimized: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
