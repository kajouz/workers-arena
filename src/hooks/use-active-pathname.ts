"use client";

import { usePathname } from "next/navigation";
import { locales } from "@/lib/i18n/config";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ACTIVE PATHNAME — one place that knows the locale lives in the URL
 * ────────────────────────────────────────────────────────────────────────────
 * `usePathname()` returns the FULL path including the locale segment
 * (`/en/auth/login`, `/ar/search`), because the locale is a real folder. Every
 * route comparison that forgot to strip it silently never matched:
 *
 *   • the bottom tab bar compared against `/auth/login`, so `aria-current` was
 *     `null` on EVERY tab and the bar rendered over the sign-in card;
 *   • header nav highlighting had the same bug.
 *
 * `stripLocalePrefix` is exported pure so the mapping can be unit-tested (and
 * reused server-side) without a router. Both the tab bar and the header match
 * against its output — add a comparison here, not another `startsWith`.
 */

/** `/en/search` → `/search`, `/ar` → `/`, `/search` (no locale) → `/search`. */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

/** The current route, WITHOUT the `/:locale` prefix — safe to match against. */
export function useActivePathname(): string {
  const pathname = usePathname() ?? "/";
  return stripLocalePrefix(pathname);
}
