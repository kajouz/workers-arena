import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDeliveryStatusEvent,
  deliveryKindOf,
  flattenMetaError,
  isDueForAutoRetry,
  scheduleRetryAt,
  whatsappDeliveryHealth,
  WHATSAPP_RETRY_POLICY,
  type DeliveryStatusEvent,
  type WhatsAppDelivery,
} from "../src/lib/data/whatsapp-deliveries";
import {
  applyWhatsAppStatusEvent,
  getWhatsAppDeliveries,
  getWhatsAppDeliveryHealth,
  getWhatsAppDeliveryStats,
  markRetryOutcome,
  recordWhatsAppDelivery,
  resendWhatsAppDelivery,
  resetWhatsAppDeliveryStore,
  runWhatsAppRetrySweep,
} from "../src/lib/data/whatsapp-delivery-store";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");

function sendInput(overrides: Record<string, unknown> = {}) {
  return {
    payloadId: "n-test-1",
    provider: "whatsapp-cloud",
    recipientPhone: "+96170123456",
    workerId: "w1",
    locale: "en" as const,
    notificationType: "lead",
    ok: true,
    providerMessageId: "wamid.TEST1",
    payload: { id: "n-test-1", type: "lead", titleEn: "New lead", recipient: { phone: "+96170123456" } },
    nowMs: NOW,
    ...overrides,
  };
}

function statusEvent(overrides: Partial<DeliveryStatusEvent> = {}): DeliveryStatusEvent {
  return { providerMessageId: "wamid.TEST1", status: "delivered", timestampSeconds: NOW / 1000, ...overrides };
}

describe("whatsapp delivery kind derivation", () => {
  it("maps payload types onto audit kinds", () => {
    expect(deliveryKindOf("lead")).toBe("lead");
    expect(deliveryKindOf("lead_offer")).toBe("lead"); // the cast value lead dispatch actually uses
    expect(deliveryKindOf("bookingConfirmed")).toBe("booking");
    expect(deliveryKindOf("recurringVisitScheduled")).toBe("booking");
    expect(deliveryKindOf("subscription")).toBe("subscription");
    expect(deliveryKindOf("campaignRefunded")).toBe("campaign");
    expect(deliveryKindOf("system")).toBe("system");
    expect(deliveryKindOf("mystery")).toBe("other");
  });
});

describe("whatsapp delivery status machine", () => {
  it("stamps delivered then read", () => {
    const delivered = applyDeliveryStatusEvent({ status: "sent", deliveredAt: undefined, readAt: undefined }, statusEvent(), NOW);
    expect(delivered?.status).toBe("delivered");
    expect(delivered?.deliveredAt).toBe(new Date(NOW).toISOString());

    const read = applyDeliveryStatusEvent(
      { status: "delivered", deliveredAt: new Date(NOW).toISOString(), readAt: undefined },
      statusEvent({ status: "read", timestampSeconds: (NOW + 1000) / 1000 }),
      NOW + 1000
    );
    expect(read?.status).toBe("read");
    expect(read?.readAt).toBe(new Date(NOW + 1000).toISOString());
    expect(read?.deliveredAt).toBe(new Date(NOW).toISOString()); // preserved
  });

  it("read-from-undelivered stamps both (Meta always sends delivered first, but…)", () => {
    const patch = applyDeliveryStatusEvent(
      { status: "sent", deliveredAt: undefined, readAt: undefined },
      statusEvent({ status: "read" }),
      NOW
    );
    expect(patch?.status).toBe("read");
    expect(patch?.readAt).toBeTruthy();
    expect(patch?.deliveredAt).toBeTruthy();
  });

  it("ignores impossible and duplicate transitions", () => {
    const failed = { status: "failed" as const, deliveredAt: undefined, readAt: undefined };
    expect(applyDeliveryStatusEvent(failed, statusEvent({ status: "delivered" }), NOW)).toBeNull();
    expect(applyDeliveryStatusEvent(failed, statusEvent({ status: "read" }), NOW)).toBeNull();

    const sent = { status: "sent" as const, deliveredAt: undefined, readAt: undefined };
    expect(applyDeliveryStatusEvent(sent, statusEvent({ status: "sent" }), NOW)).toBeNull(); // duplicate

    const delivered = { status: "delivered" as const, deliveredAt: "x", readAt: undefined };
    expect(applyDeliveryStatusEvent(delivered, statusEvent(), NOW)).toBeNull(); // idempotent
  });

  it("records failure with the flattened error", () => {
    const patch = applyDeliveryStatusEvent(
      { status: "sent", deliveredAt: undefined, readAt: undefined },
      statusEvent({ status: "failed", error: "code 131047: Re-engagement message" }),
      NOW
    );
    expect(patch?.status).toBe("failed");
    expect(patch?.lastError).toContain("131047");
  });

  it("flattenMetaError joins code, title and details", () => {
    expect(flattenMetaError({ code: 131047, title: "Re-engagement", error_data: { details: "window expired" } })).toBe(
      "code 131047: Re-engagement: window expired"
    );
    expect(flattenMetaError(undefined)).toBeUndefined();
  });
});

