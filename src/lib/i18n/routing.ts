/**
 * ────────────────────────────────────────────────────────────────────────────
 * LOCALE-AWARE PATHS — the one place that knows the URL shape
 * ────────────────────────────────────────────────────────────────────────────
 * Every public route lives under `/{locale}/…`. Nothing in the app writes that
 * prefix by hand: components keep their plain `href="/search"` and the
 * locale-aware <Link> adds the prefix, server redirects go through
 * localeRedirect(), and the proxy uses these helpers to send a prefix-less
 * request to the right place.
 *
 * Dependency-free on purpose — src/proxy.ts runs on the edge and imports it.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { defaultLocale, isLocale, locales, type Locale } from "./config";

/**
 * Paths served OUTSIDE the `[locale]` segment, which must never be prefixed
 * or redirected: API routes, Next internals, and the app-root special files
 * (they have one canonical URL each — a crawler looks for /robots.txt, not
 * /en/robots.txt).
 */
const UNPREFIXED_PREFIXES = ["/api/", "/_next/", "/_vercel/", "/icons/"] as const;

const UNPREFIXED_EXACT = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/manifest.json",
  "/sw.js",
  "/favicon.ico",
  "/icon.svg",
]);

/** True when a path is served outside the locale segment. */
export function isUnprefixedPath(pathname: string): boolean {
  if (UNPREFIXED_EXACT.has(pathname)) return true;
  if (UNPREFIXED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Any file-looking request (has an extension) is a public asset.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

/** The locale a path already carries, or null. `/ar/search` → "ar". */
export function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

/** `/ar/search` → `/search`. A bare `/ar` → `/`. Unprefixed paths pass through. */
export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname);
  if (!locale) return pathname;
  const rest = pathname.slice(locale.length + 1);
  return rest === "" ? "/" : rest;
}

/**
 * Prefix a locale-less app path. Idempotent: a path that already carries a
 * locale is re-prefixed with the one asked for, so the language switcher can
 * map the current URL onto the other language.
 */
export function localePath(locale: Locale, pathname: string): string {
  if (isUnprefixedPath(pathname)) return pathname;
  const bare = stripLocale(pathname.startsWith("/") ? pathname : `/${pathname}`);
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/**
 * The `alternates` entry for a page's metadata — every page advertises both
 * languages plus an x-default, which is what lets Google index the Arabic
 * side as its own document instead of a duplicate.
 */
export function localeAlternates(pathname: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  const bare = stripLocale(pathname);
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = localePath(locale, bare);
  languages["x-default"] = localePath(defaultLocale, bare);
  return { canonical: localePath(localeFromPath(pathname) ?? defaultLocale, bare), languages };
}
