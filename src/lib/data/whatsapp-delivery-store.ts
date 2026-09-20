/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHATSAPP DELIVERY LEDGER — dual-adapter store (demo ⇄ Prisma)
 * ────────────────────────────────────────────────────────────────────────────
 * The gate + public API over the delivery ledger, following the repo's
 * two-adapter convention (real mode = DEMO_MODE=false + DATABASE_URL).
 *
 * Consumers:
 *   • src/lib/notifications/dispatcher.ts  → recordWhatsAppSend (every send)
 *   • src/app/api/webhooks/whatsapp        → Meta status callbacks
 *   • src/app/api/cron/whatsapp-retries    → the bounded automatic retry sweep
 *   • src/components/admin/whatsapp-delivery-audit.tsx → the admin audit view
 */

import { inboxAdapterMode } from "./notifications";
import {
  applyDeliveryStatusEvent,
  deliveryKindOf,
  isDueForAutoRetry,
  scheduleRetryAt,
  type DeliveryStatusEvent,
  type WhatsAppDelivery,
  type WhatsAppDeliveryKind,
  type WhatsAppDeliveryStatus,
} from "./whatsapp-deliveries";

interface Store {
  rows: Map<string, WhatsAppDelivery>;
}
const key = "__workersArenaWhatsAppDeliveries";
const root = globalThis as Record<string, unknown>;
const STORE: Store = (root[key] as Store | undefined) ?? (root[key] = { rows: new Map() });

/** Test helper. */
export function resetWhatsAppDeliveryStore(): void {
  STORE.rows.clear();
}

async function withPrisma<T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>): Promise<T> {
  const { getPrisma } = await import("@/lib/server/prisma");
  return fn(getPrisma());
}

/* ───────────────── Recording (called by the dispatcher) ───────────────── */

export interface RecordWhatsAppSendInput {
  payloadId: string;
  provider: string;
  recipientPhone?: string;
  workerId?: string;
  locale?: "en" | "ar";
  notificationType: WhatsAppDelivery["notificationType"];
  ok: boolean;
  error?: string;
  providerMessageId?: string;
  /** The full ChannelPayload — audit trail + retry source. */
  payload?: Record<string, unknown>;
  nowMs?: number;
}

export async function recordWhatsAppDelivery(input: RecordWhatsAppSendInput): Promise<void> {
  const nowMs = input.nowMs ?? Date.now();
  if (inboxAdapterMode() === "prisma") {
    await withPrisma((db) =>
      prismaRecordDelivery(db, input, nowMs)
    );
    return;
  }
  const id = `wa-${input.payloadId}`;
  const existing = STORE.rows.get(id);
  if (existing) return; // idempotent — one row per logical send
  STORE.rows.set(id, {
    id,
    kind: deliveryKindOf(input.notificationType),
    provider: input.provider,
    recipientPhone: input.recipientPhone,
    workerId: input.workerId,
    locale: input.locale,
    notificationType: input.notificationType,
    status: input.ok ? "sent" : "failed",
    attempts: 1,
    payload: input.payload,
    providerMessageId: input.providerMessageId,
    lastError: input.ok ? undefined : (input.error ?? "provider reported failure"),
    nextRetryAt: input.ok ? undefined : (scheduleRetryAt(1, nowMs) ?? undefined),
    sentAt: input.ok ? new Date(nowMs).toISOString() : undefined,
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

async function prismaRecordDelivery(
  db: import("@prisma/client").PrismaClient,
  input: RecordWhatsAppSendInput,
  nowMs: number
): Promise<void> {
  const { prismaRecordWhatsAppDelivery } = await import("./whatsapp-delivery-prisma");
  await prismaRecordWhatsAppDelivery(db, {
    payloadId: input.payloadId,
    provider: input.provider,
    recipientPhone: input.recipientPhone,
    workerId: input.workerId,
    locale: input.locale,
    notificationType: input.notificationType,
    status: input.ok ? "sent" : "failed",
    providerMessageId: input.providerMessageId,
    lastError: input.error,
    payload: input.payload,
    now: new Date(nowMs),
  });
}

/* ─────────────────────────── Reads (admin audit) ──────────────────────── */

export async function getWhatsAppDeliveries(
  options: { limit?: number; status?: WhatsAppDeliveryStatus; kind?: WhatsAppDeliveryKind } = {}
): Promise<WhatsAppDelivery[]> {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const { prismaGetWhatsAppDeliveries } = await import("./whatsapp-delivery-prisma");
      return prismaGetWhatsAppDeliveries(db, options);
    });
  }
  const rows = [...STORE.rows.values()]
    .filter((r) => (!options.status || r.status === options.status) && (!options.kind || r.kind === options.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.trunc(options.limit ?? 100)));
  return rows;
}

