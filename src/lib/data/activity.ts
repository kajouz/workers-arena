import { promises as fs } from "node:fs";
import path from "node:path";
import type { ActivityEntry, VerificationFunnel } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LIVE ADMIN ACTIVITY FEED (dual adapter — mirrors src/lib/notifications/push-store.ts)
 * ────────────────────────────────────────────────────────────────────────────
 * Runtime admin events (verification decisions, push-subscription prunes,
 * forced removals, …). The admin overview prepends these to the seeded static
 * feed (src/lib/data/analytics.ts → ACTIVITIES).
 *
 * One API surface (logAdminActivity / getAdminActivityFeed /
 * resetAdminActivityFeed) backed by two adapters:
 *
 *   • file — demo/dev/tests. A JSON file (default `.data/admin-activity.json`,
 *     gitignored) bridges Next.js dev's route-handler vs server-component
 *     module split (separate module instances would silently split an
 *     in-memory array) and survives restarts. Selected in demo mode (default),
 *     when DATABASE_URL is absent, or when ADMIN_ACTIVITY_FILE is set (test
 *     override).
 *   • prisma — production. Persists to the `ActivityLog` Prisma model
 *     (prisma/schema.prisma): the machine-readable `action` code is derived
 *     from the app entry's `type`, and the display strings (`actionEn` /
 *     `actionAr`) plus the original `type` round-trip through the `meta` JSON
 *     column — same lossless-round-trip trick as the inbox
 *     (src/lib/data/notifications.ts). The `actor` display name is stored in
 *     `actorId` (a free-form string, NOT an FK — demo actors like "System" or
 *     "Platform Admin" have no user row; when real auth lands, pass the real
 *     user id there). Selected when demo mode is OFF (DEMO_MODE=false) and
 *     DATABASE_URL is set — the same gate as src/lib/server/prisma.ts.
 *
 * The adapter is chosen by config per call — no fallback on runtime DB errors,
 * so the feed never silently splits across two stores.
 * ────────────────────────────────────────────────────────────────────────────
 */

const MAX_ENTRIES = 200;

/**
 * Demo actor identities (file mode). In production the prisma adapter JOINs
 * the User row via ActivityLog.actorId — but demo sessions (u-admin, …) have
 * no user row, so the file adapter resolves these from the known demo set
 * (mirrors src/lib/auth-demo.ts → DEMO_USERS) to power the same UI.
 */
