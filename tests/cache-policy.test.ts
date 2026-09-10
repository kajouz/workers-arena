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

function cacheControlOf(url: string, opts: { cookie?: string; method?: string } = {}): string | null {
  const response = proxy(makeRequest(url, opts));
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
  it("authenticated dashboard gets private, no-store", () => {
    expect(cacheControlOf("http://localhost:3000/dashboard", { cookie: "wa_session=x" })).toBe(
      "private, no-store"
    );
  });

  it("authenticated admin/company/bookings/notifications pages get private, no-store", () => {
    for (const path of ["/admin", "/company", "/bookings", "/notifications", "/favorites"]) {
      expect(cacheControlOf(`http://localhost:3000${path}`, { cookie: "wa_session=x" })).toBe(
        "private, no-store"
      );
    }
  });

  it("NextAuth session-token cookies also force private, no-store", () => {
    expect(cacheControlOf("http://localhost:3000/", { cookie: "__Secure-authjs.session-token=x" })).toBe(
      "private, no-store"
    );
  });

  it("anonymous pages keep the public edge-cache policy", () => {
    expect(cacheControlOf("http://localhost:3000/")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    expect(cacheControlOf("http://localhost:3000/search", { cookie: "wa_theme=dark; consent=1" })).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
  });

  it("API routes are untouched (they set their own cache headers)", () => {
    expect(cacheControlOf("http://localhost:3000/api/workers")).toBeNull();
    expect(cacheControlOf("http://localhost:3000/api/workers", { cookie: "wa_session=x" })).toBeNull();
  });

  it("other security headers are still stamped on authenticated requests", () => {
    const response = proxy(makeRequest("http://localhost:3000/dashboard", { cookie: "wa_session=x" }));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});
