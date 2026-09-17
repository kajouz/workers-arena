import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTrialSubscription, subscriptionStatus, daysUntil } from "../src/lib/data/subscriptions";
import { renewWorkerSubscriptionBySlug } from "../src/lib/data/repo";
import { workerBySlug, WORKERS } from "../src/lib/data/workers";
import type { Subscription } from "../src/lib/data/types";

describe("startTrialSubscription (pure engine)", () => {
  it("mints a 30-day, $0, monthly-shaped trial on the chosen plan", () => {
    // Use a future date so daysUntil rounds to exactly 30 regardless of when the test runs.
    const at = new Date(Date.now() + 60_000); // 1 minute from now
    const sub = startTrialSubscription("professional", at);
    expect(sub.plan).toBe("professional");
    expect(sub.status).toBe("active");
    expect(sub.price).toBe(0);
    expect(sub.period).toBe("monthly");
    expect(sub.invoiceNo).toBe("TRIAL-PROFESSIONAL");
    expect(daysUntil(sub.expiresAt)).toBe(30);
    expect(daysUntil(sub.expiresAt)).toBeLessThanOrEqual(30);
  });

  it("statuses like a normal active subscription (expiring inside the reminder window)", () => {
    const soon = startTrialSubscription("basic", new Date(Date.now() - 27 * 86400000));
    expect(subscriptionStatus(soon)).toBe("expiring");
    const expired = startTrialSubscription("basic", new Date(Date.now() - 31 * 86400000));
    expect(subscriptionStatus(expired)).toBe("expired");
  });
});

describe("first plan = trial (renewWorkerSubscriptionBySlug gate)", () => {
  // khaled is the renewal-seam fixture worker; remember his original
  // subscription so the shared in-memory workforce is restored for the rest
  // of the suite.
  const SLUG = "khaled-al-harbi-plumbing";
  let original: Worker["subscription"];

  beforeEach(() => {
    const w = workerBySlug(SLUG)!;
    original = w.subscription;
    // The scenario: a brand-new worker — no plan ever. The domain type types
    // `subscription` as required, but a real-mode Worker row can genuinely
    // lack one (that is exactly what the trial gate defends) — cast honestly.
    w.subscription = undefined as unknown as Subscription;
  });

  afterEach(() => {
    workerBySlug(SLUG)!.subscription = original;
    vi.restoreAllMocks();
  });

  it("a worker with no subscription gets a $0 trial — no invoice, no charge", async () => {
    const res = await renewWorkerSubscriptionBySlug(SLUG, "professional");
    const w = workerBySlug(SLUG)!;
    expect(w.subscription?.price).toBe(0);
    expect(w.subscription?.plan).toBe("professional");
    expect(w.subscription?.invoiceNo).toMatch(/^TRIAL-/);
    expect(res.invoice).toBeNull(); // no invoice — nothing was charged
    expect(res.days).toBe(30);
  });

  it("a worker who ever had a plan pays from day one (no trial on lapse)", async () => {
    // First call consumes the once-per-worker trial.
    await renewWorkerSubscriptionBySlug(SLUG, "professional");
    const trial = workerBySlug(SLUG)!.subscription!;
    expect(trial.invoiceNo).toMatch(/^TRIAL-/);

    // Second call — trial used — is a real paid renewal: invoice + price.
    const res = await renewWorkerSubscriptionBySlug(SLUG, "premium");
    const w = workerBySlug(SLUG)!;
    expect(w.subscription?.price).toBe(99); // paid, not $0
    expect(w.subscription?.invoiceNo).not.toMatch(/^TRIAL-/);
    expect(res.invoice).not.toBeNull();
    expect(res.days).toBeGreaterThanOrEqual(28);
  });

  it("an EXPIRED subscription holder also pays (the trial is once per worker, not per lapse)", async () => {
    const w = workerBySlug(SLUG)!;
    w.subscription = {
      plan: "basic",
      status: "expired",
      startedAt: "2025-01-01T00:00:00.000Z",
      expiresAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      price: 15,
      invoiceNo: "INV-OLD",
      period: "monthly",
    };
    const res = await renewWorkerSubscriptionBySlug(SLUG, "premium");
    expect(w.subscription?.price).toBe(99);
    expect(w.subscription?.invoiceNo).not.toMatch(/^TRIAL-/);
    expect(res.invoice).not.toBeNull();
  });
});

// Local type mirror — Subscription is optional on Worker but importing the
// domain type here keeps the fixture surgery above honest.
type Worker = (typeof WORKERS)[number];