const DEMO_ACTORS: Record<string, { name: string; email: string; hue: number }> = {
  "u-admin": { name: "Platform Admin", email: "admin@workersarena.com", hue: 280 },
  "u-worker": { name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", hue: 25 },
  "u-company": { name: "BuildCo Ltd", email: "ads@buildco.sa", hue: 150 },
  "u-customer": { name: "Sara Customer", email: "sara@example.com", hue: 200 },
};

/** Valid activity `type` values — the filter options on the history page. */
export const ACTIVITY_TYPES = ["worker", "company", "review", "payment", "system", "verification", "booking"] as const;

export type ActivityTypeFilter = (typeof ACTIVITY_TYPES)[number];

/** Result of a paginated activity-history query. */
export interface ActivityPage {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/* ───────────────────────────── Adapter selection ───────────────────────────── */

/** Which adapter is active. Exported for tests and observability. */
export function activityAdapterMode(): "file" | "prisma" {
  // Explicit test/dev override wins.
  if (process.env.ADMIN_ACTIVITY_FILE) return "file";
  // Production requires demo mode OFF + a configured DB.
  if (process.env.DEMO_MODE !== "false") return "file";
  return process.env.DATABASE_URL ? "prisma" : "file";
}

/* ────────────────────────────── File adapter ────────────────────────────── */

function feedPath(): string {
  return process.env.ADMIN_ACTIVITY_FILE ?? path.join(process.cwd(), ".data", "admin-activity.json");
}

async function readFeed(): Promise<ActivityEntry[]> {
  try {
    const raw = await fs.readFile(feedPath(), "utf8");
    const arr = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return []; // missing/corrupt file → empty feed
  }
}

/** Atomic write: temp file + rename so a crash can't corrupt the feed. The tmp
 * name is unique per writer so PARALLEL processes (e.g. vitest workers sharing
 * the default .data feed) can't clobber each other's temp file; a rename that
 * loses the race just means another writer already landed its own — the feed
 * is still the fresh serialized one (last-writer-wins, benign for this file). */
async function writeFeed(feed: ActivityEntry[]): Promise<void> {
  const p = feedPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(feed, null, 2), "utf8");
  try {
    await fs.rename(tmp, p);
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Serialize read→mutate→write per process so concurrent logs can't lose entries. */
let chain: Promise<unknown> = Promise.resolve();

function mutateFeed(mutate: (feed: ActivityEntry[]) => ActivityEntry | void): Promise<ActivityEntry | undefined> {
  const run = chain.then(async () => {
    const feed = await readFeed();
    const result = mutate(feed);
    await writeFeed(feed);
    return result ?? undefined;
  });
  chain = run.catch(() => {});
  return run;
}

async function fileLog(entry: Omit<ActivityEntry, "id" | "time">): Promise<ActivityEntry> {
  return (await mutateFeed((feed) => {
    const item: ActivityEntry = {
      ...entry,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toISOString(),
    };
    feed.unshift(item);
    if (feed.length > MAX_ENTRIES) feed.length = MAX_ENTRIES;
    return item;
  }))!;
}

/** Newest-first runtime events (raw ISO times — format with timeAgo at render). */
async function fileGetFeed(): Promise<ActivityEntry[]> {
  return readFeed();
}

async function fileReset(): Promise<void> {
  await mutateFeed((feed) => {
    feed.length = 0;
  });
}

/* ────────────────────────────── File adapter ────────────────────────────── */

async function filePrune(olderThanDays: number): Promise<{ removed: number; remaining: number }> {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  // Uses the same serialized read→mutate→write chain as mutateFeed, but needs
  // the count back — mutateFeed only returns the entry, so inline the chain.
  const run = chain.then(async () => {
    const feed = await readFeed();
    const before = feed.length;
    const kept = feed.filter((e) => Date.parse(e.time) >= cutoff);
    await writeFeed(kept);
    return { removed: before - kept.length, remaining: kept.length };
  });
  chain = run.catch(() => {});
  return run;
}

/**
 * Paginated listing over the file feed with optional actor / type / code
 * filters. Filters are applied in memory, then the page is sliced out
 * newest-first.
 */
async function fileListActivity(opts: {
  page: number;
  pageSize: number;
  actor?: string;
  type?: string;
  code?: string;
}): Promise<ActivityPage> {
  const feed = await fileGetFeed();
  const actor = opts.actor?.trim().toLowerCase();
  const filtered = feed.filter((e) => {
    if (actor && !e.actor.toLowerCase().includes(actor)) return false;
    if (opts.type && e.type !== opts.type) return false;
    if (opts.code && e.code !== opts.code) return false;
    return true;
  });
  const start = (opts.page - 1) * opts.pageSize;
  return {
    items: filtered.slice(start, start + opts.pageSize).map(resolveFileActorUser),
    total: filtered.length,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

/** Attach the demo actor identity when the entry carries a known demo session id. */
function resolveFileActorUser(e: ActivityEntry): ActivityEntry {
  if (e.actorUser || !e.actorId) return e;
  const demo = DEMO_ACTORS[e.actorId];
  if (!demo) return e;
  return { ...e, actorUser: { id: e.actorId, name: demo.name, email: demo.email, hue: demo.hue } };
}

/* ───────────────────────────── Prisma adapter ───────────────────────────── */

/** Lazy-loads the Prisma singleton — never constructed in demo mode. */
async function withPrisma<T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>): Promise<T> {
  const { getPrisma } = await import("@/lib/server/prisma");
  return fn(getPrisma());
}

/**
 * Structured machine codes for the `ActivityLog.action` column.
 *
 * These are the stable, queryable enum values for analytics and filtering —
 * the human-readable bilingual copy always lives in `meta` (lossless round-trip
 * via rowToActivityEntry). New event types are added here, then call sites pass
 * `code: ACTION_CODES.X` to logAdminActivity.
 */
export const ACTION_CODES = {
  WORKER_VERIFIED: "WORKER_VERIFIED",
  VERIFICATION_DECLINED: "VERIFICATION_DECLINED",
  VERIFICATION_REQUEST_SUBMITTED: "VERIFICATION_REQUEST_SUBMITTED",
  PUSH_SUBSCRIPTION_PRUNED: "PUSH_SUBSCRIPTION_PRUNED",
  PUSH_SUBSCRIPTION_REMOVED: "PUSH_SUBSCRIPTION_REMOVED",
  PUSH_TEST_SEND_DELIVERED: "PUSH_TEST_SEND_DELIVERED",
  PUSH_TEST_SEND_FAILED: "PUSH_TEST_SEND_FAILED",
  // Booking lifecycle (M4) — the same milestones the booking funnel counts,
  // so the Recent activity feed and the funnel tell one story: every
  // REQUESTED → CONFIRMED → CANCELLED → RESCHEDULED / NO_SHOW transition is
  // logged with the booking number (bookingNo) as a deep link to the admin
  // dispute view (the full BookingEvent trail lives there regardless).
  BOOKING_REQUESTED: "BOOKING_REQUESTED",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_RESCHEDULED: "BOOKING_RESCHEDULED",
  BOOKING_NO_SHOW: "BOOKING_NO_SHOW",
  // Admin refunded a booking's paid deposit from the dispute view (§2.4) —
  // the feed mirrors the trail's REFUNDED audit event.
  BOOKING_REFUNDED: "BOOKING_REFUNDED",
  // §Lebanon manual-payment confirms (the /admin pending OMT/Whish card):
  // each of the three manual scopes logs its own audited entry with the
  // ACTING ADMIN as actor (confirmManualPaymentAction threads the session
  // name through), so the feed shows who confirmed the offline receipt —
  // booking deposit (BOOKING_CONFIRMED), campaign purchase (CAMPAIGN_PAID),
  // and the paid upgrades — verification / featured / emergency
  // (PURCHASE_CONFIRMED).
  CAMPAIGN_PAID: "CAMPAIGN_PAID",
  PURCHASE_CONFIRMED: "PURCHASE_CONFIRMED",
  // Ad-campaign refund (admin action) — the payment trail on /admin so the
  // feed tells the same story as the campaign-payments card.
  CAMPAIGN_REFUNDED: "CAMPAIGN_REFUNDED",
  // Admin inline plan change (the worker-management audit table) — tier
  // corrections leave a trail like refunds and verification decisions: who
  // changed whose plan from → to (the copy carries worker + from/to plan,
  // meta.actor the admin, actorId the real admin FK).
  ADMIN_PLAN_CHANGED: "ADMIN_PLAN_CHANGED",
  // Generic fallbacks for callers that don't pass an explicit code (kept for
  // backward compatibility with legacy rows / untyped call sites).
  SYSTEM: "SYSTEM",
  VERIFICATION: "VERIFICATION",
} as const;

export type ActivityCode = (typeof ACTION_CODES)[keyof typeof ACTION_CODES];

/**
 * Resolve the machine code for a logged entry: an explicit `code` wins;
 * otherwise fall back to the coarse type-derived code (legacy behavior) so
 * untyped call sites and older rows keep working.
 */
function actionCodeFor(entry: { type: ActivityEntry["type"]; code?: string }): string {
  return entry.code ?? entry.type.toUpperCase();
}

/** Shape of an `ActivityLog` row — structural, so tests need no live DB. */
export interface PrismaActivityRow {
  id: string;
  action: string;
  actorId: string | null;
  /** JOINed User row (production). Null for system events / legacy rows. */
  actor?: {
    id: string;
    name: string;
    email: string;
    hue: number;
    image?: string | null;
  } | null;
  meta: unknown;
  createdAt: Date;
}

/**
 * Map a DB row back to the app's ActivityEntry shape (lossless via meta).
 * `actor` (display name) is the source of truth from meta.actor; `actorId` is
 * the FK column (real user id, or null for system events); `actorUser` is the
 * JOINed identity (name/email/hue) surfaced in the history UI. Older/legacy
 * rows without meta fall back to `action` / `actorId`.
 */
export function rowToActivityEntry(row: PrismaActivityRow): ActivityEntry {
  const meta = (row.meta ?? {}) as {
    actionEn?: string;
    actionAr?: string;
    type?: ActivityEntry["type"];
    code?: string;
    actor?: string;
    bookingNo?: string;
  };
  return {
    id: row.id,
    actionEn: meta.actionEn ?? row.action,
    actionAr: meta.actionAr ?? row.action,
    actor: meta.actor ?? row.actorId ?? "System",
    actorId: row.actorId ?? undefined,
    actorUser: row.actor
      ? {
          id: row.actor.id,
          name: row.actor.name,
          email: row.actor.email,
          hue: row.actor.hue,
          image: row.actor.image ?? null,
        }
      : undefined,
    time: row.createdAt.toISOString(),
    type: meta.type ?? "system",
    code: meta.code ?? row.action, // legacy rows have no meta.code — the action is the code
    // Booking deep link — round-trips through meta like the rest (absent on
    // legacy rows, so undefined is the correct fallback).
    bookingNo: meta.bookingNo,
  };
}

async function prismaLog(entry: Omit<ActivityEntry, "id" | "time">): Promise<ActivityEntry> {
  return withPrisma(async (db) => {
    const code = actionCodeFor(entry);
    const row = await db.activityLog.create({
      data: {
        action: code,
        // FK column: only a real user id (or null for system events) may go in
        // here once the FK constraint lands — never the display name. The
        // display name round-trips through meta.actor instead.
        actorId: entry.actorId ?? null,
        meta: {
          actionEn: entry.actionEn,
          actionAr: entry.actionAr,
          type: entry.type,
          code,
          actor: entry.actor,
          ...(entry.bookingNo ? { bookingNo: entry.bookingNo } : {}),
        },
      },
    });
    return rowToActivityEntry(row);
  });
}

async function prismaGetFeed(): Promise<ActivityEntry[]> {
  return withPrisma(async (db) => {
    const rows = await db.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_ENTRIES,
      // Same JOIN as the history listing — keeps the overview feed identity-complete.
      include: { actor: { select: { id: true, name: true, email: true, hue: true, image: true } } },
    });
    return rows.map(rowToActivityEntry);
  });
}

async function prismaReset(): Promise<void> {
  await withPrisma((db) => db.activityLog.deleteMany({}).then(() => undefined));
}

/** Delete rows older than `olderThanDays` days (retention policy). */
async function prismaPrune(olderThanDays: number): Promise<{ removed: number; remaining: number }> {
  return withPrisma(async (db) => {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const removed = await db.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const remaining = await db.activityLog.count();
    return { removed: removed.count, remaining };
  });
}

/**
 * Paginated listing over the ActivityLog table with optional actor / type /
 * code filters. `actor` matches the display name (meta.actor — the FK column
 * holds real user ids, so display-name filtering must go through the JSON
 * path); `type` matches the app-level type in meta; `code` matches the action
 * column exactly.
 */
async function prismaListActivity(opts: {
  page: number;
  pageSize: number;
  actor?: string;
  type?: string;
  code?: string;
}): Promise<ActivityPage> {
  return withPrisma(async (db) => {
    const ands: PrismaActivityWhere[] = [];
    const actor = opts.actor?.trim();
    // Matches the display name via the meta JSON path — the FK column holds
    // real user ids now, so it can't be searched by display name. Note: JSON
    // string_contains is case-sensitive in Postgres (the file adapter matches
    // case-insensitively); acceptable for admin filtering.
    if (actor) ands.push({ meta: { path: ["actor"], string_contains: actor } });
    // The app-level type round-trips through meta.type (see prismaLog).
    if (opts.type) ands.push({ meta: { path: ["type"], equals: opts.type } });
    if (opts.code) ands.push({ action: opts.code });
    const where: PrismaActivityWhere = ands.length > 0 ? { AND: ands } : {};

    const [rows, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        // JOIN the acting user so the history page can show name/email/avatar.
        include: { actor: { select: { id: true, name: true, email: true, hue: true, image: true } } },
      }),
      db.activityLog.count({ where }),
    ]);
    return { items: rows.map(rowToActivityEntry), total, page: opts.page, pageSize: opts.pageSize };
  });
}

