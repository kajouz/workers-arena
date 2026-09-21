import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Session-cookie detection + the proxy's cache-control policy.
//
// src/proxy.ts stamps Cache-Control per request: session-cookie requests get
// `private, no-store` (every page renders the header's Sign in ⇄ avatar switch,
// and dashboards embed per-user data — a shared cache must never hold them);
// anonymous requests keep the public s-maxage=60 policy.
//
// Anonymous used to mean "has never touched the site". The locale and theme
// cookies both personalized the SSR document, and the theme bootstrap writes
// its cookie on the first page view — so from the second view onward EVERY
// visitor got `private, no-store` and nothing was ever shared-cached. Language
// now lives in the URL and the theme is applied client-side, so neither cookie
// changes the markup and anonymous traffic is cacheable again. The tests below
// pin both halves of that.
// ─────────────────────────────────────────────────────────────────────────────

import { AUTH_SESSION_COOKIE_NAMES, SESSION_COOKIE_NAME, hasSessionCookie } from "../src/lib/session-cookie";
import { hasPersonalizationCookie } from "../src/lib/personalization-cookie";
import { proxy } from "../src/proxy";

/**
 * Minimal NextRequest double — proxy() touches nextUrl (incl. clone(), for the
 * locale redirect), headers, cookies and method.
 */
function makeRequest(
  url: string,
  opts: { cookie?: string; method?: string } = {}
): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const pairs = (opts.cookie ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return i === -1 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
    });
  const jar = new Map(pairs as [string, string][]);
  const nextUrl = new URL(url) as URL & { clone: () => URL };
  nextUrl.clone = () => makeRequest(url, opts).nextUrl as URL;
  return {
    nextUrl,
    headers,
    cookies: { get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) },
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
    expect(await cacheControlOf("http://localhost:3000/en/dashboard", { cookie: "wa_session=x" })).toBe(
      "private, no-store"
    );
  });

  it("authenticated admin/company/bookings/notifications pages get private, no-store", async () => {
    for (const path of ["/en/admin", "/ar/company", "/en/bookings", "/ar/notifications", "/en/favorites"]) {
      expect(await cacheControlOf(`http://localhost:3000${path}`, { cookie: "wa_session=x" })).toBe(
        "private, no-store"
      );
    }
  });

  it("NextAuth session-token cookies also force private, no-store", async () => {
    expect(await cacheControlOf("http://localhost:3000/en", { cookie: "__Secure-authjs.session-token=x" })).toBe(
      "private, no-store"
    );
  });

  it("anonymous pages keep the public edge-cache policy", async () => {
    expect(await cacheControlOf("http://localhost:3000/en")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    expect(await cacheControlOf("http://localhost:3000/ar/search", { cookie: "consent=1" })).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
  });

  it("the locale and theme cookies no longer defeat shared caching", async () => {
    // This is the regression that mattered: the theme bootstrap writes
    // wa_theme on the first page view, so asserting `private, no-store` for
    // these cookies meant asserting that every returning visitor — and every
    // crawler that accepted a cookie — bypassed the edge cache entirely.
    //
    // The document no longer depends on either cookie: the locale is the URL
    // being requested, and the theme class is applied by the bootstrap script
    // client-side. A visitor carrying them gets the same bytes as one who is
    // not, so the response is shared-cacheable.
    for (const cookie of ["wa_locale=ar", "wa_theme=dark", "wa_locale=ar; wa_theme=dark; consent=1"]) {
      expect(await cacheControlOf("http://localhost:3000/ar/search", { cookie })).toBe(
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      );
    }
  });

  it("a session cookie still beats any personalization cookie", async () => {
    expect(
      await cacheControlOf("http://localhost:3000/ar/search", {
        cookie: "wa_locale=ar; wa_theme=dark; wa_session=x",
      })
    ).toBe("private, no-store");
  });

  it("nothing is registered as personalizing the document", () => {
    // PERSONALIZATION_COOKIE_NAMES is empty by design. If a cookie starts
    // influencing SSR output again it belongs on that list, and this
    // assertion is where that decision surfaces.
    expect(hasPersonalizationCookie("wa_locale=ar")).toBe(false);
    expect(hasPersonalizationCookie("wa_theme=dark")).toBe(false);
    expect(hasPersonalizationCookie(null)).toBe(false);
    expect(hasPersonalizationCookie("")).toBe(false);
  });

  it("API routes are untouched (they set their own cache headers)", async () => {
    expect(await cacheControlOf("http://localhost:3000/api/workers")).toBeNull();
    expect(await cacheControlOf("http://localhost:3000/api/workers", { cookie: "wa_session=x" })).toBeNull();
  });

  it("other security headers are still stamped on authenticated requests", async () => {
    const response = await proxy(makeRequest("http://localhost:3000/en/dashboard", { cookie: "wa_session=x" }));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
  });
});

describe("proxy locale routing", () => {
  it("sends a prefix-less page to the preferred locale with a 301", async () => {
    const res = await proxy(makeRequest("http://localhost:3000/search?q=plumber"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toContain("/en/search?q=plumber");
  });

  it("honours the saved preference, then Accept-Language, then English", async () => {
    const saved = await proxy(makeRequest("http://localhost:3000/search", { cookie: "wa_locale=ar" }));
    expect(saved.headers.get("location")).toContain("/ar/search");

    const req = makeRequest("http://localhost:3000/search");
    req.headers.set("accept-language", "ar-LB,ar;q=0.9,en;q=0.5");
    const negotiated = await proxy(req);
    expect(negotiated.headers.get("location")).toContain("/ar/search");

    const fallback = await proxy(makeRequest("http://localhost:3000/search"));
    expect(fallback.headers.get("location")).toContain("/en/search");
  });

  it("leaves an already-prefixed path alone", async () => {
    const res = await proxy(makeRequest("http://localhost:3000/ar/search"));
    expect(res.status).not.toBe(301);
  });

  it("never redirects API routes or public files", async () => {
    for (const path of ["/api/workers", "/robots.txt", "/sitemap.xml", "/sw.js", "/icons/icon-192.png"]) {
      const res = await proxy(makeRequest(`http://localhost:3000${path}`));
      expect(res.status, path).not.toBe(301);
    }
  });

  it("does not 301 a POST — browsers rewrite that to GET and drop the body", async () => {
    // A Server Action posts to the page's own URL. A 301 here would turn it
    // into a GET and silently discard the action payload.
    const res = await proxy(makeRequest("http://localhost:3000/search", { method: "POST" }));
    expect(res.status).not.toBe(301);
  });
});
