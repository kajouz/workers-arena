/**
 * Distributed rate limiter — Upstash Redis REST (edge-compatible) with in-memory fallback.
 * Proxy (edge) and API routes share this so multi-region Vercel (`fra1` etc.) can't
 * be bypassed by hitting different edges. In-memory Map is dev/preview-only fallback.
 */

const memBuckets = new Map<string, { count: number; resetAt: number }>();

function memRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = memBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/**
 * Try Upstash Redis REST. Returns null if not configured or fetch fails (caller falls back to mem).
 * Uses INCR + PEXPIRE pipeline; TTL of windowMs. Edge-safe (fetch only, no TCP).
 */
async function upstashRateLimit(key: string, limit: number, windowMs: number): Promise<boolean | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Also support REDIS_URL as Upstash REST if it looks like https://
  const redisUrl = process.env.REDIS_URL;
  let restUrl = url;
  let restToken = token;
  if (!restUrl && redisUrl?.startsWith("https://")) {
    // Allow REDIS_URL=https://<upstash>.upstash.io with token in separate env or URL; prefer explicit.
    restUrl = redisUrl;
    restToken = token ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  }
  if (!restUrl || !restToken) return null;

  const redisKey = `ratelimit:${key}`;
  try {
    // Upstash REST pipeline: INCR key, then PTTL to decide expire. We do two calls with short timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    // INCR
    const incrRes = await fetch(`${restUrl}/incr/${encodeURIComponent(redisKey)}`, {
      headers: { Authorization: `Bearer ${restToken}` },
      signal: controller.signal,
    });
    if (!incrRes.ok) {
      clearTimeout(timeout);
      return null;
    }
    const incrJson = (await incrRes.json()) as { result?: number };
    const count = incrJson.result ?? 1;
    if (count === 1) {
      // First hit — set PEXPIRE
      await fetch(`${restUrl}/pexpire/${encodeURIComponent(redisKey)}/${windowMs}`, {
        headers: { Authorization: `Bearer ${restToken}` },
        signal: controller.signal,
      }).catch(() => {});
    }
    clearTimeout(timeout);
    return count <= limit;
  } catch {
    return null;
  }
}

/**
 * Distributed check — prefers Redis, falls back to in-memory (with warning once in prod).
 */
let warnedNoRedis = false;
export async function checkRateLimit(key: string, limit = 30, windowMs = 60_000): Promise<boolean> {
  const redisResult = await upstashRateLimit(key, limit, windowMs);
  if (redisResult !== null) return redisResult;

  if (!warnedNoRedis && process.env.NODE_ENV === "production" && process.env.UPSTASH_REDIS_REST_URL) {
    // Configured but fetch failed — warn once
    console.warn("[rate-limit] Redis unavailable, falling back to in-memory (per-instance, not distributed)");
    warnedNoRedis = true;
  }
  if (!warnedNoRedis && process.env.NODE_ENV === "production" && !process.env.UPSTASH_REDIS_REST_URL && !process.env.REDIS_URL) {
    // Only warn once per process to avoid log spam
    console.warn("[rate-limit] No UPSTASH_REDIS_REST_URL/REDIS_URL set — rate limiting is per-instance only (not distributed). Set Upstash REST credentials for production.");
    warnedNoRedis = true;
  }
  return memRateLimit(key, limit, windowMs);
}

/** Sync fallback for non-edge callers (API routes that can't await proxy). */
export function checkRateLimitSync(key: string, limit = 30, windowMs = 60_000): boolean {
  return memRateLimit(key, limit, windowMs);
}
