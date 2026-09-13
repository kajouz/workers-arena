import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";
import { hasPersonalizationCookie } from "@/lib/personalization-cookie";
import { checkRateLimit } from "@/lib/rate-limit";

import { buildCsp } from "@/lib/security/csp";

// Content Security Policy — single-sourced in @/lib/security/csp (shared with
// next.config.ts's static fallback for _next assets, which this matcher skips).
// Hardened for production: no unsafe-eval. `next dev` additionally allows eval
// because React's development build requires it for its dev diagnostics.
//
// Both variants are built once, then chosen per request: `upgrade-insecure-
// requests` may only go out on a document actually served over HTTPS, or the
// browser rewrites same-origin form submissions/redirects to https and
// `form-action 'self'` blocks them (see the csp module's note).
const CSP_HTTPS = buildCsp();
const CSP_HTTP = buildCsp(undefined, false);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Behind a proxy/TLS terminator (Vercel) the scheme arrives as a header.
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = request.nextUrl.protocol === "https:" || forwardedProto === "https";

  // Security headers
  response.headers.set("Content-Security-Policy", secure ? CSP_HTTPS : CSP_HTTP);
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
  //
  // Next.js SERVER ACTIONS are POSTs to the CURRENT PAGE ROUTE (they carry a
  // `next-action` header), so counting them as form submissions throttled the
  // app's own UI: ten button presses on /dashboard inside a minute — accept a
  // booking, block a slot, send a chat message, renew — returned 429 and the
  // action failed client-side with "An unexpected response was received from
  // the server.", leaving the page looking broken. A worker reaches that in
  // ordinary use (blocking slots is one POST per click), and the e2e suite hit
  // it on every run.
  //
  // Actions therefore get their own, far looser bucket; a genuine form POST
  // (no `next-action` header — a contact form, a signup) keeps the strict one.
  if (request.method === "POST" && !pathname.startsWith("/api/")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";
    const isAction = request.headers.has("next-action");
    const key = `${isAction ? "action" : "form"}:${ip}:${pathname}`;

    if (!(await checkRateLimit(key, isAction ? 120 : 10, 60_000))) {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: 60 },
        { status: 429 }
      );
    }
  }

  // ── Cache policy ──────────────────────────────────────────────────────────
  // Responses that vary per-browser must NEVER be publicly cached: every page
  // renders session-aware markup (the header switches Sign in ⇄ avatar, and
  // dashboards embed per-user data), so a shared cache (CDN edge, corporate
  // proxy) holding one user's HTML would leak it to another. Detection is
  // cookie-based — exact name match on the request's Cookie header.
  //
  // Anonymous requests carrying the personalization cookies (wa_locale /
  // wa_theme) are ALSO per-browser: the SSR document is stamped with the
  // cookie's locale/theme (<html lang dir class>). A shared cache — or the
  // BROWSER's own stale-while-revalidate — would serve the previous locale's
  // document after a language flip (Chromium implements SWR for main
  // resources): stale-serve up to 300s of wrong-language/wrong-theme HTML.
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
    const cookieHeader = request.headers.get("cookie");
    if (hasSessionCookie(cookieHeader) || hasPersonalizationCookie(cookieHeader)) {
      // Signed-in or personalized: private to this browser, never stored by
      // any shared cache. no-store also disables stale-while-revalidate reuse
      // (a locale flip must never serve the previous locale's document).
      response.headers.set("Cache-Control", "private, no-store");
    } else {
      // Truly cookie-less: cacheable at the edge briefly, stale-serve while
      // revalidating. Shared caches key on the full request URL + headers, and
      // a cookie-less request always renders the same default (en/light) doc.
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
