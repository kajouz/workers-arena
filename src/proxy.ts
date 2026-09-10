import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";

// Rate limiting in-memory store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const bucket = rateLimitStore.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Content Security Policy
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com https://fonts.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function proxy(request: NextRequest) {
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

  // Rate limiting for API routes
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

    if (!rateLimit(key, limit, windowMs)) {
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

    if (!rateLimit(key, 10, 60_000)) {
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