/** Structural Prisma where shape for activity listing — keeps prismaListActivity free of live-DB types. */
interface PrismaActivityWhere {
  AND?: PrismaActivityWhere[];
  meta?: { path: string[]; equals?: string; string_contains?: string };
  action?: string;
}

/* ───────────────────────────── Verification funnel ───────────────────────────── */

// Only the structured codes count toward the funnel. Legacy rows written
// before ACTION_CODES landed carry the coarse type-derived action (e.g.
// `VERIFICATION`) and are deliberately excluded — they'll age out via the
// retention cron, so no double-counting occurs during the transition.
const FUNNEL_CODES = [
  ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED,
  ACTION_CODES.WORKER_VERIFIED,
  ACTION_CODES.VERIFICATION_DECLINED,
] as const;

/** Count the three workflow codes from an entry list, respecting a cutoff. */
function tallyFunnel(entries: Pick<ActivityEntry, "code" | "time">[], cutoffMs: number): VerificationFunnel {
  let requests = 0;
  let approved = 0;
  let declined = 0;
  for (const e of entries) {
    const t = Date.parse(e.time);
    if (Number.isNaN(t) || t < cutoffMs) continue;
    if (e.code === ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED) requests += 1;
    else if (e.code === ACTION_CODES.WORKER_VERIFIED) approved += 1;
    else if (e.code === ACTION_CODES.VERIFICATION_DECLINED) declined += 1;
  }
  const decided = approved + declined;
  return {
    requests,
    approved,
    declined,
    approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : 0,
    conversionRate: requests > 0 ? Math.round((approved / requests) * 100) : 0,
  };
}

