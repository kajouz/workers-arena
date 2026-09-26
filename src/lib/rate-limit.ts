/**
 * Distributed rate limiter — Upstash Redis REST (edge-compatible) with in-memory fallback.
 * Proxy (edge) and API routes share this so multi-region Vercel can't
 * be bypassed by hitting different edges. In-memory Map is dev/preview-only fallback.
 */

const memBuckets = new Map<string, { count: number; resetAt: number }>();

// Keys are per-IP (and per-ad for impressions), so the map would otherwise grow
// for the life of the instance. Sweep expired buckets once it gets large.
const MEM_SWEEP_THRESHOLD = 10_000;

function memRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (memBuckets.size > MEM_SWEEP_THRESHOLD) {
    for (const [k, b] of memBuckets) if (b.resetAt < now) memBuckets.delete(k);
  }
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    // One round trip: INCR, then set the window's TTL only if the key has none
    // (PEXPIRE … NX). Separate calls cost two hops per request, and a failed
    // second call left a key with no TTL — that caller stayed blocked forever.
    const res = await fetch(`${restUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${restToken}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs), "NX"],
      ]),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const [incr] = (await res.json()) as Array<{ result?: number; error?: string }>;
    if (typeof incr?.result !== "number") return null;
    return incr.result <= limit;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
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
