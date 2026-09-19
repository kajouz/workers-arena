import { describe, expect, it } from "vitest";
import { subscriptionAnalytics, subscriptionCohorts, type SubscriptionLifecycleEvent } from "@/lib/data/subscription-lifecycle";
import { recordSubscriptionEventOnce, resetSubscriptionLifecycleStore, listSubscriptionEvents } from "@/lib/data/subscription-lifecycle-store";

describe("subscription lifecycle cohorts", () => {
  it("deduplicates cron milestones for a worker", async () => {
    resetSubscriptionLifecycleStore();
    const input = { workerId: "w-expired", type: "expired" as const, fromPlan: "basic" as const, source: "cron" as const };
    expect(await recordSubscriptionEventOnce(input)).not.toBeNull();
    expect(await recordSubscriptionEventOnce(input)).toBeNull();
    expect((await listSubscriptionEvents({ workerId: "w-expired" }))).toHaveLength(1);
  });
  it("counts trials, renewals, cancellations and worker-level trial conversion", () => {
    const events: SubscriptionLifecycleEvent[] = [
      { id: "1", workerId: "w1", type: "trial_started", toPlan: "basic", currency: "USD", source: "onboarding", createdAt: "2026-09-02T10:00:00.000Z" },
      { id: "2", workerId: "w1", type: "renewed", toPlan: "basic", currency: "USD", source: "manual_payment", createdAt: "2026-09-20T10:00:00.000Z" },
      { id: "3", workerId: "w2", type: "trial_started", toPlan: "professional", currency: "USD", source: "onboarding", createdAt: "2026-09-04T10:00:00.000Z" },
      { id: "4", workerId: "w3", type: "cancelled", currency: "USD", source: "admin", createdAt: "2026-09-05T10:00:00.000Z" },
    ];

    const [september] = subscriptionCohorts(events, 1, new Date("2026-09-25T00:00:00.000Z"));
    expect(september).toMatchObject({ month: "2026-09", trials: 2, renewed: 1, cancelled: 1, trialConversionRate: 50 });
  });

  it("derives conversion, churn, plan movement, LTV, and WhatsApp outreach from the ledger", () => {
    const events: SubscriptionLifecycleEvent[] = [
      { id: "trial", workerId: "w1", type: "trial_started", toPlan: "basic", currency: "USD", source: "onboarding", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "renew", workerId: "w1", type: "renewed", toPlan: "basic", amount: 1500, currency: "USD", source: "manual_payment", createdAt: "2026-02-01T00:00:00.000Z" },
      { id: "upgrade", workerId: "w1", type: "plan_changed", fromPlan: "basic", toPlan: "professional", amount: 3900, currency: "USD", source: "admin", createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "cancel", workerId: "w1", type: "cancelled", fromPlan: "professional", currency: "USD", source: "admin", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "failed", workerId: "w2", type: "whatsapp_outreach_failed", toPlan: "basic", currency: "USD", source: "admin", createdAt: "2026-04-02T00:00:00.000Z" },
      { id: "sent", workerId: "w1", type: "whatsapp_outreach_sent", toPlan: "professional", currency: "USD", source: "admin", createdAt: "2026-04-03T00:00:00.000Z" },
    ];
    const result = subscriptionAnalytics(events, 6, new Date("2026-05-01T00:00:00.000Z"));
    expect(result.trialStarts).toBe(1);
    expect(result.trialConversions).toBe(1);
    expect(result.trialConversionRate).toBe(100);
    expect(result.churnEvents).toBe(1);
    expect(result.upgrades).toBe(1);
    expect(result.downgrades).toBe(0);
    expect(result.renewalRevenue).toBe(1500);
    expect(result.ltv).toBe(1500);
    expect(result.whatsappOutreachSent).toBe(1);
    expect(result.whatsappOutreachFailed).toBe(1);
    expect(result.planTransitions).toEqual([{ from: "basic", to: "professional", count: 1, percentage: 100 }]);
  });

  it("does not count events outside the requested month window", () => {
    const events: SubscriptionLifecycleEvent[] = [
      { id: "old", workerId: "w1", type: "renewed", currency: "USD", source: "manual_payment", createdAt: "2026-08-31T23:59:59.000Z" },
    ];
    const [september] = subscriptionCohorts(events, 1, new Date("2026-09-01T00:00:00.000Z"));
    expect(september.renewed).toBe(0);
  });
});