async function fileVerificationFunnel(cutoffMs: number): Promise<VerificationFunnel> {
  const feed = await fileGetFeed();
  return tallyFunnel(feed.filter((e) => e.code && FUNNEL_CODES.includes(e.code as (typeof FUNNEL_CODES)[number])), cutoffMs);
}

async function prismaVerificationFunnel(cutoffMs: number): Promise<VerificationFunnel> {
  return withPrisma(async (db) => {
    const rows = await db.activityLog.findMany({
      where: {
        action: { in: [...FUNNEL_CODES] },
        createdAt: { gte: new Date(cutoffMs) },
      },
      select: { action: true, createdAt: true },
    });
    return tallyFunnel(
      rows.map((r) => ({ code: r.action, time: r.createdAt.toISOString() })),
      cutoffMs
    );
  });
}

/**
 * Verification workflow funnel over the last `olderThanDays` days (default 30):
 * worker-side requests vs admin decisions, with request-to-approval conversion.
 * NaN-safe day clamp (mirrors pruneActivityLog) so a bad env can't zero the window.
 */
export async function getVerificationFunnel(olderThanDays = 30): Promise<VerificationFunnel> {
  const raw = Math.floor(olderThanDays);
  const days = Number.isFinite(raw) ? Math.max(1, raw) : 30;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return activityAdapterMode() === "prisma" ? prismaVerificationFunnel(cutoffMs) : fileVerificationFunnel(cutoffMs);
}

