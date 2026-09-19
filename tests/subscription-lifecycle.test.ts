import { describe, expect, it } from "vitest";
import { subscriptionCohorts, type SubscriptionLifecycleEvent } from "@/lib/data/subscription-lifecycle";
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

  it("does not count events outside the requested month window", () => {
    const events: SubscriptionLifecycleEvent[] = [
      { id: "old", workerId: "w1", type: "renewed", currency: "USD", source: "manual_payment", createdAt: "2026-08-31T23:59:59.000Z" },
    ];
    const [september] = subscriptionCohorts(events, 1, new Date("2026-09-01T00:00:00.000Z"));
    expect(september.renewed).toBe(0);
  });
});