/** One row by its ledger id (admin retry action). */
export async function getWhatsAppDeliveryById(id: string): Promise<WhatsAppDelivery | null> {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const row = await db.whatsAppDelivery.findUnique({ where: { id } });
      if (!row) return null;
      const { rowToDelivery } = await import("./whatsapp-delivery-prisma");
      return rowToDelivery(row);
    });
  }
  return STORE.rows.get(id) ?? null;
}

/**
 * Delivery-health snapshot for the retention analytics export: whole-ledger
 * failure rate, the last-24h outreach window, per-kind breakdown and dead
 * letters. Aggregation is the pure `whatsappDeliveryHealth`; this wrapper
 * only adapts the store (Prisma reads what it needs, demo reads rows).
 */
export async function getWhatsAppDeliveryHealth(nowMs = Date.now()) {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const { whatsappDeliveryHealth } = await import("./whatsapp-deliveries");
      const rows = await db.whatsAppDelivery.findMany({
        select: {
          status: true,
          kind: true,
          attempts: true,
          createdAt: true,
        },
      });
      return whatsappDeliveryHealth(
        rows.map((r) => ({
          id: "agg",
          kind: r.kind as WhatsAppDeliveryKind,
          provider: "",
          notificationType: "",
          status: r.status as WhatsAppDeliveryStatus,
          attempts: r.attempts,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.createdAt.toISOString(),
        })),
        { nowMs }
      );
    });
  }
  const { whatsappDeliveryHealth } = await import("./whatsapp-deliveries");
  return whatsappDeliveryHealth([...STORE.rows.values()], { nowMs });
}

export async function getWhatsAppDeliveryStats(): Promise<{
  total: number;
  byStatus: Record<WhatsAppDeliveryStatus, number>;
  last24hFailed: number;
}> {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const { prismaWhatsAppDeliveryStats } = await import("./whatsapp-delivery-prisma");
      return prismaWhatsAppDeliveryStats(db);
    });
  }
  const rows = [...STORE.rows.values()];
  const byStatus: Record<WhatsAppDeliveryStatus, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
  const dayAgo = Date.now() - 86_400_000;
  let last24hFailed = 0;
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.status === "failed" && Date.parse(row.createdAt) >= dayAgo) last24hFailed += 1;
  }
  return { total: rows.length, byStatus, last24hFailed };
}

/* ─────────────────────── Webhook status application ───────────────────── */

/**
 * Apply a Meta status event to the ledger. Returns the updated row, or null
 * when the event matched nothing (unknown wamid) or was ignored (stale/
 * duplicate transition) — the webhook answers 200 either way so Meta
 * doesn't retry a dead letter forever.
 */
export async function applyWhatsAppStatusEvent(event: DeliveryStatusEvent, nowMs = Date.now()): Promise<WhatsAppDelivery | null> {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const { prismaApplyWhatsAppStatus } = await import("./whatsapp-delivery-prisma");
      return prismaApplyWhatsAppStatus(db, event, nowMs);
    });
  }
  const row = [...STORE.rows.values()].find((r) => r.providerMessageId === event.providerMessageId);
  if (!row) return null;
  const patch = applyDeliveryStatusEvent(row, event, nowMs);
  if (!patch) return null;
  const next: WhatsAppDelivery = {
    ...row,
    status: patch.status,
    lastError: patch.lastError ?? row.lastError,
    lastEvent: patch.lastEvent ?? row.lastEvent,
    sentAt: patch.sentAt ?? row.sentAt,
    deliveredAt: patch.deliveredAt ?? row.deliveredAt,
    readAt: patch.readAt ?? row.readAt,
    nextRetryAt: patch.status === "failed" ? (scheduleRetryAt(row.attempts, nowMs) ?? undefined) : row.nextRetryAt,
    updatedAt: new Date(nowMs).toISOString(),
  };
  STORE.rows.set(row.id, next);
  return next;
}

