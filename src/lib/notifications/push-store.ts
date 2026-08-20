import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PUSH SUBSCRIPTION REGISTRY
 * ────────────────────────────────────────────────────────────────────────────
 * Two adapters behind one API (the web-push provider and /api/push/register
 * route never change):
 *
 *   • prisma — production. `PushSubscription` model (prisma/schema.prisma)
 *     with a UNIQUE index on endpoint, so re-registrations dedupe at the DB
 *     level. Selected when demo mode is OFF (DEMO_MODE=false) and DATABASE_URL
 *     is set — the same gate as src/lib/server/prisma.ts.
 *   • file  — demo/dev/tests. A JSON file (default `.data/push-subscriptions
 *     .json`, gitignored) bridges Next.js dev's route-handler vs server-action
 *     module split and survives restarts. Selected in demo mode (default), when
 *     DATABASE_URL is absent, or when PUSH_STORE_FILE is set (test override).
 *     Demo mode stays file-backed even with a DATABASE_URL present, because the
 *     app's data is in-memory there and demo session ids aren't real user rows.
 *
 * Every entry is stamped with its owner so unregister requests can be checked
 * against the acting session (no cross-user endpoint removal). Exactly one of
 * the two stamps is populated (see pushOwnerStamp):
 *   • ownerId — demo/dev cookie-session id (u-worker, …). No FK, because demo
 *     sessions have no user row.
 *   • userId  — production User FK once NextAuth is wired (migration
 *     20260809000001_push_subscription_user_fk, ON DELETE CASCADE).
 * The adapter is chosen by config per call — no fallback on runtime DB errors,
 * so state never silently splits across two stores.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Demo/dev owner stamp (cookie-session id — no user row exists). */
  ownerId?: string;
  /** Production owner stamp (FK to prisma.user.id). */
  userId?: string;
  /** Friendly device label captured from the registering client's User-Agent. */
  device?: string;
}

/**
 * Admin-facing listing row: owner + device + activity timestamps. Deliberately
 * does NOT carry the subscription keys (p256dh/auth) — the admin surface has no
 * use for them, so they never leave the server.
 */
export interface PushSubscriptionRecord {
  endpoint: string;
  /** Demo/dev owner stamp (cookie-session id — no user row exists). */
  ownerId?: string;
  /** Production owner stamp (FK to prisma.user.id). */
  userId?: string;
  /** Friendly device label captured from the registering client's User-Agent. */
  device?: string;
  /** First registration time (ISO). */
  registeredAt: string;
  /** Last (re-)registration / activity time (ISO). */
  lastActiveAt: string;
}

/**
 * Demo cookie session ids all share this prefix (src/lib/auth-demo.ts). Real
 * NextAuth ids are Prisma cuids (base36, no hyphens), so they can never collide
 * with it — the prefix check is collision-safe by construction.
 */
const DEMO_SESSION_PREFIX = "u-";

/**
 * Choose the owner stamp for a registration.
 *
 * Demo sessions (`u-…` cookie ids, src/lib/auth-demo.ts) have no user row, so
 * they stamp the non-FK `ownerId`. Real authenticated users (NextAuth, src/
 * auth.ts) carry a prisma.user.id and stamp the `userId` FK instead.
 *
 * Swap step when real auth lands: replace `getSession()` with `auth()` and this
 * helper automatically emits `userId` — no store/route changes needed (see
 * docs/ARCHITECTURE.md → Push subscriptions).
 */
export function pushOwnerStamp(session: { id: string }): { ownerId?: string; userId?: string } {
  return session.id.startsWith(DEMO_SESSION_PREFIX) ? { ownerId: session.id } : { userId: session.id };
}

/** Which adapter is active. Exported for tests and observability. */
export function storeAdapterMode(): "file" | "prisma" {
  // Explicit test/dev override wins.
  if (process.env.PUSH_STORE_FILE) return "file";
  // Production requires demo mode OFF + a configured DB.
  if (process.env.DEMO_MODE !== "false") return "file";
  return process.env.DATABASE_URL ? "prisma" : "file";
}

/* ────────────────────────────── File adapter ────────────────────────────── */

function storePath(): string {
  return process.env.PUSH_STORE_FILE ?? path.join(process.cwd(), ".data", "push-subscriptions.json");
}

