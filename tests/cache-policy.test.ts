import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Session-cookie detection + the proxy's cache-control policy.
//
// src/proxy.ts stamps Cache-Control per request: session-cookie requests get
// `private, no-store` (every page renders the header's Sign in ⇄ avatar switch,
// and dashboards embed per-user data — a shared cache must never hold them);
// anonymous requests keep the public s-maxage=60 policy.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTH_SESSION_COOKIE_NAMES, SESSION_COOKIE_NAME, hasSessionCookie } from "../src/lib/session-cookie";
import { hasPersonalizationCookie } from "../src/lib/personalization-cookie";
import { proxy } from "../src/proxy";

/** Minimal NextRequest double — proxy() only touches nextUrl, headers, method. */
function makeRequest(
  url: string,
  opts: { cookie?: string; method?: string } = {}
): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  return {
    nextUrl: new URL(url),
    headers,
    method: opts.method ?? "GET",
  } as unknown as NextRequest;
}

async function cacheControlOf(url: string, opts: { cookie?: string; method?: string } = {}): Promise<string | null> {
  const response = await proxy(makeRequest(url, opts));
  return response.headers.get("Cache-Control");
}

describe("hasSessionCookie", () => {
  it("detects the demo session cookie", () => {
    expect(hasSessionCookie(`${SESSION_COOKIE_NAME}=whatever`)).toBe(true);
    expect(hasSessionCookie("wa_theme=dark; wa_session=abc; consent=1")).toBe(true);
  });

  it("detects every NextAuth v5/v4 session-token variant", () => {
    for (const name of AUTH_SESSION_COOKIE_NAMES) {
      expect(hasSessionCookie(`${name}=x`)).toBe(true);
    }
  });

  it("is exact-name: a lookalike cookie must NOT flip the policy", () => {
    expect(hasSessionCookie("wa_session_backup=abc")).toBe(false);
    expect(hasSessionCookie("fake_wa_session=abc")).toBe(false);
    expect(hasSessionCookie("next-auth.session-token-old=abc")).toBe(false);
  });

  it("ignores whitespace and non-session cookies", () => {
    expect(hasSessionCookie("  wa_theme=dark ;  consent=1 ")).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
  });

  it("matches a bare cookie name without '=' (cookie constraints edge)", () => {
    expect(hasSessionCookie("wa_session")).toBe(true);
  });
});

describe("proxy cache-control policy", () => {
  it("authenticated dashboard gets private, no-store", async () => {
    expect(await cacheControlOf("http://localhost:3000/dashboard", { cookie: "wa_session=x" })).toBe(
      "private, no-store"
    );
  });

  it("authenticated admin/company/bookings/notifications pages get private, no-store", async () => {
    for (const path of ["/admin", "/company", "/bookings", "/notifications", "/favorites"]) {
      expect(await cacheControlOf(`http://localhost:3000${path}`, { cookie: "wa_session=x" })).toBe(
        "private, no-store"
      );
    }
  });

  it("NextAuth session-token cookies also force private, no-store", async () => {
    expect(await cacheControlOf("http://localhost:3000/", { cookie: "__Secure-authjs.session-token=x" })).toBe(
      "private, no-store"
    );
  });

  it("anonymous pages keep the public edge-cache policy", async () => {
    expect(await cacheControlOf("http://localhost:3000/")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    expect(await cacheControlOf("http://localhost:3000/search", { cookie: "consent=1" })).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
  });

  it("personalized anonymous pages (locale/theme cookies) get private, no-store", async () => {
    // The SSR document carries the cookie's <html lang dir class> — the
    // browser's stale-while-revalidate would otherwise serve the PREVIOUS
    // locale/theme's document after a flip (the /search-ar-rendered-EN bug).
    for (const cookie of ["wa_locale=ar", "wa_theme=dark", "wa_locale=ar; consent=1"]) {
      expect(await cacheControlOf("http://localhost:3000/search", { cookie })).toBe(
        "private, no-store"
      );
    }
  });

  it("is exact-name: a lookalike personalization cookie must NOT flip the policy", async () => {
    expect(await cacheControlOf("http://localhost:3000/search", { cookie: "wa_locale_backup=ar" })).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    expect(hasPersonalizationCookie("wa_theme_backup=dark")).toBe(false);
    expect(hasPersonalizationCookie(null)).toBe(false);
    expect(hasPersonalizationCookie("")).toBe(false);
  });

  it("API routes are untouched (they set their own cache headers)", async () => {
    expect(await cacheControlOf("http://localhost:3000/api/workers")).toBeNull();
    expect(await cacheControlOf("http://localhost:3000/api/workers", { cookie: "wa_session=x" })).toBeNull();
  });

  it("other security headers are still stamped on authenticated requests", async () => {
    const response = await proxy(makeRequest("http://localhost:3000/dashboard", { cookie: "wa_session=x" }));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});
