/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHATSAPP DELIVERIES — pure engine for the delivery audit ledger
 * ────────────────────────────────────────────────────────────────────────────
 * Every automated WhatsApp send (the dispatcher's whatsapp-channel result)
 * lands in a delivery ledger row; Meta's status webhooks (sent / delivered /
 * read / failed) then advance the row, and failures get a bounded automatic
 * retry with backoff plus an admin-triggered manual retry.
 *
 * THIS module is the pure half: types, the status-transition machine, the
 * retry policy and the payload→kind derivation. Persistence lives in
 * `whatsapp-delivery-store.ts` (demo ⇄ Prisma, the repo's two-adapter
 * convention); the webhook route and the audit UI are thin callers.
 *
 * Same inputs → same outputs, every call. No clocks: `nowMs` is a parameter.
 */

/**
 * Note: payload types are intentionally `string`, not the `Notification`
 * type union — senders legitimately cast ad-hoc values ("lead_offer") through
 * it, and the ledger records what was actually sent.
 */

/* ──────────────────────────────── Types ───────────────────────────────── */

/** Ledger row — one logical WhatsApp message and its lifecycle. */
export interface WhatsAppDelivery {
  /** Deterministic dedupe key: `wa-{payload.id}` (one row per logical send). */
  id: string;
  kind: WhatsAppDeliveryKind;
  /** "console" (dev) or "whatsapp-cloud" (Meta Graph API). */
  provider: string;
  recipientPhone?: string;
  /** Stamped when the sender knew the worker (e.g. renewal outreach meta). */
  workerId?: string;
  locale?: "en" | "ar";
  /**
   * The notification's app-level type (lead, bookingConfirmed, …). Typed as
   * `string` — senders cast ad-hoc values ("lead_offer") through the union,
   * so the honest ledger type is the wide one.
   */
  notificationType: string;
  status: WhatsAppDeliveryStatus;
  /** Send attempts so far (1 on first dispatch, +1 per retry). */
  attempts: number;
  /** The ChannelPayload used — audit trail AND the retry's re-send source. */
  payload?: Record<string, unknown>;
  /** Meta's `wamid…` — the key its status webhooks reference. */
  providerMessageId?: string;
  lastError?: string;
  /** Last raw webhook status payload (debugging aid). */
  lastEvent?: Record<string, unknown>;
  /** When the next automatic retry fires (failed rows only, null when exhausted). */
  nextRetryAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

/** Coarse grouping for the audit view's filters. */
export type WhatsAppDeliveryKind = "lead" | "booking" | "subscription" | "campaign" | "system" | "other";

/* ─────────────────────── Kind derivation (pure) ───────────────────────── */

/**
 * Coarse grouping for the audit view's filters. Takes a `string` because
 * senders legitimately cast ad-hoc payload types ("lead_offer") through the
 * Notification union — the ledger records what was actually sent.
 */
export function deliveryKindOf(type: string): WhatsAppDeliveryKind {
  if (type === "lead" || type === "lead_offer") return "lead";
  if (type.startsWith("booking") || type === "recurringVisitScheduled") return "booking";
  if (type === "subscription") return "subscription";
  if (type === "campaign" || type === "campaignRefunded") return "campaign";
  if (type === "system" || type === "review" || type === "verification") return "system";
  return "other";
}

/* ────────────────────── Status transitions (pure) ─────────────────────── */

/** A Meta webhook status event, narrowed to what the machine consumes. */
export interface DeliveryStatusEvent {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  /** Meta epoch-seconds timestamp of the status change. */
  timestampSeconds?: number;
  /** Flattened error summary (from the webhook's errors[0]). */
  error?: string;
  /** Full raw status object (debug aid). */
  raw?: Record<string, unknown>;
}

/**
 * The transition table. Returns the fields to stamp on the row, or `null`
 * when the event must be IGNORED (out-of-order or impossible transitions —
 * e.g. a `delivered` for a message that already failed, or a duplicate
 * `sent`). Ignoring — never erroring — keeps the webhook handler idempotent.
 */
export function applyDeliveryStatusEvent(
  current: Pick<WhatsAppDelivery, "status" | "deliveredAt" | "readAt">,
  event: DeliveryStatusEvent,
  nowMs: number
):
  | {
      status: WhatsAppDeliveryStatus;
      lastError?: string;
      lastEvent?: Record<string, unknown>;
      sentAt?: string;
      deliveredAt?: string;
      readAt?: string;
      /** Set when the row transitions to failed and a retry is scheduled. */
      nextRetryAt?: string | null;
    }
  | null {
  const eventMs =
    event.timestampSeconds && Number.isFinite(event.timestampSeconds) && event.timestampSeconds > 0
      ? event.timestampSeconds * 1000
      : nowMs;
  const base = { lastEvent: event.raw };

  switch (event.status) {
    case "sent":
      // A first "sent" webhook after the API's "accepted" is a no-op; it only
      // matters when a retry (row already failed/sent) is confirmed by Meta.
      if (current.status === "sent") return null;
      if (current.status === "delivered" || current.status === "read") return null;
      return { ...base, status: "sent", sentAt: iso(eventMs) };

    case "delivered":
      if (current.status === "failed") return null; // failed messages don't deliver
      if (current.deliveredAt) return null; // idempotent
      return { ...base, status: "delivered", deliveredAt: iso(eventMs) };

    case "read":
      if (current.status === "failed") return null;
      if (current.readAt) return null; // idempotent
      return {
        ...base,
        status: "read",
        readAt: iso(eventMs),
        // Meta always sends delivered first; stamp both when it didn't.
        deliveredAt: current.deliveredAt ?? iso(eventMs),
      };

    case "failed":
      // Delivered/read messages are terminal — a late failure event is stale.
      if (current.status === "delivered" || current.status === "read") return null;
      return {
        ...base,
        status: "failed",
        lastError: event.error ?? "provider reported failure",
      };
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/* ──────────────────────── Retry policy (pure) ─────────────────────────── */

/**
 * Bounded automatic retries for transient failures (network blips, 5xx from
 * Graph): 2 retries after the initial attempt — 5 min, then 30 min. Content
 * errors (invalid number, template rejection) will fail again, so the cap
 * keeps the queue from spinning.
 */
export const WHATSAPP_RETRY_POLICY = {
  maxAttempts: 3, // 1 initial + 2 retries
  /** Backoff after attempt N (index = attempts so far). Minutes. */
  backoffMinutes: [5, 30],
} as const;

/**
 * When the next automatic retry should fire after `attempts` failures, or
 * `null` when the row is exhausted (no more automatic retries).
 */
export function scheduleRetryAt(attempts: number, fromMs: number): string | null {
  const n = Math.max(0, Math.trunc(attempts));
  if (n >= WHATSAPP_RETRY_POLICY.maxAttempts) return null;
  const minutes = WHATSAPP_RETRY_POLICY.backoffMinutes[Math.min(n - 1, WHATSAPP_RETRY_POLICY.backoffMinutes.length - 1)];
  if (!minutes || minutes <= 0) return null;
  return iso(fromMs + minutes * 60_000);
}

/** True when a row is eligible for the automatic retry sweep. */
export function isDueForAutoRetry(
  row: Pick<WhatsAppDelivery, "status" | "attempts" | "nextRetryAt">,
  nowMs: number
): boolean {
  if (row.status !== "failed") return false;
  if (row.attempts < 1 || row.attempts >= WHATSAPP_RETRY_POLICY.maxAttempts) return false;
  if (!row.nextRetryAt) return false;
  const t = Date.parse(row.nextRetryAt);
  return Number.isFinite(t) && t <= nowMs;
}

/* ─────────────────── Provider webhook error flattening ────────────────── */

/** Shape of one error inside a Meta `statuses[]` entry (subset). */
export interface MetaWebhookError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

/** Flatten Meta's error object into one audit string. Pure. */
export function flattenMetaError(err: MetaWebhookError | undefined): string | undefined {
  if (!err) return undefined;
  const parts = [
    err.code !== undefined ? `code ${err.code}` : null,
    err.title ?? null,
    err.message ?? err.error_data?.details ?? null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(": ") : undefined;
}

/* ───────────────────── Health aggregation (pure) ───────────────────── */

/** The 24-hour health slice the retention export renders. */
export interface WhatsAppHealthWindow {
  /** Sends created in the window. */
  sends: number;
  /** Sends created in the window whose CURRENT status is failed. */
  failed: number;
  /** Sends created in the window that reached delivered (or read). */
  delivered: number;
  /** Still unconfirmed (sent, no webhook yet). */
  pending: number;
  /** failed ÷ sends, percent (rounded; 0 when no sends). */
  failureRatePct: number;
  /** delivered ÷ sends, percent (rounded; 0 when no sends). */
  deliveryRatePct: number;
}

/** Delivery-health snapshot over the whole ledger + the last-24h window. */
export interface WhatsAppDeliveryHealth {
  /** Whole-ledger totals (all time). */
  total: number;
  byStatus: Record<WhatsAppDeliveryStatus, number>;
  /** failed ÷ total across the whole ledger, percent (0 when empty). */
  overallFailureRatePct: number;
  /** failed ÷ total excluding never-confirmed rows, percent — engagement quality. */
  overallDeliveryRatePct: number;
  /** The last-24h slice — outreach effectiveness right now. */
  last24h: WhatsAppHealthWindow;
  /** Per-kind breakdown of the whole ledger (leads vs bookings vs …). */
  byKind: Record<WhatsAppDeliveryKind, number>;
  /** Failed rows whose retry budget is exhausted (maxAttempts reached). */
  deadLetters: number;
  /** ISO cutoff the window was computed against (echoed for the export). */
  windowStart: string;
}

/**
 * Aggregate delivery health from ledger rows. Pure: identical rows + `nowMs`
 * → identical snapshot, so the retention export is reproducible.
 *
 * The window uses `createdAt` (when the send was attempted), not the status
 * timestamps — a send made 23h ago that delivered 5 minutes ago belongs to
 * the same outreach day as its failure would have.
 */
export function whatsappDeliveryHealth(
  rows: WhatsAppDelivery[],
  options: { nowMs?: number; windowMs?: number } = {}
): WhatsAppDeliveryHealth {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = Math.max(1, Math.trunc(options.windowMs ?? 86_400_000));
  const windowStartMs = nowMs - windowMs;
  const windowStart = new Date(windowStartMs).toISOString();

  const byStatus: Record<WhatsAppDeliveryStatus, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
  const byKind: Record<WhatsAppDeliveryKind, number> = { lead: 0, booking: 0, subscription: 0, campaign: 0, system: 0, other: 0 };
  let confirmed = 0;
  let deadLetters = 0;
  let sends = 0, failed = 0, delivered = 0, pending = 0;

  for (const row of rows) {
    if (byStatus[row.status] !== undefined) byStatus[row.status] += 1;
    if (byKind[row.kind] !== undefined) byKind[row.kind] += 1;
    if (row.status === "delivered" || row.status === "read") confirmed += 1;
    if (row.status === "failed" && row.attempts >= WHATSAPP_RETRY_POLICY.maxAttempts) deadLetters += 1;

    const createdMs = Date.parse(row.createdAt);
    if (Number.isFinite(createdMs) && createdMs >= windowStartMs && createdMs < nowMs + 1) {
      sends += 1;
      if (row.status === "failed") failed += 1;
      else if (row.status === "delivered" || row.status === "read") delivered += 1;
      else pending += 1;
    }
  }

  const pct = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

  return {
    total: rows.length,
    byStatus,
    overallFailureRatePct: pct(byStatus.failed, rows.length),
    overallDeliveryRatePct: pct(confirmed, rows.length),
    last24h: {
      sends,
      failed,
      delivered,
      pending,
      failureRatePct: pct(failed, sends),
      deliveryRatePct: pct(delivered, sends),
    },
    byKind,
    deadLetters,
    windowStart,
  };
}
