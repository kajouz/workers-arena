import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://workers-arena.vercel.app";

/**
 * Private areas, as app paths. Each one is emitted once per locale, because a
 * robots.txt `Disallow` is a literal path prefix: after the move to `/en/…`
 * and `/ar/…`, a bare `Disallow: /dashboard` stopped matching anything and
 * every dashboard, admin and booking URL silently became crawlable.
 */
const PRIVATE_PATHS = [
  "/dashboard",
  "/admin",
  "/company",
  "/bookings",
  "/favorites",
  "/notifications",
  "/debug/",
] as const;

/** `/dashboard` → `/en/dashboard`, `/ar/dashboard`. */
function perLocale(paths: readonly string[]): string[] {
  return locales.flatMap((locale) => paths.map((path) => `/${locale}${path}`));
}

export default function robots(): MetadataRoute.Robots {
  const privatePaths = perLocale(PRIVATE_PATHS);

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /auth/* is kept out of the general crawl (nothing to index, and the
        // demo sign-in buttons are actions, not content) but left visible to
        // Googlebot below, matching the previous split.
        disallow: ["/api/", ...privatePaths, ...perLocale(["/auth/"])],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", ...privatePaths],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
