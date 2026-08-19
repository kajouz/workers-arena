import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// The server actions import next/cache — mock it so the action layer is
// testable (the demo adapters underneath stay real).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", () => ({ getSession: getSessionMock }));

import { payBookingAction } from "../src/app/actions/bookings";
import {
  confirmManualPaymentAction,
  payCampaignAction,
  purchaseUpgradeAction,
  renewSubscriptionAction,
} from "../src/app/actions/business";
import {
  cancelBooking,
  createCampaign,
  createPurchaseCheckout,
  getCustomerBookings,
  getPendingManualPayments,
  respondToBooking,
} from "../src/lib/data/repo";
import { resetBookingsStore } from "../src/lib/data/bookings";
import { resetCampaignStore } from "../src/lib/data/campaigns";
import { resetPurchaseStore } from "../src/lib/data/purchases";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { getPaymentProvider } from "../src/lib/payments/registry";
import { omtProvider } from "../src/lib/payments/omt";
import { whishProvider } from "../src/lib/payments/whish";
import { toDomainPaymentMethod, type Booking } from "../src/lib/data/types";
import { workerBySlug } from "../src/lib/data/workers";

const DEMO_WORKER = "khaled-al-harbi-plumbing";

// The §Lebanon confirms audit to the admin activity feed — isolate the
// file-backed feed per test so it never touches the dev's
// .data/admin-activity.json (same pattern as bookings.test.ts).
let activityFile: string;

function bookingOf(r: Booking | { error: string }): Booking {
  if ("error" in r) throw new Error(`expected booking, got error ${r.error}`);
  return r;
}

