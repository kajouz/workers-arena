import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";
import { checkRateLimit } from "@/lib/rate-limit";

// Content Security Policy — hardened: no unsafe-eval (Sentry v10 doesn't need it;
// next via Turbopack also works without). unsafe-inline kept for the theme
// blocking script in src/app/layout.tsx:102 + Next's style tags — next step is
// nonce-per-request. Also covers static assets via next.config.ts headers() fallback.
const CSP_DIRECTIVES = [
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Security headers
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  );

  // ── Origin check for state-changing requests (M4) ──
  const skipOriginCheck =
    pathname.startsWith("/api/payments/webhook") || pathname.startsWith("/api/sentry-tunnel");
  if (!skipOriginCheck && request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    // Only enforce when Origin is present (browser fetches/forms); allow
    // same-origin and missing (e.g. server-to-server cron/webhook) — but reject
    // cross-origin POSTs that would carry cookies (CSRF).
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: "forbidden", reason: "origin_mismatch" }, { status: 403 });
        }
      } catch {
        // Malformed Origin — reject
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }

  // Rate limiting for API routes (distributed via Upstash Redis REST when configured)
  if (pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";
    const key = `api:${ip}:${pathname}`;

    // Different limits for different endpoints
    let limit = 60;
    let windowMs = 60_000;

    if (pathname.startsWith("/api/auth")) {
      limit = 10; // Stricter for auth
      windowMs = 15 * 60_000; // 15 minutes
    } else if (pathname.startsWith("/api/offline-queue")) {
      limit = 30; // Moderate for offline sync
    } else if (pathname.startsWith("/api/contact")) {
      limit = 5; // Very strict for contact/lead forms
      windowMs = 60_000;
    } else if (pathname.startsWith("/api/reviews")) {
      limit = 10; // Moderate for reviews
    }

    if (!(await checkRateLimit(key, limit, windowMs))) {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: Math.ceil(windowMs / 1000) },
        { status: 429 }
      );
    }
  }

  // Rate limiting for form submissions (POST requests)
  if (request.method === "POST" && !pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";
    const key = `form:${ip}:${pathname}`;

    if (!(await checkRateLimit(key, 10, 60_000))) {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: 60 },
        { status: 429 }
      );
    }
  }

  // ── Cache policy ──────────────────────────────────────────────────────────
  // Authenticated requests must NEVER be publicly cached: every page renders
  // session-aware markup (the header switches Sign in ⇄ avatar, and dashboards
  // embed per-user data), so a shared cache (CDN edge, corporate proxy) holding
  // a logged-in HTML response would leak one user's page to another. Detection
  // is cookie-based — exact name match on the request's Cookie header.
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
    if (hasSessionCookie(request.headers.get("cookie"))) {
      // Signed-in: private to this browser, never stored by any shared cache.
      // no-store also disables bfcache-safe reuse of authenticated pages.
      response.headers.set("Cache-Control", "private, no-store");
    } else {
      // Anonymous: cacheable at the edge briefly, stale-serve while revalidating.
      response.headers.set(
        "Cache-Control",
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and images
    "/((?!_next/static|_next/image|favicon.ico|icons/|public/).*)",
  ],
};