interface FileEntry extends PushSubscriptionJson {
  registeredAt: string;
  lastActiveAt: string;
}

async function readFileStore(): Promise<Map<string, FileEntry>> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ storePath(), "utf8");
    const arr = JSON.parse(raw) as FileEntry[];
    return new Map(arr.map((s) => [s.endpoint, s]));
  } catch {
    return new Map(); // missing/corrupt file → empty registry
  }
}

/** Atomic write: temp file + rename so a crash can't corrupt the registry. */
async function writeFileStore(map: Map<string, PushSubscriptionJson>): Promise<void> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify([...map.values()], null, 2), "utf8");
  await fs.rename(tmp, p);
}

/** Serialize read→mutate→write per process so concurrent mutations can't lose updates. */
let chain: Promise<unknown> = Promise.resolve();

function mutateFileStore<T>(mutate: (map: Map<string, FileEntry>) => T): Promise<T> {
  const run = chain.then(async () => {
    const map = await readFileStore();
    const result = mutate(map);
    await writeFileStore(map);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}

async function fileRegister(sub: PushSubscriptionJson): Promise<boolean> {
  return mutateFileStore((map) => {
    const prev = map.get(sub.endpoint);
    const now = new Date().toISOString();
    map.set(sub.endpoint, {
      ...sub,
      // Preserve the original registration time across re-registrations.
      registeredAt: prev?.registeredAt ?? now,
      lastActiveAt: now,
    });
    return true;
  });
}

/** Ownership check shared by both adapters: matches either stamp. */
function ownsSubscription(sub: PushSubscriptionJson, actingId?: string): boolean {
  if (!actingId) return true; // no identity passed → caller is trusted (internal ops)
  // A row with neither stamp (legacy/corrupt) can never be claimed — sessions
  // cannot delete it via the API; it needs manual cleanup (see ARCHITECTURE.md).
  return sub.ownerId === actingId || sub.userId === actingId;
}

async function fileUnregister(endpoint: string, actingId?: string): Promise<boolean> {
  return mutateFileStore((map) => {
    const sub = map.get(endpoint);
    if (!sub) return true; // already gone — idempotent
    if (!ownsSubscription(sub, actingId)) return false; // not yours
    map.delete(endpoint);
    return true;
  });
}

async function fileGetAll(): Promise<PushSubscriptionJson[]> {
  const map = await readFileStore();
  return [...map.values()];
}

async function fileGet(endpoint: string): Promise<PushSubscriptionJson | null> {
  const map = await readFileStore();
  return map.get(endpoint) ?? null;
}

async function fileClear(): Promise<void> {
  await mutateFileStore(() => {});
}

async function fileList(): Promise<PushSubscriptionRecord[]> {
  const map = await readFileStore();
  return [...map.values()].map((s) => {
    const fallback = new Date().toISOString();
    return {
      endpoint: s.endpoint,
      ownerId: s.ownerId,
      userId: s.userId,
      device: s.device,
      // Legacy rows (pre-timestamp file format) default to "now".
      registeredAt: s.registeredAt ?? fallback,
      lastActiveAt: s.lastActiveAt ?? fallback,
    };
  });
}

async function fileForceRemove(endpoint: string): Promise<boolean> {
  return mutateFileStore((map) => {
    if (!map.has(endpoint)) return false; // nothing to remove
    map.delete(endpoint);
    return true;
  });
}

/* ───────────────────────────── Prisma adapter ───────────────────────────── */

/** Lazy-loads the Prisma singleton — never constructed in demo mode. */
async function withPrisma<T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>): Promise<T> {
  const { getPrisma } = await import("@/lib/server/prisma");
  return fn(getPrisma());
}

async function prismaRegister(sub: PushSubscriptionJson): Promise<boolean> {
  return withPrisma((db) =>
    db.pushSubscription
      .upsert({
        where: { endpoint: sub.endpoint },
        create: {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          ownerId: sub.ownerId,
          userId: sub.userId,
          device: sub.device,
        },
        update: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          ownerId: sub.ownerId,
          userId: sub.userId,
          device: sub.device,
        },
      })
      .then(() => true)
  );
}

