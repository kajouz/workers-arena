/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHATSAPP DELIVERY LEDGER — Prisma adapter (real mode)
 * ────────────────────────────────────────────────────────────────────────────
 * Persistence half of the delivery ledger, behind
 * `whatsapp-delivery-store.ts` (which owns the adapter gate). All mapping and
 * decision-making lives in the pure engine (`whatsapp-deliveries.ts`); this
 * file only marshals rows.
 */

import type { PrismaClient } from "@prisma/client";
import {
  applyDeliveryStatusEvent,
  deliveryKindOf,
  isDueForAutoRetry,
  scheduleRetryAt,
  type DeliveryStatusEvent,
  type WhatsAppDelivery,
} from "./whatsapp-deliveries";

/** Shape of a `WhatsAppDelivery` row — structural, so tests need no live DB. */
interface DeliveryRow {
  id: string;
  kind: string;
  provider: string;
  recipientPhone: string | null;
  workerId: string | null;
  locale: string | null;
  notificationType: string;
  status: string;
  attempts: number;
  payload: unknown;
  providerMessageId: string | null;
  lastError: string | null;
  lastEvent: unknown;
  nextRetryAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function isoOrNull(d: Date | null): string | undefined {
  return d ? d.toISOString() : undefined;
}

export function rowToDelivery(row: DeliveryRow): WhatsAppDelivery {
  return {
    id: row.id,
    kind: row.kind as WhatsAppDelivery["kind"],
    provider: row.provider,
    recipientPhone: row.recipientPhone ?? undefined,
    workerId: row.workerId ?? undefined,
    locale: (row.locale as WhatsAppDelivery["locale"]) ?? undefined,
    notificationType: row.notificationType as WhatsAppDelivery["notificationType"],
    status: row.status as WhatsAppDelivery["status"],
    attempts: row.attempts,
    payload: (row.payload ?? undefined) as Record<string, unknown> | undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    lastError: row.lastError ?? undefined,
    lastEvent: (row.lastEvent ?? undefined) as Record<string, unknown> | undefined,
    nextRetryAt: isoOrNull(row.nextRetryAt),
    sentAt: isoOrNull(row.sentAt),
    deliveredAt: isoOrNull(row.deliveredAt),
    readAt: isoOrNull(row.readAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Insert or no-op — the deterministic id makes re-sends idempotent. */
export async function prismaRecordWhatsAppDelivery(
  db: PrismaClient,
  input: {
    payloadId: string;
    provider: string;
    recipientPhone?: string;
    workerId?: string;
    locale?: "en" | "ar";
    notificationType: WhatsAppDelivery["notificationType"];
    status: WhatsAppDelivery["status"];
    providerMessageId?: string;
    lastError?: string;
    payload?: Record<string, unknown>;
    now: Date;
  }
): Promise<void> {
  await db.whatsAppDelivery.upsert({
    where: { id: `wa-${input.payloadId}` },
    create: {
      id: `wa-${input.payloadId}`,
      kind: deliveryKindOf(input.notificationType),
      provider: input.provider,
      recipientPhone: input.recipientPhone ?? null,
      workerId: input.workerId ?? null,
      locale: input.locale ?? null,
      notificationType: input.notificationType,
      status: input.status,
      attempts: 1,
      payload: (input.payload ?? undefined) as never,
      providerMessageId: input.providerMessageId ?? null,
      lastError: input.lastError ?? null,
      sentAt: input.status === "sent" || input.status === "delivered" || input.status === "read" ? input.now : null,
      nextRetryAt:
        input.status === "failed" ? (scheduleRetryAt(1, input.now.getTime()) ? new Date(scheduleRetryAt(1, input.now.getTime())!) : null) : null,
    },
    update: {}, // a re-send of the same logical payload keeps the first row
  });
}

export async function prismaGetWhatsAppDeliveries(
  db: PrismaClient,
  options: { limit?: number; status?: WhatsAppDelivery["status"]; kind?: WhatsAppDelivery["kind"] } = {}
): Promise<WhatsAppDelivery[]> {
  const rows = await db.whatsAppDelivery.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.kind ? { kind: options.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100))),
  });
  return rows.map(rowToDelivery);
}

export async function prismaWhatsAppDeliveryStats(db: PrismaClient): Promise<{
  total: number;
  byStatus: Record<WhatsAppDelivery["status"], number>;
  last24hFailed: number;
}> {
  const rows = await db.whatsAppDelivery.findMany({ select: { status: true, createdAt: true } });
  const byStatus: Record<WhatsAppDelivery["status"], number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
  const dayAgo = Date.now() - 86_400_000;
  let last24hFailed = 0;
  for (const row of rows) {
    const status = row.status as WhatsAppDelivery["status"];
    if (status in byStatus) byStatus[status] += 1;
    if (status === "failed" && row.createdAt.getTime() >= dayAgo) last24hFailed += 1;
  }
  return { total: rows.length, byStatus, last24hFailed };
}

/** Advance one row from a Meta status webhook event. Returns the updated row or null (ignored). */
export async function prismaApplyWhatsAppStatus(
  db: PrismaClient,
  event: DeliveryStatusEvent,
  nowMs: number
): Promise<WhatsAppDelivery | null> {
  const row = await db.whatsAppDelivery.findUnique({ where: { providerMessageId: event.providerMessageId } });
  if (!row) return null;
  const current = rowToDelivery(row);
  const patch = applyDeliveryStatusEvent(current, event, nowMs);
  if (!patch) return null;
  const updated = await db.whatsAppDelivery.update({
    where: { id: row.id },
    data: {
      status: patch.status,
      lastError: patch.lastError ?? null,
      lastEvent: (patch.lastEvent ?? undefined) as never,
      sentAt: patch.sentAt ? new Date(patch.sentAt) : undefined,
      deliveredAt: patch.deliveredAt ? new Date(patch.deliveredAt) : undefined,
      readAt: patch.readAt ? new Date(patch.readAt) : undefined,
      nextRetryAt: patch.nextRetryAt === null ? null : undefined,
    },
  });
  return rowToDelivery(updated);
}

/** Rows due an automatic retry right now. */
export async function prismaWhatsAppRetriesDue(db: PrismaClient, nowMs: number): Promise<WhatsAppDelivery[]> {
  const rows = await db.whatsAppDelivery.findMany({
    where: { status: "failed" },
    orderBy: { nextRetryAt: "asc" },
    take: 50,
  });
  return rows
    .map(rowToDelivery)
    .filter((row) => isDueForAutoRetry(row, nowMs));
}

/** Stamp the outcome of a retry attempt onto a failed row. */
export async function prismaMarkWhatsAppRetryOutcome(
  db: PrismaClient,
  id: string,
  outcome: { ok: boolean; providerMessageId?: string; error?: string; now: Date }
): Promise<void> {
  const row = await db.whatsAppDelivery.findUnique({ where: { id } });
  if (!row) return;
  const attempts = row.attempts + 1;
  await db.whatsAppDelivery.update({
    where: { id },
    data: {
      attempts,
      status: outcome.ok ? "sent" : "failed",
      providerMessageId: outcome.providerMessageId ?? row.providerMessageId,
      lastError: outcome.ok ? null : (outcome.error ?? row.lastError),
      sentAt: outcome.ok ? outcome.now : row.sentAt,
      nextRetryAt: outcome.ok ? null : (scheduleRetryAt(attempts, outcome.now.getTime()) ? new Date(scheduleRetryAt(attempts, outcome.now.getTime())!) : null),
    },
  });
}
