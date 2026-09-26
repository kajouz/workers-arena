import { isUnprefixedPath, localeFromPath } from "@/lib/i18n/routing";

/**
 * Paths that keep working while maintenance mode is on. Admins must still be
 * able to sign in and turn it off, and machine traffic (cron, payment and
 * WhatsApp webhooks, health checks, error reports) must not be lost.
 */
const EXEMPT_API_PREFIXES = [
  "/api/admin/",
  "/api/auth/",
  "/api/session",
  "/api/health",
  "/api/cron/",
  "/api/webhooks/",
  "/api/payments/webhook",
  "/api/sentry-tunnel",
];

/** Locale-less page paths (after stripping `/en`, `/ar`) that stay open. */
const EXEMPT_PAGE_PREFIXES = ["/admin", "/auth/login", "/maintenance"];

export function maintenanceExempt(pathname: string): boolean {
  if (pathname.startsWith("/api/")) {
    return EXEMPT_API_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
  }
  // Static files, manifest, service worker, robots, sitemap…
  if (isUnprefixedPath(pathname)) return true;
  const locale = localeFromPath(pathname);
  const rest = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
  return EXEMPT_PAGE_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
}
