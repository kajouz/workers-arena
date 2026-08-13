import { describe, expect, it } from "vitest";
import { applyPlanChange, daysUntil, issueInvoice, planPrice, renewSubscription, subscriptionStatus, dueReminderWindow } from "../src/lib/data/subscriptions";
import { WORKERS, workerBySlug } from "../src/lib/data/workers";
import { searchWorkers } from "../src/lib/data/search";

describe("subscriptions engine", () => {
  it("derives expired / expiring / active status from the expiry date", () => {
    const active = { plan: "premium" as const, status: "active" as const, startedAt: "", expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(), price: 119, invoiceNo: "INV-1" };
    const expiring = { ...active, expiresAt: new Date(Date.now() + 3 * 86400000).toISOString() };
    const expired = { ...active, expiresAt: new Date(Date.now() - 1 * 86400000).toISOString() };
    expect(subscriptionStatus(active)).toBe("active");
    expect(subscriptionStatus(expiring)).toBe("expiring");
    expect(subscriptionStatus(expired)).toBe("expired");
  });

  it("daysUntil counts whole days (negative when past)", () => {
    expect(daysUntil(new Date(Date.now() + 7 * 86400000).toISOString())).toBe(7);
    expect(daysUntil(new Date(Date.now() - 2 * 86400000).toISOString())).toBe(-2);
  });

  it("dueReminderWindow returns only 7/3/1 day windows", () => {
    const sub = { plan: "basic" as const, status: "active" as const, startedAt: "", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), price: 29, invoiceNo: "INV-1" };
    expect(dueReminderWindow(sub)).toBe(7);
    expect(dueReminderWindow({ ...sub, expiresAt: new Date(Date.now() + 12 * 86400000).toISOString() })).toBeNull();
    expect(dueReminderWindow({ ...sub, expiresAt: new Date(Date.now() - 1 * 86400000).toISOString() })).toBeNull();
  });

  it("applyPlanChange swaps the tier, keeping an active subscription's expiry", () => {
    const active = { plan: "premium" as const, status: "active" as const, startedAt: "2026-01-01", expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(), price: 119, invoiceNo: "INV-1" };
    const next = applyPlanChange(active, "enterprise");
    expect(next.plan).toBe("enterprise");
    expect(next.price).toBe(299);
    expect(next.expiresAt).toBe(active.expiresAt); // expiry untouched
    expect(next.startedAt).toBe("2026-01-01"); // startedAt untouched
  });

  it("applyPlanChange reactivates an expired subscription for one monthly period", () => {
    const expired = { plan: "basic" as const, status: "expired" as const, startedAt: "2025-01-01", expiresAt: new Date(Date.now() - 5 * 86400000).toISOString(), price: 29, invoiceNo: "INV-1" };
    const next = applyPlanChange(expired, "premium");
    expect(next.plan).toBe("premium");
    expect(next.status).toBe("active");
    expect(daysUntil(next.expiresAt)).toBeGreaterThanOrEqual(28); // ~1 month extension
    expect(next.price).toBe(119);
  });

  it("renewSubscription extends to ~1 month and issues an invoice", () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;
    const { subscription, invoice } = renewSubscription(w, "enterprise");
    expect(subscription.plan).toBe("enterprise");
    expect(subscription.status).toBe("active");
    expect(daysUntil(subscription.expiresAt)).toBeGreaterThanOrEqual(28);
    expect(invoice.scope).toBe("subscription");
    expect(invoice.amount).toBe(299);
  });

  it("annual renew extends to ~12 months, bills 10 months, and stamps the period", () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;
    const { subscription, invoice } = renewSubscription(w, "enterprise", "annual");
    expect(subscription.period).toBe("annual");
    expect(daysUntil(subscription.expiresAt)).toBeGreaterThanOrEqual(360); // 12 months
    expect(subscription.price).toBe(2990); // 299 × 10 paid months
    expect(invoice.amount).toBe(2990);
    expect(invoice.descriptionEn).toContain("(annual)");
  });

  it("planPrice reflects the billing period (annual = 10 × monthly)", () => {
    expect(planPrice("basic", "monthly")).toBe(29);
    expect(planPrice("basic", "annual")).toBe(290);
    expect(planPrice("professional", "annual")).toBe(590);
    expect(planPrice("premium", "annual")).toBe(1190);
    expect(planPrice("enterprise", "annual")).toBe(2990);
  });

  it("issueInvoice increments invoice numbers", () => {
    const a = issueInvoice(workerBySlug("khaled-al-harbi-plumbing")!, "premium");
    const b = issueInvoice(workerBySlug("khaled-al-harbi-plumbing")!, "premium");
    expect(Number(a.number.replace("INV-", ""))).toBeLessThan(Number(b.number.replace("INV-", "")));
  });

  it("every demo worker carries subscription + verification state", () => {
    for (const w of WORKERS) {
      expect(w.subscription.plan).toBeTruthy();
      expect(w.subscription.expiresAt).toBeTruthy();
      expect(["verified", "pending", "rejected"]).toContain(w.verification);
      expect(w.verified).toBe(w.verification === "verified");
    }
  });

  it("expired-subscription workers are hidden from public search", () => {
    const expired = WORKERS.find((w) => subscriptionStatus(w.subscription) === "expired");
    expect(expired).toBeTruthy(); // demo dataset includes at least one expired worker
    const result = searchWorkers({ query: expired!.nameEn });
    expect(result.items.some((w) => w.id === expired!.id)).toBe(false);
    // Admin can include expired workers explicitly.
    const adminView = searchWorkers({ query: expired!.nameEn, includeExpired: true });
    expect(adminView.items.some((w) => w.id === expired!.id)).toBe(true);
  });
});
