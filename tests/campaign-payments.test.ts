import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// The server action imports next/cache — mock it so the action layer is
// testable (the demo adapter underneath stays real).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// createCampaignAction / payCampaignAction allow company OR admin, and
// refundCampaignAction requires admin — the test env has no cookie, so hand
// the actions a demo ADMIN session (satisfies every gate in this file).
vi.mock("@/lib/auth-demo", () => ({
  getSession: async () => ({
    id: "u-admin",
    name: "Platform Admin",
    email: "admin@workersarena.com",
    role: "admin" as const,
    hue: 280,
  }),
}));
// Mirror the booking-email chain tests: capture outbound dispatches so the
// campaignRefunded payload (amount + reason, addressed to the company) and
// its rendered email can be asserted end-to-end from demoRefundCampaignPayment.
const { dispatched } = vi.hoisted(() => ({
  dispatched: [] as import("../src/lib/notifications/types").ChannelPayload[],
}));

vi.mock("../src/lib/notifications/dispatcher", () => ({
  // Synchronous capture: the mock body runs during the dispatch() call, so no
  // microtask flush is needed before asserting.
  dispatch: (payload: import("../src/lib/notifications/types").ChannelPayload) => {
    dispatched.push(payload);
    return Promise.resolve([]);
  },
  getEnabledChannels: () => [],
  resetChannels: () => {},
}));

import {
  confirmCampaignPayment,
  createCampaign,
  createCampaignCheckout,
  getActiveAdsFor,
  getCampaigns,
  getInvoices,
  getNotificationsList,
  refundCampaignPayment,
} from "../src/lib/data/repo";
import { resetAdminActivityFeed } from "../src/lib/data/activity";
import { demoCampaignPayment, resetCampaignStore } from "../src/lib/data/campaigns";
import { getPaymentProvider } from "../src/lib/payments/registry";
import { simulatedProvider } from "../src/lib/payments/simulated";
import { createCampaignAction, payCampaignAction, refundCampaignAction } from "../src/app/actions/business";
import { campaignRefundNotification } from "../src/lib/data/campaign-notifications";
import { renderCampaignRefundEmail } from "../src/lib/notifications/templates";
import type { ChannelPayload } from "../src/lib/notifications/types";
import type { Campaign, CampaignPayment, Invoice } from "../src/lib/data/types";

// The campaign confirm/refund paths audit to the admin activity feed — isolate
// the file-backed feed per test so this suite never touches the dev's
// .data/admin-activity.json (same pattern as bookings.test.ts). Without this,
// every unit run pollutes the live preview feed with CAMPAIGN_PAID /
// CAMPAIGN_REFUNDED rows for the "E2E plumbing ads" fixture.
let activityFile: string;

