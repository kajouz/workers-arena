import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Shared password for the seeded demo accounts (prisma/seed.ts) — real-mode
 * one-click demo sign-in (src/app/actions/auth.ts) authenticates with it.
 * Lives here (not in auth-demo.ts, which imports next/headers) so it can never
 * leak into a client bundle.
 */
export const DEMO_PASSWORD = "Password123!";

/**
 * scrypt parameters (interactive-login baseline).
 * N=2^14, r=8, p=1 → 16 MiB of memory. This is the largest cost that fits
 * OpenSSL's DEFAULT scrypt memory cap (32 MiB) on stock Node — N=2^15 needs
 * exactly 32 MiB and throws "memory limit exceeded" without an openssl.cnf
 * override. Costs are stored IN each hash, so raising N later (2^16/2^17 with
 * a tuned OpenSSL config) upgrades new hashes without breaking old rows.
 * Salt is 16 random bytes; output is 64 bytes.
 */
const SCRYPT_N = 1 << 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/**
 * scrypt password hashing. Format: `scrypt$N$r$p$<saltHex>$<hashHex>`.
 * Costs are stored IN the hash so they can be raised later without breaking
 * existing rows (verify reads them back and re-derives with the same costs).
 */
export function hashPassword(password: string, salt = randomBytes(SCRYPT_SALT_BYTES).toString("hex")): string {
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString("hex")}`;
}

/**
 * Legacy pre-scrypt format: `salt:sha256(salt+password)` (single unsalted
 * iteration — the old demo-grade scheme). VERIFY ONLY — never re-hash with it.
 */
function isLegacySha256Format(stored: string): boolean {
  return !stored.startsWith("scrypt$") && stored.includes(":");
}

function scryptFromStored(stored: string): { n: number; r: number; p: number; salt: string; hash: string } | null {
  const parts = stored.split("$");
  // scrypt$N$r$p$salt$hash → 6 parts
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const hash = parts[5];
  // Sanity-cap the costs: a crafted row with an absurd N could pin the CPU
  // during verify (DoS). 2^21 N ≈ 2 GiB — far above anything we'd configure.
  const MAX_N = 1 << 21;
  if (!Number.isInteger(n) || n < 2 || n > MAX_N) return null;
  if (!Number.isInteger(r) || r < 1 || r > 64) return null;
  if (!Number.isInteger(p) || p < 1 || p > 16) return null;
  if (!salt || !hash) return null;
  return { n, r, p, salt, hash };
}

/**
 * Verify a password against a stored hash. Understands both the current
 * scrypt format and the legacy `salt:sha256` format (so pre-migration rows
 * keep working).
 */
export function verifyPassword(password: string, stored: string): boolean {
  const scryptParts = scryptFromStored(stored);
  if (scryptParts) {
    const { n, r, p, salt, hash } = scryptParts;
    const candidate = scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, r, p });
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(candidate);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  if (isLegacySha256Format(stored)) {
    const [salt, hash] = stored.split(":");
    const candidate = createHash("sha256").update(salt + password).digest("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(candidate, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return false;
}

/**
 * True when the stored hash uses the legacy SHA-256 scheme — callers should
 * re-hash with hashPassword() and persist the upgrade (rehash-on-login).
 */
export function needsPasswordRehash(stored: string): boolean {
  return isLegacySha256Format(stored);
}

/** Strip dangerous characters from user-generated text (XSS hardening). */
export function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .slice(0, maxLength)
    .trim();
}

/** Basic in-memory rate limiter: n requests per window per key. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function csrfToken(): string {
  return randomBytes(24).toString("hex");
}

// ── Demo session cookie HMAC (C3) ───────────────────────────────────────────
/** Secret used to sign the demo wa_session cookie. AUTH_SECRET when set, else dev fallback. */
function getSessionSecret(): string {
  const raw = process.env.AUTH_SECRET ?? "";
  if (raw && !raw.includes("replace-me") && raw.length >= 16) return raw;
  // Fail-closed only for real-mode production (DEMO_MODE=false) — demo/E2E
  // still needs to boot without a real secret. Dev fallback is never used in
  // real prod because realAuthEnabled would already require a real secret.
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "false") {
    // Return placeholder — getSession will reject via demoSessionAllowed path,
    // but signing itself shouldn't crash the module load.
    return raw || "placeholder-secret-will-be-rejected";
  }
  return "dev-session-secret-not-for-production";
}

/** Sign a raw payload (base64url JSON) with HMAC-SHA256. */
export function signSessionPayload(payload: string): string {
  const sig = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Verify a signed payload. Returns the payload if valid, null otherwise. */
export function verifySessionPayload(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return payload;
}

/**
 * Production guard: refuse to run the forgeable demo cookie-session path in a
 * production runtime UNLESS demo mode was explicitly requested. The demo
 * session is an unsigned JSON cookie that grants any role (including admin).
 *
 * DEMO_MODE=true is the documented, deliberate opt-in — the e2e-smoke prod
 * matrix and the CI Playwright job boot production servers with it on purpose
 * (keyless, database-free E2E). The misconfiguration this guard targets is a
 * production deploy where DEMO_MODE is unset or "false": there the app must
 * never trust the cookie (it fails loud via getSession()'s console error
 * instead of silently granting a forgeable admin session).
 */
export function demoSessionAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DEMO_MODE === "true";
}

/**
 * Legacy UNSIGNED demo cookies (the pre-C3 `wa_session` payload) are a
 * development and E2E affordance — never a production trust decision.
 *
 * The payload is client-authored JSON, so `{"role":"admin"}` typed into a
 * cookie jar IS  an admin session: `curl -H 'Cookie: wa_session={"role":"admin"}'`
 * reached /api/admin/retention on the live deployment while this was gated on
 * DEMO_MODE, because DEMO_MODE=true in production (the demo-data showcase)
 * also switched the cookie path on. Data mode and cookie trust are separate
 * decisions and are now separate switches.
 *
 * Production therefore accepts only the HMAC-signed form unless the runtime
 * explicitly opts in with ALLOW_UNSIGNED_DEMO_COOKIE=1 — the same shape as
 * RATE_LIMIT_DISABLED, and set only by the E2E harnesses (the Playwright prod
 * matrix and the e2e-smoke prod leg), which sign in by seeding the cookie
 * directly rather than walking the login flow.
 */
export function unsignedDemoCookieAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_UNSIGNED_DEMO_COOKIE === "1";
}