/* ─────────────────────── Retries (cron + admin action) ────────────────── */

/** One retry sweep result. */
export interface WhatsAppRetryRun {
  attempted: number;
  succeeded: number;
  stillFailed: number;
  exhausted: number;
}

/**
 * The automatic retry sweep — called from the cron endpoint. Finds failed
 * rows whose nextRetryAt is due, re-sends their stored payload through the
 * WhatsApp channel, and stamps the outcome. Bounded per run (50).
 */
export async function runWhatsAppRetrySweep(nowMs = Date.now()): Promise<WhatsAppRetryRun> {
  const { dispatchWhatsApp } = await import("@/lib/notifications/dispatcher");
  const due = await dueRetries(nowMs);
  const run: WhatsAppRetryRun = { attempted: 0, succeeded: 0, stillFailed: 0, exhausted: 0 };

  for (const row of due) {
    run.attempted += 1;
    const payload = row.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload.id !== "string") {
      // Nothing to re-send from (legacy row) — exhaust it.
      await markRetryOutcome(row.id, { ok: false, error: "no stored payload to retry", nowMs });
      run.exhausted += 1;
      continue;
    }
    const result = await dispatchWhatsApp(payload as never, { skipRecord: true });
    await markRetryOutcome(row.id, {
      ok: result.ok,
      providerMessageId: result.providerMessageId,
      error: result.error,
      nowMs,
    });
    if (result.ok) run.succeeded += 1;
    else if (scheduleRetryAt(row.attempts + 1, nowMs) !== null) run.stillFailed += 1;
    else run.exhausted += 1;
  }
  return run;
}

async function dueRetries(nowMs: number): Promise<WhatsAppDelivery[]> {
  if (inboxAdapterMode() === "prisma") {
    return withPrisma(async (db) => {
      const { prismaWhatsAppRetriesDue } = await import("./whatsapp-delivery-prisma");
      return prismaWhatsAppRetriesDue(db, nowMs);
    });
  }
  return [...STORE.rows.values()].filter((row) => isDueForAutoRetry(row, nowMs));
}

/** Stamp the outcome of one retry attempt (auto sweep or admin re-send). */
export async function markRetryOutcome(
  id: string,
  outcome: { ok: boolean; providerMessageId?: string; error?: string; nowMs?: number }
): Promise<void> {
  const nowMs = outcome.nowMs ?? Date.now();
  if (inboxAdapterMode() === "prisma") {
    await withPrisma(async (db) => {
      const { prismaMarkWhatsAppRetryOutcome } = await import("./whatsapp-delivery-prisma");
      return prismaMarkWhatsAppRetryOutcome(db, id, { ...outcome, now: new Date(nowMs) });
    });
    return;
  }
  const row = STORE.rows.get(id);
  if (!row) return;
  const attempts = row.attempts + 1;
  STORE.rows.set(id, {
    ...row,
    attempts,
    status: outcome.ok ? "sent" : "failed",
    providerMessageId: outcome.providerMessageId ?? row.providerMessageId,
    lastError: outcome.ok ? undefined : (outcome.error ?? row.lastError),
    sentAt: outcome.ok ? new Date(nowMs).toISOString() : row.sentAt,
    nextRetryAt: outcome.ok ? undefined : (scheduleRetryAt(attempts, nowMs) ?? undefined),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

/** Admin-triggered manual re-send — allowed even past the automatic cap. */
export async function resendWhatsAppDelivery(id: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getWhatsAppDeliveryById(id);
  if (!row) return { ok: false, error: "not-found" };
  if (row.status === "delivered" || row.status === "read") return { ok: false, error: "already-delivered" };
  const payload = row.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload.id !== "string") return { ok: false, error: "no-payload" };
  const { dispatchWhatsApp } = await import("@/lib/notifications/dispatcher");
  const result = await dispatchWhatsApp(payload as never, { skipRecord: true });
  await markRetryOutcome(id, {
    ok: result.ok,
    providerMessageId: result.providerMessageId,
    error: result.error,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "delivery-failed" };
}
