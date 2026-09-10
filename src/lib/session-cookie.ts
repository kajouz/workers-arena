// ─────────────────────────────────────────────────────────────────────────────
// Session-cookie identity — dependency-free on purpose.
//
// src/lib/auth-demo.ts owns session LOGIC but imports next/headers, which
// cannot be imported from middleware/proxy code. The cookie NAMES live here so
// src/proxy.ts (edge) and server code share one source of truth.
// ─────────────────────────────────────────────────────────────────────────────

/** Demo-mode session cookie (unsigned JSON — dev/previews only). */
export const SESSION_COOKIE_NAME = "wa_session";

/**
 * Cookie names whose presence marks a request as authenticated:
 * the demo session cookie plus the NextAuth v5 session-token variants
 * (v5 "authjs" + v4-legacy "next-auth", plain and __Secure- prefixed).
 * Deliberately NOT the CSRF token cookie — every visitor gets one, so keying
 * on it would disable public caching for the whole site.
 */
export const AUTH_SESSION_COOKIE_NAMES: readonly string[] = [
  SESSION_COOKIE_NAME,
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

/**
 * True when the raw `Cookie` header carries a session cookie — i.e. the
 * response will contain per-user markup (dashboard data, the header's
 * Sign in/avatar switch) and must never be publicly cached.
 *
 * Exact name matching on the `;`-split pairs (NOT a substring test) so a
 * lookalike cookie like `wa_session_backup` can't flip the cache policy.
 */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=", 1)[0];
    if (name && AUTH_SESSION_COOKIE_NAMES.includes(name)) return true;
  }
  return false;
}
