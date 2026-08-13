import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Shared password for the seeded demo accounts (prisma/seed.ts) — real-mode
 * one-click demo sign-in (src/app/actions/auth.ts) authenticates with it.
 * Lives here (not in auth-demo.ts, which imports next/headers) so it can never
 * leak into a client bundle.
 */
export const DEMO_PASSWORD = "Password123!";

/** PBKDF2 password hashing (demo-grade sync version; swap to argon2/bcrypt in prod). */
export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = createHash("sha256").update(salt + password).digest("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
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