/* ───────────────────────────── Public API ───────────────────────────── */

/** Append a runtime admin event to the live feed (newest first). */
export async function logAdminActivity(entry: Omit<ActivityEntry, "id" | "time">): Promise<ActivityEntry> {
  return activityAdapterMode() === "prisma" ? prismaLog(entry) : fileLog(entry);
}

/** Newest-first runtime events (raw ISO times — format with timeAgo at render). */
export async function getAdminActivityFeed(): Promise<ActivityEntry[]> {
  return activityAdapterMode() === "prisma" ? prismaGetFeed() : fileGetFeed();
}

/** Test helper: clear the feed between tests. */
export async function resetAdminActivityFeed(): Promise<void> {
  if (activityAdapterMode() === "prisma") return prismaReset();
  return fileReset();
}

/**
 * Retention policy: delete entries older than `olderThanDays` days.
 *
 * The admin overview feed caps reads at MAX_ENTRIES, but rows accumulate
 * unboundedly in the database — this is the cleanup job that bounds them.
 * Returns how many rows were removed and how many remain.
 */
export async function pruneActivityLog(olderThanDays = 90): Promise<{ removed: number; remaining: number }> {
  // Defend against NaN (e.g. a garbage ACTIVITY_LOG_RETENTION_DAYS env): a NaN
  // cutoff would make every timestamp compare false and delete the whole log.
  const raw = Math.floor(olderThanDays);
  const days = Number.isFinite(raw) ? Math.max(1, raw) : 90;
  return activityAdapterMode() === "prisma" ? prismaPrune(days) : filePrune(days);
}

/**
 * Paginated, filterable history over the FULL activity log (not capped at
 * MAX_ENTRIES — that cap is only for the admin overview feed). `actor` matches
 * the actor name/id case-insensitively; `type` is one of ACTIVITY_TYPES;
 * `code` is an exact ACTION_CODES match against the machine-readable action
 * column.
 */
export async function listActivityEntries(opts: {
  page?: number;
  pageSize?: number;
  actor?: string;
  type?: string;
  code?: string;
}): Promise<ActivityPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const type =
    opts.type && (ACTIVITY_TYPES as readonly string[]).includes(opts.type) ? opts.type : undefined;
  const code = opts.code && Object.values(ACTION_CODES).includes(opts.code as ActivityCode) ? opts.code : undefined;
  return activityAdapterMode() === "prisma"
    ? prismaListActivity({ page, pageSize, actor: opts.actor, type, code })
    : fileListActivity({ page, pageSize, actor: opts.actor, type, code });
}