async function prismaUnregister(endpoint: string, actingId?: string): Promise<boolean> {
  return withPrisma(async (db) => {
    const row = await db.pushSubscription.findUnique({ where: { endpoint } });
    if (!row) return true; // already gone — idempotent
    const sub: PushSubscriptionJson = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
      ownerId: row.ownerId ?? undefined,
      userId: row.userId ?? undefined,
    };
    if (!ownsSubscription(sub, actingId)) return false; // not yours
    await db.pushSubscription.delete({ where: { endpoint } });
    return true;
  });
}

async function prismaGetAll(): Promise<PushSubscriptionJson[]> {
  return withPrisma(async (db) => {
    const rows = await db.pushSubscription.findMany();
    return rows.map(rowToJson);
  });
}

function rowToJson(r: {
  endpoint: string;
  p256dh: string;
  auth: string;
  ownerId: string | null;
  userId: string | null;
  device: string | null;
}): PushSubscriptionJson {
  return {
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
    ownerId: r.ownerId ?? undefined,
    userId: r.userId ?? undefined,
    device: r.device ?? undefined,
  };
}

async function prismaGet(endpoint: string): Promise<PushSubscriptionJson | null> {
  return withPrisma(async (db) => {
    const row = await db.pushSubscription.findUnique({ where: { endpoint } });
    return row ? rowToJson(row) : null;
  });
}

async function prismaList(): Promise<PushSubscriptionRecord[]> {
  return withPrisma(async (db) => {
    const rows = await db.pushSubscription.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        endpoint: true,
        ownerId: true,
        userId: true,
        device: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      endpoint: r.endpoint,
      ownerId: r.ownerId ?? undefined,
      userId: r.userId ?? undefined,
      device: r.device ?? undefined,
      registeredAt: r.createdAt.toISOString(),
      lastActiveAt: r.updatedAt.toISOString(),
    }));
  });
}

async function prismaForceRemove(endpoint: string): Promise<boolean> {
  return withPrisma(async (db) => {
    const res = await db.pushSubscription.deleteMany({ where: { endpoint } });
    return res.count > 0;
  });
}

async function prismaClear(): Promise<void> {
  return withPrisma((db) => db.pushSubscription.deleteMany({}).then(() => undefined));
}

/* ───────────────────────────── Public API ───────────────────────────── */

/** Register (or re-register) a subscription, deduped by endpoint. */
export async function registerPushSubscription(sub: PushSubscriptionJson): Promise<boolean> {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  return storeAdapterMode() === "prisma" ? prismaRegister(sub) : fileRegister(sub);
}

/**
 * Remove a subscription. Returns false when the endpoint belongs to another
 * owner (ownership check — see /api/push/register). Idempotent for unknown
 * endpoints. Pass ownerId to enforce ownership.
 */
export async function unregisterPushSubscription(endpoint: string, ownerId?: string): Promise<boolean> {
  return storeAdapterMode() === "prisma" ? prismaUnregister(endpoint, ownerId) : fileUnregister(endpoint, ownerId);
}

/** All registered subscriptions. */
export async function getPushSubscriptions(): Promise<PushSubscriptionJson[]> {
  return storeAdapterMode() === "prisma" ? prismaGetAll() : fileGetAll();
}

/** A single subscription by endpoint, or null when not registered. */
export async function getPushSubscription(endpoint: string): Promise<PushSubscriptionJson | null> {
  return storeAdapterMode() === "prisma" ? prismaGet(endpoint) : fileGet(endpoint);
}

/**
 * Admin listing: every endpoint with its owner, device label and activity
 * timestamps, newest-active first.
 */
export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return storeAdapterMode() === "prisma" ? prismaList() : fileList();
}

/**
 * Admin force-remove: deletes an endpoint regardless of ownership (bypasses the
 * session ownership check used by /api/push/register). Returns false when the
 * endpoint didn't exist.
 */
export async function forceRemovePushSubscription(endpoint: string): Promise<boolean> {
  if (!endpoint) return false;
  return storeAdapterMode() === "prisma" ? prismaForceRemove(endpoint) : fileForceRemove(endpoint);
}

/** Test/ops helper: empty the registry. */
export async function clearPushSubscriptions(): Promise<void> {
  return storeAdapterMode() === "prisma" ? prismaClear() : fileClear();
}