describe("whatsapp retry policy", () => {
  it("backs off 5 min then 30 min, then gives up", () => {
    expect(scheduleRetryAt(1, NOW)).toBe(new Date(NOW + 5 * 60_000).toISOString());
    expect(scheduleRetryAt(2, NOW)).toBe(new Date(NOW + 30 * 60_000).toISOString());
    expect(scheduleRetryAt(3, NOW)).toBeNull();
    expect(scheduleRetryAt(9, NOW)).toBeNull();
    expect(scheduleRetryAt(0, NOW)).toBeNull(); // attempts=0 is a data bug — never schedule
  });

  it("isDueForAutoRetry only fires failed rows inside the window", () => {
    const due = { status: "failed" as const, attempts: 1, nextRetryAt: new Date(NOW - 1).toISOString() };
    expect(isDueForAutoRetry(due, NOW)).toBe(true);
    expect(isDueForAutoRetry({ ...due, nextRetryAt: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(false);
    expect(isDueForAutoRetry({ ...due, status: "sent" }, NOW)).toBe(false);
    expect(isDueForAutoRetry({ ...due, attempts: WHATSAPP_RETRY_POLICY.maxAttempts }, NOW)).toBe(false);
    expect(isDueForAutoRetry({ ...due, nextRetryAt: undefined }, NOW)).toBe(false);
  });
});

describe("whatsapp delivery store (demo adapter)", () => {
  beforeEach(() => resetWhatsAppDeliveryStore());

  it("records one row per logical send (idempotent by payload id)", async () => {
    await recordWhatsAppDelivery(sendInput());
    await recordWhatsAppDelivery(sendInput()); // duplicate dispatch — no second row
    const rows = await getWhatsAppDeliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("wa-n-test-1");
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.kind).toBe("lead");
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.providerMessageId).toBe("wamid.TEST1");
  });

  it("failed sends carry the error and a scheduled retry", async () => {
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "WhatsApp Cloud API 500: boom", providerMessageId: undefined }));
    const rows = await getWhatsAppDeliveries();
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.lastError).toContain("500");
    expect(rows[0]!.nextRetryAt).toBe(new Date(NOW + 5 * 60_000).toISOString());
    expect(rows[0]!.sentAt).toBeUndefined();
  });

  it("webhook events advance the row by wamid", async () => {
    await recordWhatsAppDelivery(sendInput());
    const updated = await applyWhatsAppStatusEvent(
      statusEvent({ status: "delivered", timestampSeconds: (NOW + 60_000) / 1000 }),
      NOW + 60_000
    );
    expect(updated?.status).toBe("delivered");
    expect(updated?.deliveredAt).toBe(new Date(NOW + 60_000).toISOString());

    const stats = await getWhatsAppDeliveryStats();
    expect(stats.byStatus.delivered).toBe(1);
    expect(stats.byStatus.sent).toBe(0);
  });

  it("unknown wamids are ignored (webhook answers 200 anyway)", async () => {
    await recordWhatsAppDelivery(sendInput());
    const result = await applyWhatsAppStatusEvent(statusEvent({ providerMessageId: "wamid.UNKNOWN" }), NOW);
    expect(result).toBeNull();
  });

  it("retry outcome bumps attempts and re-schedules on continued failure", async () => {
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "503" }));
    await markRetryOutcome("wa-n-test-1", { ok: false, error: "503 again", nowMs: NOW + 6 * 60_000 });
    const rows = await getWhatsAppDeliveries();
    expect(rows[0]!.attempts).toBe(2);
    expect(rows[0]!.status).toBe("failed");
    // attempt 2 failed → next backoff step (30 min from the retry instant)
    expect(rows[0]!.nextRetryAt).toBe(new Date(NOW + 6 * 60_000 + 30 * 60_000).toISOString());
  });

  it("a successful retry flips the row to sent and clears the retry schedule", async () => {
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "503" }));
    await markRetryOutcome("wa-n-test-1", { ok: true, providerMessageId: "wamid.RETRY", nowMs: NOW + 6 * 60_000 });
    const rows = await getWhatsAppDeliveries();
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.attempts).toBe(2);
    expect(rows[0]!.providerMessageId).toBe("wamid.RETRY");
    expect(rows[0]!.nextRetryAt).toBeUndefined();
  });

  it("the sweep re-sends due failed rows through the channel and stamps the outcome", async () => {
    // Failed 10 minutes ago; console provider (test host) always succeeds.
    await recordWhatsAppDelivery(
      sendInput({ ok: false, error: "timeout", providerMessageId: undefined, nowMs: NOW - 10 * 60_000 })
    );
    const run = await runWhatsAppRetrySweep(NOW);
    expect(run.attempted).toBe(1);
    expect(run.succeeded).toBe(1);
    const rows = await getWhatsAppDeliveries();
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.attempts).toBe(2);
  });

  it("the sweep skips rows whose retry is not yet due", async () => {
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "timeout", providerMessageId: undefined })); // due in 5 min
    const run = await runWhatsAppRetrySweep(NOW + 60_000);
    expect(run.attempted).toBe(0);
  });

  it("exhausted rows are skipped by the sweep and left failed", async () => {
    // Drive attempts to the cap manually (the console provider in tests always
    // succeeds, so exhaustion is reached through repeated real failures).
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "x", nowMs: NOW - 40 * 60_000 }));
    await markRetryOutcome("wa-n-test-1", { ok: false, error: "x", nowMs: NOW - 30 * 60_000 }); // attempts 2 → due in 30m
    await markRetryOutcome("wa-n-test-1", { ok: false, error: "x", nowMs: NOW + 31 * 60_000 }); // attempts 3 → cap
    const rows = await getWhatsAppDeliveries();
    expect(rows[0]!.attempts).toBe(3);
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.nextRetryAt).toBeUndefined(); // scheduleRetryAt(3) → null
    // The sweep must not touch an exhausted row.
    const run = await runWhatsAppRetrySweep(NOW + 70 * 60_000);
    expect(run.attempted).toBe(0);
  });

  it("manual re-send works on failed rows but refuses delivered ones", async () => {
    // Failed WITH a wamid (Graph accepted, a later webhook failed it) — the
    // console re-send returns no wamid, so the row keeps the original one and
    // the delivered event can still find it below.
    await recordWhatsAppDelivery(sendInput({ ok: false, error: "x" }));
    const ok = await resendWhatsAppDelivery("wa-n-test-1");
    expect(ok.ok).toBe(true);

    await applyWhatsAppStatusEvent(statusEvent({ status: "delivered" }), NOW);
    const refused = await resendWhatsAppDelivery("wa-n-test-1");
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe("already-delivered");

    const missing = await resendWhatsAppDelivery("wa-nope");
    expect(missing).toEqual({ ok: false, error: "not-found" });
  });
});