beforeEach(() => {
  dispatched.length = 0;
  resetCampaignStore();
  activityFile = `${tmpdir()}/campaigns-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  // Pin the simulated provider — a dev with STRIPE_SECRET_KEY exported would
  // otherwise get stripeProvider and the checkout URL tests would fail.
  delete process.env.STRIPE_SECRET_KEY;
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

const INPUT = {
  nameEn: "E2E plumbing ads",
  nameAr: "إعلانات السباكة",
  placement: "Homepage · Banner",
  adType: "banner" as const,
  budget: 150,
};

async function created(): Promise<{ campaign: Campaign; checkoutUrl: string }> {
  const res = await createCampaign(INPUT);
  if (!res) throw new Error("createCampaign returned null");
  return res;
}

async function paymentOf(campaignId: string): Promise<CampaignPayment> {
  const p = demoCampaignPayment(campaignId);
  if (!p) throw new Error(`no payment for ${campaignId}`);
  return p;
}

describe("self-serve ad purchasing — createCampaign requires payment", () => {
  it("creates the campaign PENDING (not serving ads) with a checkout URL", async () => {
    const { campaign, checkoutUrl } = await created();
    expect(campaign.status).toBe("pending");
    expect(campaign.impressions).toBe(0);
    expect(checkoutUrl).toContain("/api/payments/simulate");

    // A PENDING campaign never serves ads — the payment gate holds.
    expect(await getActiveAdsFor("Homepage · Banner")).not.toContainEqual(
      expect.objectContaining({ id: campaign.id })
    );
  });

  it("mints a PENDING payment row (minor units) + a PENDING advertising invoice", async () => {
    const { campaign } = await created();
    const payment = await paymentOf(campaign.id);
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(15000); // budget × 100 minor
    expect(payment.currency).toBe("USD");

    const invoice = (await getInvoices()).find((i) => i.campaignId === campaign.id);
    expect(invoice).toBeDefined();
    expect(invoice?.status).toBe("pending");
    expect(invoice?.number).toMatch(/^INV-\d+$/);
    expect(invoice?.scope).toBe("advertising");
  });

  it("createCampaignCheckout is idempotent per campaign", async () => {
    const { campaign, checkoutUrl } = await created();
    const again = await createCampaignCheckout(campaign.id);
    expect(again?.url).toBe(checkoutUrl);
  });

  it("a failing checkout provider returns null (no 500) and leaves a recoverable PENDING campaign", async () => {
    // The Stripe provider THROWS on API errors; the create path must surface
    // that as a null (action returns { error: "checkout" }) instead of
    // crashing, and the PENDING rows stay so the Pay-now button can recover.
    vi.spyOn(simulatedProvider, "createCheckout").mockRejectedValueOnce(new Error("stripe down"));
    const res = await createCampaign(INPUT);
    expect(res).toBeNull();
    const pending = (await getCampaigns()).find((c) => c.nameEn === INPUT.nameEn);
    expect(pending?.status).toBe("pending");
    // The idempotent re-mint works once the provider recovers.
    vi.restoreAllMocks();
    const checkout = await createCampaignCheckout(pending!.id);
    expect(checkout?.url).toContain("/api/payments/simulate");
  });

  it("createCampaignCheckout returns null for an unknown campaign", async () => {
    expect(await createCampaignCheckout("c-nope")).toBeNull();
  });
});

describe("confirmCampaignPayment — the webhook flips PENDING → ACTIVE", () => {
  it("activates the campaign, pays the payment + invoice and notifies the company", async () => {
    const { campaign } = await created();
    const confirmed = await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    expect(confirmed?.status).toBe("active");

    // Now the campaign serves ads for its placement.
    const serving = await getActiveAdsFor("Homepage · Banner");
    expect(serving.some((c) => c.id === campaign.id)).toBe(true);

    const payment = await paymentOf(campaign.id);
    expect(payment.status).toBe("paid");
    expect(payment.providerRef).toBe("sim_pay-c-6");
    expect(payment.paidAt).toBeTruthy();

    const invoice = (await getInvoices()).find((i) => i.campaignId === campaign.id);
    expect(invoice?.status).toBe("paid");

    const inbox = (await getNotificationsList()).filter((n) => n.type === "campaign");
    expect(inbox.some((n) => n.href === "/company")).toBe(true);
  });

  it("is idempotent — a duplicate webhook delivery no-ops without re-notifying", async () => {
    const { campaign } = await created();
    // Count the campaign notifications BEFORE (earlier tests may have added
    // some — the demo inbox is a process-wide singleton, only campaigns reset).
    const before = (await getNotificationsList()).filter((n) => n.type === "campaign").length;
    await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    const again = await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    expect(again?.status).toBe("active");
    const after = (await getNotificationsList()).filter((n) => n.type === "campaign").length;
    // Exactly one NEW notification — the redelivery no-ops.
    expect(after).toBe(before + 1);
  });

  it("returns null for an unknown campaign", async () => {
    expect(await confirmCampaignPayment("c-nope", "sim_pay-x")).toBeNull();
  });

  it("returns null when the campaign isn't awaiting payment", async () => {
    // The seeded c1 is ACTIVE — nothing to confirm.
    expect(await confirmCampaignPayment("c1", "sim_pay-x")).toBeNull();
  });
});

describe("admin campaign refund", () => {
  it("refunds a PAID payment, ends the campaign and audits the feed", async () => {
    const { campaign } = await created();
    await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    const refundSpy = vi.spyOn(simulatedProvider, "refund");

    const refunded = await refundCampaignPayment(campaign.id, "Platform Admin", "Campaign violated ad policy");
    expect(refunded?.status).toBe("refunded");
    expect(refunded?.refundedAt).toBeTruthy();
    expect(refunded?.refundReason).toBe("Campaign violated ad policy");
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy).toHaveBeenCalledWith("sim_pay-c-6", 15000);

    // The campaign stops serving — ended is the terminal state.
    const c = (await getCampaigns()).find((x) => x.id === campaign.id);
    expect(c?.status).toBe("ended");
    expect(await getActiveAdsFor("Homepage · Banner")).not.toContainEqual(
      expect.objectContaining({ id: campaign.id })
    );

    // The refund lands in the admin activity feed (type payment) — and the
    // stated reason rides the entry text so the feed tells the same story
    // as the table's refunded-badge tooltip.
    const { getAdminActivityFeed } = await import("../src/lib/data/activity");
    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.type === "payment" && e.code === "CAMPAIGN_REFUNDED");
    expect(entry).toBeDefined();
    expect(entry?.actionEn).toContain("Campaign violated ad policy");

    // The company is notified — a campaignRefunded payload with the amount +
    // reason, addressed to the demo company, deep-linking /company (mirrors
    // the bookingRefund chain).
    const refundPayload = dispatched.find((p) => p.type === "campaignRefunded");
    expect(refundPayload).toBeDefined();
    expect(refundPayload!.href).toBe("/company");
    expect(refundPayload!.recipient?.email).toBe("ads@buildco.sa");
    expect(refundPayload!.campaignRefund).toMatchObject({
      campaignName: campaign.nameEn,
      amount: 15000,
      currency: "USD",
      reason: "Campaign violated ad policy",
    });

    // The refund email renders that same context — the card shows the
    // campaign, the refunded amount (15000 minor → $150.00) and the reason.
    const email = renderCampaignRefundEmail(refundPayload!, "en");
    expect(email.subject).toContain("Campaign refunded");
    expect(email.html).toContain("Refund details");
    expect(email.html).toContain(campaign.nameEn);
    expect(email.html).toContain("$150"); // 15000 minor → 150 major (formatPrice rounds)
    expect(email.html).toContain("Campaign violated ad policy"); // reason row
    expect(email.html).toContain("/company");

    // Credit note — the campaign's paid advertising invoice flips to
    // "refunded" (the company invoices list shows the refunded amount — the
    // invoice's major-unit amount — instead of a stale "paid" row).
    const invoice = (await getInvoices()).find((i) => i.campaignId === campaign.id);
    expect(invoice?.status).toBe("refunded");
    expect(invoice?.amount).toBe(150); // major units — the refunded amount

    // And the inbox record carries the same story for the bell / notifications page.
    const inbox = await getNotificationsList();
    expect(inbox.some((n) => n.type === "campaignRefunded" && n.href === "/company")).toBe(true);
  });

  it("refunds nothing for a non-paid payment", async () => {
    const { campaign } = await created(); // PENDING payment
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    expect(await refundCampaignPayment(campaign.id)).toBeNull();
    expect(refundSpy).not.toHaveBeenCalled();
    // No refund → no company notification AND the invoice stays pending.
    expect(dispatched.find((p) => p.type === "campaignRefunded")).toBeUndefined();
    const invoice = (await getInvoices()).find((i) => i.campaignId === campaign.id);
    expect(invoice?.status).toBe("pending");
  });

  it("is idempotent — a second refund no-ops", async () => {
    const { campaign } = await created();
    await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    await refundCampaignPayment(campaign.id);
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    expect(await refundCampaignPayment(campaign.id)).toBeNull();
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it("refundCampaignAction refunds as admin and revalidates (reason recorded)", async () => {
    const { campaign } = await created();
    await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    const res = await refundCampaignAction(campaign.id, "Duplicate purchase");
    expect(res.ok).toBe(true);
    expect(demoCampaignPayment(campaign.id)?.status).toBe("refunded");
    expect(demoCampaignPayment(campaign.id)?.refundReason).toBe("Duplicate purchase");
  });

  it("refundCampaignAction refuses a refund without a stated reason", async () => {
    const { campaign } = await created();
    await confirmCampaignPayment(campaign.id, "sim_pay-c-6");
    const res = await refundCampaignAction(campaign.id);
    expect(res).toEqual({ ok: false, error: "reason" });
    // Nothing happened — the payment stays PAID and the campaign keeps serving.
    expect(demoCampaignPayment(campaign.id)?.status).toBe("paid");
    expect((await getCampaigns()).find((c) => c.id === campaign.id)?.status).toBe("active");
  });

  it("refundCampaignAction errors for an unknown campaign", async () => {
    const res = await refundCampaignAction("c-nope", "test reason");
    expect(res).toEqual({ ok: false, error: "not-found" });
  });
});

describe("server actions", () => {
  it("createCampaignAction returns the checkout URL (campaign stays pending)", async () => {
    const fd = new FormData();
    fd.set("nameEn", INPUT.nameEn);
    fd.set("nameAr", INPUT.nameAr);
    fd.set("placement", INPUT.placement);
    fd.set("adType", INPUT.adType);
    fd.set("budget", String(INPUT.budget));
    const res = await createCampaignAction(undefined, fd);
    expect(res.ok).toBe(true);
    expect(res.checkoutUrl).toContain("/api/payments/simulate");
    expect(res.campaign?.status).toBe("pending");
  });

  it("createCampaignAction validates the budget minimum", async () => {
    const fd = new FormData();
    fd.set("nameEn", "x");
    fd.set("nameAr", "x");
    fd.set("placement", "Homepage");
    fd.set("adType", "banner");
    fd.set("budget", "10"); // below the 50 minimum
    const res = await createCampaignAction(undefined, fd);
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it("payCampaignAction re-mints the checkout URL for a pending campaign", async () => {
    const { campaign } = await created();
    const res = await payCampaignAction(campaign.id);
    expect(res.ok).toBe(true);
    expect(res.url).toContain("/api/payments/simulate");
  });

  it("payCampaignAction errors for an unknown campaign", async () => {
    const res = await payCampaignAction("c-nope");
    expect(res).toEqual({ ok: false, error: "not-found" });
  });
});

describe("payment provider seam — campaign checkout", () => {
  it("the simulated provider round-trips the campaignId", async () => {
    const result = await simulatedProvider.createCheckout({
      paymentId: "pay-c-6",
      campaignId: "c-6",
      amountMinor: 15000,
      currency: "USD",
      description: "E2E plumbing ads",
      successUrl: "https://app.example.com/company?paid=1",
      cancelUrl: "https://app.example.com/company",
    });
    expect(result.url).toContain("/api/payments/simulate");
    expect(result.url).toContain("campaignId=c-6");

    const parsed = new URL(result.url, "http://localhost");
    const verified = await simulatedProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({
        bookingId: parsed.searchParams.get("bookingId"),
        campaignId: parsed.searchParams.get("campaignId"),
        paymentId: parsed.searchParams.get("paymentId"),
        ref: parsed.searchParams.get("ref"),
        amount: Number(parsed.searchParams.get("amount")),
        sig: parsed.searchParams.get("sig"),
      })
    );
    expect(verified).toMatchObject({ campaignId: "c-6", providerRef: "sim_pay-c-6", amountMinor: 15000 });
  });

  it("a booking checkout round-trip still resolves bookingId (no regression)", async () => {
    const result = await simulatedProvider.createCheckout({
      paymentId: "pay-bk-1",
      bookingId: "bk-1",
      amountMinor: 5000,
      currency: "SAR",
      description: "BK-1001 — Fix sink",
      successUrl: "https://app.example.com/bookings",
      cancelUrl: "https://app.example.com/bookings",
    });
    const parsed = new URL(result.url, "http://localhost");
    const verified = await simulatedProvider.verifyWebhook(
      new Headers(),
      JSON.stringify({
        bookingId: parsed.searchParams.get("bookingId"),
        paymentId: parsed.searchParams.get("paymentId"),
        ref: parsed.searchParams.get("ref"),
        amount: Number(parsed.searchParams.get("amount")),
        sig: parsed.searchParams.get("sig"),
      })
    );
    expect(verified).toMatchObject({ bookingId: "bk-1", providerRef: "sim_pay-bk-1" });
    expect(verified?.campaignId).toBeUndefined();
  });
});

describe("payment webhook + simulated callback routes", () => {
  it("POST /api/payments/webhook confirms the campaign from a valid simulated body", async () => {
    const { campaign, checkoutUrl } = await created();
    const parsed = new URL(checkoutUrl, "http://localhost");
    const { POST } = await import("../src/app/api/payments/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        body: JSON.stringify({
          bookingId: parsed.searchParams.get("bookingId"),
          campaignId: parsed.searchParams.get("campaignId"),
          paymentId: parsed.searchParams.get("paymentId"),
          ref: parsed.searchParams.get("ref"),
          amount: Number(parsed.searchParams.get("amount")),
          sig: parsed.searchParams.get("sig"),
        }),
      })
    );
    expect(res.status).toBe(200);
    const list = await getCampaigns();
    expect(list.find((c) => c.id === campaign.id)?.status).toBe("active");
  });

  it("GET /api/payments/simulate confirms the campaign and redirects to /company?paid=1", async () => {
    const { campaign, checkoutUrl } = await created();
    const parsed = new URL(checkoutUrl, "http://localhost");
    const { GET } = await import("../src/app/api/payments/simulate/route");
    const res = await GET(new Request(`http://localhost${parsed.pathname}${parsed.search}`));
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/company?paid=1");
    const list = await getCampaigns();
    expect(list.find((c) => c.id === campaign.id)?.status).toBe("active");
  });

  it("the webhook rejects a tampered campaign body", async () => {
    const { POST } = await import("../src/app/api/payments/webhook/route");
    const res = await POST(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        body: JSON.stringify({ campaignId: "c-6", paymentId: "pay-c-6", ref: "x", amount: 1, sig: "nope" }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("campaignRefundNotification builder (single source of truth)", () => {
  it("builds the exact payload the adapters dispatch and renderCampaignRefundEmail renders it — the /admin preview contract", () => {
    const msg = campaignRefundNotification(
      { nameEn: "Villa construction — Riyadh", nameAr: "بناء فيلا — الرياض" },
      { amount: 15000, currency: "USD", refundReason: "Campaign violated ad policy" }
    );
    expect(msg).toMatchObject({
      type: "campaignRefunded",
      href: "/company",
      campaignRefund: {
        campaignName: "Villa construction — Riyadh",
        amount: 15000,
        currency: "USD",
        reason: "Campaign violated ad policy",
      },
    });

    // The admin page builds the preview payload from this builder + renders it.
    const payload: ChannelPayload = {
      id: "preview-c-x",
      type: msg.type,
      titleEn: msg.titleEn,
      titleAr: msg.titleAr,
      bodyEn: msg.bodyEn,
      bodyAr: msg.bodyAr,
      href: msg.href,
      time: new Date().toISOString(),
      campaignRefund: msg.campaignRefund,
    };
    const email = renderCampaignRefundEmail(payload, "en");
    expect(email.subject).toContain("Campaign refunded");
    expect(email.html).toContain("Villa construction — Riyadh");
    expect(email.html).toContain("$150");
    expect(email.html).toContain("Campaign violated ad policy");
    expect(email.html).toContain("/company");
  });

  it("omits the reason row when the refund had no stated reason", () => {
    const msg = campaignRefundNotification(
      { nameEn: "AC maintenance", nameAr: "صيانة مكيفات" },
      { amount: 400000, currency: "USD", refundReason: undefined }
    );
    const payload: ChannelPayload = {
      id: "preview-c-y",
      type: msg.type,
      titleEn: msg.titleEn,
      titleAr: msg.titleAr,
      bodyEn: msg.bodyEn,
      bodyAr: msg.bodyAr,
      href: msg.href,
      time: new Date().toISOString(),
      campaignRefund: msg.campaignRefund,
    };
    const email = renderCampaignRefundEmail(payload, "en");
    expect(email.html).toContain("$4,000");
    expect(email.html).not.toContain("Reason");
  });
});

describe("shared invoice store", () => {
  it("getInvoices still serves the seeded advertising invoices", async () => {
    const invoices: Invoice[] = await getInvoices();
    expect(invoices.length).toBe(3);
    expect(invoices[0]?.number).toBe("INV-1045");
  });

  it("the seeded campaign store keeps the original demo data", async () => {
    const campaigns = await getCampaigns();
    expect(campaigns).toHaveLength(5);
    expect(campaigns.find((c) => c.id === "c1")?.status).toBe("active");
  });
});
