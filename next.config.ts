import type { NextConfig } from "next";

// NEXT_DIST_DIR isolates the build/dev cache (used by the E2E hydration smoke
// test so its `next dev` can't clash with a concurrently running preview).
const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
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