describe("whatsappDeliveryHealth (retention export aggregation)", () => {
  /** A minimal ledger row — only the fields the health pass reads. */
  function row(overrides: Partial<WhatsAppDelivery> = {}): WhatsAppDelivery {
    return {
      id: "wa-x",
      kind: "subscription",
      provider: "whatsapp-cloud",
      notificationType: "subscription",
      status: "sent",
      attempts: 1,
      createdAt: new Date(NOW - 3_600_000).toISOString(),
      updatedAt: new Date(NOW - 3_600_000).toISOString(),
      ...overrides,
    };
  }

  it("computes overall rates, the 24h window and dead letters", () => {
    const rows = [
      row({ id: "1", status: "delivered" }),
      row({ id: "2", status: "read" }),
      row({ id: "3", status: "sent" }),
      // Failed AND exhausted → dead letter, inside the window.
      row({ id: "4", status: "failed", attempts: WHATSAPP_RETRY_POLICY.maxAttempts }),
      // Failed but retryable → NOT a dead letter; outside the window (old).
      row({ id: "5", status: "failed", attempts: 1, createdAt: new Date(NOW - 3 * 86_400_000).toISOString() }),
    ];
    const health = whatsappDeliveryHealth(rows, { nowMs: NOW });

    expect(health.total).toBe(5);
    expect(health.byStatus).toEqual({ sent: 1, delivered: 1, read: 1, failed: 2 });
    // 2 failed of 5 overall; 2 confirmed (delivered+read) of 5.
    expect(health.overallFailureRatePct).toBe(40);
    expect(health.overallDeliveryRatePct).toBe(40);
    // Window covers 4 rows (the old failure is excluded), 1 of them failed.
    expect(health.last24h).toEqual({
      sends: 4, failed: 1, delivered: 2, pending: 1, failureRatePct: 25, deliveryRatePct: 50,
    });
    expect(health.deadLetters).toBe(1);
    // Window start echoes the injected clock, not wall time.
    expect(health.windowStart).toBe(new Date(NOW - 86_400_000).toISOString());
  });

  it("degrades to zero rates on an empty ledger", () => {
    const health = whatsappDeliveryHealth([], { nowMs: NOW });
    expect(health.total).toBe(0);
    expect(health.overallFailureRatePct).toBe(0);
    expect(health.overallDeliveryRatePct).toBe(0);
    expect(health.last24h).toMatchObject({ sends: 0, failureRatePct: 0, deliveryRatePct: 0 });
    expect(health.deadLetters).toBe(0);
  });

  it("breaks kinds down and the store wrapper reads through demo mode", async () => {
    resetWhatsAppDeliveryStore();
    await recordWhatsAppDelivery(sendInput({ payloadId: "h-1", notificationType: "lead" }));
    await recordWhatsAppDelivery(sendInput({ payloadId: "h-2", notificationType: "subscription", ok: false, providerMessageId: undefined }));
    const health = await getWhatsAppDeliveryHealth(NOW);
    expect(health.total).toBe(2);
    expect(health.byKind).toMatchObject({ lead: 1, subscription: 1 });
    expect(health.byStatus.failed).toBe(1);
  });
});