const ADMIN = { id: "a1", name: "Amina Admin", email: "admin@workersarena.com", role: "admin", hue: 280 };
const WORKER = { id: "w-khaled", name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", role: "worker", hue: 25 };
const CUSTOMER = { id: "u-sara", name: "Sara", email: "sara@example.com", role: "customer", hue: 200 };

beforeEach(() => {
  resetBookingsStore();
  resetCampaignStore();
  resetPurchaseStore();
  getSessionMock.mockReset();
  activityFile = `${tmpdir()}/lebanon-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

/** Accept bk-1001 with a deposit → PENDING_PAYMENT + a Payment row. */
async function acceptWithDeposit(deposit = 5000): Promise<Booking> {
  const result = await respondToBooking("bk-1001", { accept: true, quote: 25000, deposit });
  const booking = bookingOf(result ?? { error: "not-found" });
  expect(booking.status).toBe("pendingPayment");
  return booking;
}

describe("§Lebanon — OMT & Whish providers", () => {
  it("the registry dispatches the manual providers", () => {
    expect(getPaymentProvider("OMT").method).toBe("OMT");
    expect(getPaymentProvider("WHISH").method).toBe("WHISH");
  });

  it("OMT createCheckout mints a signed /payments/manual instructions URL", async () => {
    const result = await omtProvider.createCheckout({
      paymentId: "pay-x",
      bookingId: "bk-x",
      amountMinor: 5000,
      currency: "USD",
      description: "BK-1001 — Fix sink",
      successUrl: "https://app.example.com/bookings",
      cancelUrl: "https://app.example.com/bookings",
    });
    expect(result.url).toContain("/payments/manual");
    expect(result.url).toContain("provider=omt");
    expect(result.providerRef).toMatch(/^OMT-pay-x-/);

    // The instructions page verifies the URL through the provider's own
    // verifyWebhook (the same contract the webhook route uses) — round-trips.
    const parsed = new URL(result.url, "http://localhost");
    const verified = await omtProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({
        bookingId: parsed.searchParams.get("bookingId"),
        paymentId: parsed.searchParams.get("paymentId"),
        ref: parsed.searchParams.get("ref"),
        amount: Number(parsed.searchParams.get("amount")),
        sig: parsed.searchParams.get("sig"),
      })
    );
    expect(verified).toMatchObject({ bookingId: "bk-x", providerRef: result.providerRef });
  });

  it("Whish createCheckout → verifyWebhook round-trips with its own salt/prefix", async () => {
    const result = await whishProvider.createCheckout({
      paymentId: "pay-y",
      campaignId: "c9",
      amountMinor: 25000,
      currency: "USD",
      description: "Banner campaign",
      successUrl: "https://app.example.com/company",
      cancelUrl: "https://app.example.com/company",
    });
    expect(result.url).toContain("provider=whish");
    expect(result.providerRef).toMatch(/^WHISH-pay-y-/);

    const parsed = new URL(result.url, "http://localhost");
    const verified = await whishProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({
        campaignId: parsed.searchParams.get("campaignId"),
        paymentId: parsed.searchParams.get("paymentId"),
        ref: parsed.searchParams.get("ref"),
        amount: Number(parsed.searchParams.get("amount")),
        sig: parsed.searchParams.get("sig"),
      })
    );
    expect(verified).toMatchObject({ campaignId: "c9", providerRef: result.providerRef });
  });

  it("rejects a tampered signature", async () => {
    const verified = await omtProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({ bookingId: "bk-x", paymentId: "pay-x", ref: "OMT-pay-x-000", amount: 5000, sig: "bad" })
    );
    expect(verified).toBeNull();
  });

  it("manual refunds return provider refund ids", async () => {
    expect(await omtProvider.refund("OMT-pay-x-000")).toBe("omt_refund_OMT-pay-x-000");
    expect(await whishProvider.refund("WHISH-pay-y-000")).toBe("whish_refund_WHISH-pay-y-000");
  });

  it("maps DB payment methods to the domain union", () => {
    expect(toDomainPaymentMethod("OMT")).toBe("omt");
    expect(toDomainPaymentMethod("WHISH")).toBe("whish");
    expect(toDomainPaymentMethod("STRIPE")).toBe("stripe");
    expect(toDomainPaymentMethod("SIMULATED")).toBe("simulated");
    expect(toDomainPaymentMethod("PAYPAL")).toBe("stripe"); // legacy fallback
    expect(toDomainPaymentMethod(undefined)).toBe("stripe");
  });
});

describe("§Lebanon — booking deposits via OMT/Whish", () => {
  it("payBookingAction('omt') lands on the manual instructions page and stamps the method", async () => {
    await acceptWithDeposit();
    const res = await payBookingAction("bk-1001", "omt");
    expect(res.ok).toBe(true);
    expect(res.url).toContain("/payments/manual");
    expect(res.url).toContain("provider=omt");

    const found = (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001");
    expect(found?.paymentMethod).toBe("omt");
    expect(found?.paymentStatus).toBe("pending");
  });

  it("re-minting is idempotent per method; a method switch re-mints with the new provider", async () => {
    await acceptWithDeposit();
    // Same-method re-click returns the already-minted checkout URL.
    const first = await payBookingAction("bk-1001", "omt");
    const same = await payBookingAction("bk-1001", "omt");
    expect(same.url).toBe(first.url);
    expect(same.url).toContain("provider=omt");
    // A method switch mints a fresh checkout with the NEW provider (the
    // customer changed their mind — the OMT instructions page would be wrong).
    const switched = await payBookingAction("bk-1001", "whish");
    expect(switched.url).not.toBe(first.url);
    expect(switched.url).toContain("provider=whish");
    const found = (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001");
    expect(found?.paymentMethod).toBe("whish");
  });

  it("an admin confirm on the pending manual payment flips the deposit CONFIRMED", async () => {
    await acceptWithDeposit();
    await payBookingAction("bk-1001", "omt");

    const pending = await getPendingManualPayments();
    const bookingPayment = pending.find((p) => p.scope === "booking" && p.method === "omt");
    expect(bookingPayment).toBeDefined();
    expect(bookingPayment!.reference).toMatch(/^OMT-/);

    // The admin card label localizes via the booking's bilingual serviceItem —
    // the AR row shows the Arabic catalog name, never the EN free-text jobTitle.
    expect(bookingPayment!.labelEn).toBe("BK-1001 — Fix leaking pipe");
    expect(bookingPayment!.labelAr).toBe("BK-1001 — إصلاح تسريب ماسورة");
    expect(bookingPayment!.labelAr).not.toContain("Leaking kitchen sink repair");

    getSessionMock.mockResolvedValue(ADMIN);
    const res = await confirmManualPaymentAction(bookingPayment!.id);
    expect(res.ok).toBe(true);

    const booking = bookingOf(
      (await getCustomerBookings({ email: "sara@example.com" })).find((b) => b.id === "bk-1001") ?? { error: "not-found" }
    );
    expect(booking.status).toBe("confirmed");
    // The pending queue is now empty for this payment — idempotent no-op next.
    getSessionMock.mockResolvedValue(ADMIN);
    const again = await confirmManualPaymentAction(bookingPayment!.id);
    expect(again).toEqual({ ok: false, error: "not-found" });

    // The admin confirm is audited with the ACTING ADMIN's identity, not the
    // worker's — the feed entry credits who actually confirmed receipt.
    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "BOOKING_CONFIRMED" && e.bookingNo === "BK-1001");
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("Amina Admin");
    expect(entry!.actorId).toBe("a1");
  });

  it("non-admins cannot confirm manual payments", async () => {
    await acceptWithDeposit();
    await payBookingAction("bk-1001", "omt");
    getSessionMock.mockResolvedValue(CUSTOMER);
    const res = await confirmManualPaymentAction("pay-bk-1001");
    expect(res).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("§Lebanon — campaign purchases via Whish", () => {
  it("pays a PENDING campaign through the manual instructions page and confirms it", async () => {
    const created = await createCampaign({
      nameEn: "Beirut plumbing ads",
      nameAr: "إعلانات السباكة في بيروت",
      placement: "home-hero",
      adType: "banner",
      budget: 500,
    });
    expect(created).not.toBeNull();
    const campaignId = created!.campaign.id;

    getSessionMock.mockResolvedValue({ ...CUSTOMER, role: "company", id: "u-company" });
    const res = await payCampaignAction(campaignId, "whish");
    expect(res.ok).toBe(true);
    expect(res.url).toContain("/payments/manual");
    expect(res.url).toContain("provider=whish");

    const pending = await getPendingManualPayments();
    const campaignPayment = pending.find((p) => p.scope === "campaign" && p.method === "whish");
    expect(campaignPayment).toBeDefined();
    expect(campaignPayment!.reference).toMatch(/^WHISH-/);

    getSessionMock.mockResolvedValue(ADMIN);
    const confirm = await confirmManualPaymentAction(campaignPayment!.id);
    expect(confirm.ok).toBe(true);

    const campaigns = await (await import("../src/lib/data/repo")).getCampaigns();
    expect(campaigns.find((c) => c.id === campaignId)?.status).toBe("active");

    // CAMPAIGN_PAID lands in the feed with the acting admin as actor.
    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "CAMPAIGN_PAID" && e.actionEn.includes("Beirut plumbing ads"));
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("Amina Admin");
    expect(entry!.actorId).toBe("a1");
  });
});

describe("§Lebanon — subscription renewal via OMT/Whish (manual)", () => {
  it("mints a manual checkout instead of the instant extension", async () => {
    getSessionMock.mockResolvedValue(WORKER);
    const f = new FormData();
    f.set("plan", "basic");
    f.set("period", "annual");
    f.set("workerSlug", DEMO_WORKER);
    f.set("method", "omt");
    const res = await renewSubscriptionAction(f);
    expect(res.ok).toBe(true);
    expect(res.url).toContain("/payments/manual");
    expect(res.days).toBeUndefined(); // not extended yet — awaiting the admin's confirm

    const pending = await getPendingManualPayments();
    const subPayment = pending.find((p) => p.scope === "subscription");
    expect(subPayment).toBeDefined();

    getSessionMock.mockResolvedValue(ADMIN);
    const confirm = await confirmManualPaymentAction(subPayment!.id);
    expect(confirm.ok).toBe(true);

    const khaled = workerBySlug(DEMO_WORKER)!;
    expect(khaled.subscription.plan).toBe("basic");
    const daysLeft = Math.round(
      (new Date(khaled.subscription.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    expect(daysLeft).toBeGreaterThanOrEqual(300); // annual term
  });
});

describe("§Lebanon — paid upgrades (BUSINESS-MODEL §5.1, no Stripe)", () => {
  it("verification purchase: buy via Whish → admin confirm flips the Verified badge", async () => {
    getSessionMock.mockResolvedValue(WORKER);
    const f = new FormData();
    f.set("scope", "verification");
    f.set("tier", "professional");
    f.set("method", "whish");
    f.set("workerSlug", DEMO_WORKER);
    const res = await purchaseUpgradeAction(f);
    expect(res.ok).toBe(true);
    expect(res.url).toContain("provider=whish");

    const pending = await getPendingManualPayments();
    const payment = pending.find((p) => p.scope === "verification");
    expect(payment).toBeDefined();
    expect(payment!.amount).toBe(1900); // Professional $19

    getSessionMock.mockResolvedValue(ADMIN);
    await confirmManualPaymentAction(payment!.id);
    expect(workerBySlug(DEMO_WORKER)!.verified).toBe(true);
    expect(workerBySlug(DEMO_WORKER)!.verification).toBe("verified");

    // PURCHASE_CONFIRMED lands in the feed with the acting admin as actor.
    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "PURCHASE_CONFIRMED" && e.actionEn.includes("verification"));
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("Amina Admin");
    expect(entry!.actorId).toBe("a1");
  });

  it("featured + emergency add-ons activate on admin confirm", async () => {
    for (const scope of ["featured", "emergency"] as const) {
      getSessionMock.mockResolvedValue(WORKER);
      const f = new FormData();
      f.set("scope", scope);
      f.set("method", "omt");
      f.set("workerSlug", DEMO_WORKER);
      const res = await purchaseUpgradeAction(f);
      expect(res.ok).toBe(true);

      const pending = await getPendingManualPayments();
      const payment = pending.find((p) => p.scope === scope);
      expect(payment).toBeDefined();
      getSessionMock.mockResolvedValue(ADMIN);
      const confirm = await confirmManualPaymentAction(payment!.id);
      expect(confirm.ok).toBe(true);
    }
    const khaled = workerBySlug(DEMO_WORKER)!;
    expect(khaled.featured).toBe(true);
    expect(khaled.emergency).toBe(true);
  });

  it("createPurchaseCheckout rejects an unknown worker", async () => {
    const res = await createPurchaseCheckout({
      workerSlug: "nobody",
      scope: "featured",
      method: "OMT",
    });
    expect(res).toBeNull();
  });

  it("non-workers cannot buy upgrades", async () => {
    getSessionMock.mockResolvedValue(CUSTOMER);
    const f = new FormData();
    f.set("scope", "featured");
    f.set("method", "omt");
    f.set("workerSlug", DEMO_WORKER);
    const res = await purchaseUpgradeAction(f);
    expect(res).toEqual({ error: "unauthorized" });
  });
});

describe("§Lebanon — the pending-manual queue is the manual twin of a webhook", () => {
  it("a customer paying a booking deposit manually, then cancelling, still refunds via the provider seam", async () => {
    // Booking → OMT checkout → admin confirms → worker cancels >24h before
    // start (bk-1001 sits at "tomorrow 10:00" — 24h window) — the refund
    // always routes through the provider's refund() even for manual methods.
    await acceptWithDeposit();
    await payBookingAction("bk-1001", "omt");
    const pending = await getPendingManualPayments();
    const bookingPayment = pending.find((p) => p.scope === "booking");
    getSessionMock.mockResolvedValue(ADMIN);
    await confirmManualPaymentAction(bookingPayment!.id);

    const refundSpy = vi.spyOn(omtProvider, "refund");
    const cancelled = await cancelBooking("bk-1001", { by: "customer", reason: "Change of plans" });
    expect(cancelled?.status).toBe("cancelled");
    expect(refundSpy).toHaveBeenCalled();
  });
});
