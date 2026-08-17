import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPayload } from "../src/lib/notifications/types";

/**
 * Prisma mirror of the demo chain in tests/campaign-payments.test.ts: LIVE-DB
 * AdCampaign + Payment → prisma adapter → pushNotification → dispatch →
 * renderCampaignRefundEmail. The outbound seam is mocked so the
 * fire-and-forget dispatch exposes the ChannelPayload, then we assert the
 * campaignRefunded payload's context matches the refunded payment (amount,
 * reason, recipient) — the SAME shape the demo chain test asserts, proving
 * both adapters dispatch an identical contract.
 *
 * This file also drives the self-serve PURCHASE path end-to-end against the
 * live DB: prismaCreateCampaign → prismaCreateCampaignCheckout →
 * prismaConfirmCampaignPayment (ACTIVE + PAID + the PAID Invoice the
 * credit-note flip voids) → prismaRefundCampaignPayment voiding it — the
 * full circle the invoice was minted for.
 *
 * Fixtures use a DEDICATED user + company (the seed now creates the BuildCo
 * Ltd Company row for ads@buildco.sa, so reusing that user would collide on
 * the unique Company.userId — and cleanup must never touch seeded rows).
 *
 * Gated on a live DATABASE_URL (mirrors booking-email-chain-prisma.test.ts):
 *   DATABASE_URL=postgresql://… DEMO_MODE=false npx vitest run tests/campaign-email-chain-prisma.test.ts
 */
const { dispatched } = vi.hoisted(() => ({ dispatched: [] as ChannelPayload[] }));

vi.mock("../src/lib/notifications/dispatcher", () => ({
  // Synchronous capture: the mock body runs during the dispatch() call.
  dispatch: (payload: ChannelPayload) => {
    dispatched.push(payload);
    return Promise.resolve([]);
  },
  getEnabledChannels: () => [],
  resetChannels: () => {},
}));

import {
  prismaConfirmCampaignPayment,
  prismaCreateCampaign,
  prismaCreateCampaignCheckout,
  prismaGetActiveAdsFor,
  prismaGetCampaignPayment,
  prismaGetCampaigns,
  prismaGetInvoices,
  prismaRecordClick,
  prismaRecordImpression,
  prismaRefundCampaignPayment,
} from "../src/lib/data/prisma-repo";
import { getAdminActivityFeed } from "../src/lib/data/activity";
import { getPrisma } from "../src/lib/server/prisma";
import { simulatedProvider } from "../src/lib/payments/simulated";
import { renderCampaignRefundEmail } from "../src/lib/notifications/templates";

// Live-DB gate — the prisma path needs a reachable Postgres (mirrors the
// booking prisma chain test). Skipped in the fixture-only test host.
const hasLiveDb = Boolean(process.env.DATABASE_URL);
const describeLive = hasLiveDb ? describe : describe.skip;

// The prisma inbox/activity adapters require demo mode OFF (runtime env read).
process.env.DEMO_MODE = "false";
// The shared setup default (tests/setup-jsdom.ts) redirects the activity feed
// to a temp file — the prisma activity adapter needs it UNSET to select
// prisma mode, so clear it here (activityAdapterMode treats a truthy value as
// file mode even in real mode).
delete process.env.ADMIN_ACTIVITY_FILE;

let userId: string | null = null;
let companyId: string | null = null;
let campaignId: string | null = null;
let invoiceId: string | null = null;
let fixtureEmail = "";

beforeEach(() => {
  dispatched.length = 0;
  // Pin the provider to simulated — a dev shell with STRIPE_SECRET_KEY set
  // would otherwise call the real Stripe refund/checkout APIs.
  delete process.env.STRIPE_SECRET_KEY;
});

afterEach(async () => {
  if (!hasLiveDb) return;
  const prisma = getPrisma();
  if (campaignId) {
    await prisma.payment.deleteMany({ where: { advertisementId: campaignId } }).catch(() => {});
    await prisma.advertisement.deleteMany({ where: { campaignId } }).catch(() => {});
    await prisma.adCampaign.deleteMany({ where: { id: campaignId } }).catch(() => {});
    campaignId = null;
  }
  if (invoiceId) {
    await prisma.invoice.deleteMany({ where: { id: invoiceId } }).catch(() => {});
    invoiceId = null;
  }
  if (companyId) {
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
    companyId = null;
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    userId = null;
  }
  // Wipe what this test emitted — the seed creates no Notification rows and
  // no ActivityLog rows, so type-keyed cleanup restores it exactly.
  // PROMO covers the "Campaign is live" notification (campaign → PROMO).
  await prisma.notification
    .deleteMany({ where: { type: { in: ["CAMPAIGN_REFUNDED", "PROMO"] } } })
    .catch(() => {});
  await prisma.activityLog.deleteMany({ where: { action: "CAMPAIGN_REFUNDED" } }).catch(() => {});
});

/** A dedicated user + company fixture (never the seeded rows). */
async function seedCompany(): Promise<{ userId: string; companyId: string; email: string }> {
  const prisma = getPrisma();
  fixtureEmail = `chain-campaign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.sa`;
  const user = await prisma.user.create({
    data: { name: "Chain Co", email: fixtureEmail, role: "COMPANY", hue: 120, passwordHash: "test" },
  });
  userId = user.id;
  const company = await prisma.company.create({
    data: {
      userId: user.id,
      nameEn: "Chain Co",
      nameAr: "شركة تشين",
      slug: `chain-company-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  });
  companyId = company.id;
  return { userId: user.id, companyId: company.id, email: fixtureEmail };
}

/** A company + ACTIVE campaign + one banner ad + a PAID purchase row (with its
 * PAID Invoice — the credit-note fixture the refund voids). */
async function seedPaidCampaign(): Promise<{ userId: string; companyId: string; campaignId: string; email: string }> {
  const { userId: ownerId, companyId: cid, email } = await seedCompany();
  const prisma = getPrisma();
  const now = Date.now();
  const campaign = await prisma.adCampaign.create({
    data: {
      companyId: cid,
      nameEn: "E2E plumbing ads",
      nameAr: "إعلانات السباكة",
      budget: 15000, // minor units — $150 major (the domain divides by 100)
      currency: "USD",
      startsAt: new Date(now - 24 * 60 * 60 * 1000),
      endsAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });
  campaignId = campaign.id;

  await prisma.advertisement.create({
    data: {
      campaignId: campaign.id,
      companyId: cid,
      type: "BANNER",
      titleEn: "E2E plumbing ads",
      titleAr: "إعلانات السباكة",
      targetUrl: "https://example.com",
      placement: "homepage",
      price: 15000,
      currency: "USD",
      impressions: 10,
      clicks: 1,
      // A paid, live campaign's creative is ACTIVE (the confirm path flips
      // both together) — rotation only serves ACTIVE creatives.
      status: "ACTIVE",
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      companyId: cid,
      advertisementId: campaign.id,
      amount: 15000, // minor units
      currency: "USD",
      method: "STRIPE",
      status: "PAID",
      providerRef: "sim_pay-chain-campaign",
      paidAt: new Date(),
    },
  });

  // The purchase's PAID Invoice — the credit-note fixture the refund voids.
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-chain-${Date.now()}`,
      userId: ownerId,
      paymentId: payment.id,
      amount: 15000, // minor units
      currency: "USD",
      status: "PAID",
      paidAt: new Date(),
    },
  });
  invoiceId = invoice.id;
  return { userId: ownerId, companyId: cid, campaignId: campaign.id, email };
}

describeLive("prisma campaign refund chain (live DB → prisma adapter → dispatcher → renderer)", () => {
  it("prismaGetCampaigns + prismaGetCampaignPayment read the fixtures, and prismaRefundCampaignPayment dispatches the campaignRefunded payload that renderCampaignRefundEmail renders", async () => {
    const { campaignId: cid, email } = await seedPaidCampaign();

    // Reads — the domain Campaign maps the DB row (minor → major budget) and
    // the payment row rides the same lifecycle statuses as the demo.
    const campaigns = await prismaGetCampaigns();
    expect(campaigns).toContainEqual(
      expect.objectContaining({
        id: cid,
        nameEn: "E2E plumbing ads",
        status: "active",
        budget: 150, // 15000 minor → 150 major
        spent: 0,
        adType: "banner",
        placement: "homepage",
        impressions: 10,
        clicks: 1,
        ctr: 10, // 1/10 → 10%
      })
    );

    const payment = await prismaGetCampaignPayment(cid);
    expect(payment).toMatchObject({
      campaignId: cid,
      amount: 15000, // minor units, as-is
      currency: "USD",
      status: "paid",
      providerRef: "sim_pay-chain-campaign",
    });
    expect(payment?.paidAt).toBeTruthy();

    // Refund — the provider charge is refunded, the payment flips to REFUNDED
    // (refundReason recorded), the campaign stops serving.
    const refundSpy = vi.spyOn(simulatedProvider, "refund");
    const refunded = await prismaRefundCampaignPayment(cid, {
      by: "Platform Admin",
      reason: "Campaign violated ad policy",
    });
    expect(refunded).not.toBeNull();
    expect(refunded!.status).toBe("refunded");
    expect(refunded!.refundedAt).toBeTruthy();
    expect(refunded!.refundReason).toBe("Campaign violated ad policy");
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy).toHaveBeenCalledWith("sim_pay-chain-campaign", 15000);

    // The campaign is ended — getActiveAdsFor serves nothing (the seeded ad's
    // campaign is no longer ACTIVE).
    expect((await prismaGetCampaigns()).find((c) => c.id === cid)?.status).toBe("ended");

    // Credit note — the purchase's PAID Invoice flips to VOID (InvoiceStatus
    // has no REFUNDED; VOID is the terminal marker mirroring the demo's
    // paid → refunded flip).
    const inv = await getPrisma().invoice.findUnique({ where: { id: invoiceId! } });
    expect(inv?.status).toBe("VOID");

    // The company is notified — the IDENTICAL payload shape the demo chain
    // asserts: amount + reason, deep-link /company, addressed to the company.
    const refundPayload = dispatched.find((p) => p.type === "campaignRefunded");
    expect(refundPayload).toBeDefined();
    expect(refundPayload!.href).toBe("/company");
    expect(refundPayload!.recipient?.email).toBe(email);
    expect(refundPayload!.campaignRefund).toMatchObject({
      campaignName: "E2E plumbing ads",
      amount: 15000,
      currency: "USD",
      reason: "Campaign violated ad policy",
    });

    // And the refund email renders that same context — the card shows the
    // campaign, the refunded amount ($150) and the reason.
    const emailRendered = renderCampaignRefundEmail(refundPayload!, "en");
    expect(emailRendered.subject).toContain("Campaign refunded");
    expect(emailRendered.html).toContain("Refund details");
    expect(emailRendered.html).toContain("E2E plumbing ads");
    expect(emailRendered.html).toContain("$150");
    expect(emailRendered.html).toContain("Campaign violated ad policy"); // reason row
    expect(emailRendered.html).toContain("/company");

    // The refund is audited to the admin activity feed (same story as the card).
    const feed = await getAdminActivityFeed();
    expect(feed.some((e) => e.type === "payment" && e.code === "CAMPAIGN_REFUNDED")).toBe(true);
  });

  it("purchase path: create PENDING → idempotent checkout → confirm (ACTIVE + PAID + Invoice + live notification) → refund voids the minted invoice", async () => {
    const { userId: ownerId, email } = await seedCompany();
    const prisma = getPrisma();

    // 1. Create — PENDING campaign + primary creative + PENDING purchase row,
    //    and a hosted checkout minted (no ads served until confirm).
    const created = await prismaCreateCampaign({
      nameEn: "Self-serve plumbing ads",
      nameAr: "إعلانات سباكة مباشرة",
      placement: "homepage",
      adType: "banner",
      budget: 250,
      companyId: ownerId,
    });
    expect(created).not.toBeNull();
    const { campaign: c, checkoutUrl } = created!;
    expect(c.status).toBe("pending");
    expect(c.budget).toBe(250); // 25000 minor → 250 major
    expect(c.spent).toBe(0);
    expect(c.placement).toBe("homepage");
    expect(c.adType).toBe("banner");
    expect(c.impressions).toBe(0);
    expect(checkoutUrl).toContain("/api/payments/simulate");
    campaignId = c.id;

    // The read path surfaces the PENDING campaign.
    expect((await prismaGetCampaigns()).some((x) => x.id === c.id)).toBe(true);

    // The PENDING purchase row rides the same lifecycle statuses as the demo.
    const pending = await prismaGetCampaignPayment(c.id);
    expect(pending).toMatchObject({ campaignId: c.id, amount: 25000, currency: "USD", status: "pending" });
    expect(pending?.checkoutUrl).toBe(checkoutUrl);

    // 2. Checkout is idempotent per campaign (a Pay-now re-click reuses it).
    expect((await prismaCreateCampaignCheckout(c.id))?.url).toBe(checkoutUrl);

    // 3. Webhook confirm — PENDING → ACTIVE, payment → PAID, and the PAID
    //    Invoice mints (the credit-note material the refund voids).
    const confirmed = await prismaConfirmCampaignPayment(c.id, "sim_pay-c-6");
    expect(confirmed?.status).toBe("active");

    const paid = await prismaGetCampaignPayment(c.id);
    expect(paid).toMatchObject({ status: "paid", providerRef: "sim_pay-c-6" });
    expect(paid?.paidAt).toBeTruthy();

    const purchase = await prisma.payment.findFirst({
      where: { advertisementId: c.id },
      include: { invoice: true },
    });
    expect(purchase?.invoice).toMatchObject({ status: "PAID", amount: 25000 });
    expect(purchase?.invoice?.number).toMatch(/^WA-\d{4}-\d{5}$/);
    invoiceId = purchase?.invoice?.id ?? null;

    // The company is notified — the same "Campaign is live" payload the demo
    // adapter dispatches, addressed to the company's user row.
    const live = dispatched.find((p) => p.type === "campaign");
    expect(live).toBeDefined();
    expect(live!.href).toBe("/company");
    expect(live!.recipient?.email).toBe(email);
    expect(live!.titleEn).toBe("Campaign is live");

    // 4. Idempotent redelivery — the already-active campaign no-ops: no second
    //    invoice, no second notification.
    dispatched.length = 0;
    await prismaConfirmCampaignPayment(c.id, "sim_pay-c-6");
    expect(dispatched.find((p) => p.type === "campaign")).toBeUndefined();
    const invCount = await prisma.invoice.count({ where: { paymentId: purchase!.id } });
    expect(invCount).toBe(1);

    // 5. Refund — the credit-note flip voids the invoice the confirm minted.
    const refunded = await prismaRefundCampaignPayment(c.id, {
      by: "Platform Admin",
      reason: "Duplicate purchase",
    });
    expect(refunded?.status).toBe("refunded");
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId! } });
    expect(inv?.status).toBe("VOID");
  });

  it("refunds nothing for a non-paid payment (no notification dispatched)", async () => {
    const { campaignId: cid } = await seedPaidCampaign();
    const prisma = getPrisma();
    // Flip the purchase to PENDING — nothing refundable.
    await prisma.payment.updateMany({
      where: { advertisementId: cid },
      data: { status: "PENDING", paidAt: null },
    });
    const refundSpy = vi.spyOn(simulatedProvider, "refund");

    expect(await prismaRefundCampaignPayment(cid, { by: "Platform Admin", reason: "test" })).toBeNull();
    expect(refundSpy).not.toHaveBeenCalled();
    expect(dispatched.find((p) => p.type === "campaignRefunded")).toBeUndefined();
  });

  it("is idempotent — a second refund no-ops", async () => {
    const { campaignId: cid } = await seedPaidCampaign();
    await prismaRefundCampaignPayment(cid, { by: "Platform Admin", reason: "Duplicate purchase" });
    dispatched.length = 0;
    const refundSpy = vi.spyOn(simulatedProvider, "refund");

    expect(await prismaRefundCampaignPayment(cid, { by: "Platform Admin", reason: "again" })).toBeNull();
    expect(refundSpy).not.toHaveBeenCalled();
    expect(dispatched.find((p) => p.type === "campaignRefunded")).toBeUndefined();
  });

  it("rotation serves the ACTIVE campaign (untargeted always matches), tracks impressions/clicks, and stops once refunded", async () => {
    const { campaignId: cid } = await seedPaidCampaign();

    // The ACTIVE banner (placement "homepage") rotates — a plain homepage
    // request AND a targeted request both serve it (untargeted ads always
    // match, the demo's targetCategories gate), while other placements don't.
    expect((await prismaGetActiveAdsFor("homepage")).some((c) => c.id === cid)).toBe(true);
    expect(
      (await prismaGetActiveAdsFor("homepage", { category: "plumbing" })).some((c) => c.id === cid)
    ).toBe(true);
    expect((await prismaGetActiveAdsFor("featured")).some((c) => c.id === cid)).toBe(false);

    // Tracking — an impression bumps the served creative + the campaign spend
    // (demo parity: +1 minor per impression, +100 per click, same CTR formula).
    const afterImpression = await prismaRecordImpression(cid);
    expect(afterImpression?.impressions).toBe(11); // seeded 10 + 1
    expect(afterImpression?.spent).toBe(0.01); // 1 minor → 0.01 major
    const afterClick = await prismaRecordClick(cid);
    expect(afterClick?.clicks).toBe(2); // seeded 1 + 1
    expect(afterClick?.spent).toBe(1.01); // (1 + 100) minor → 1.01 major
    expect(afterClick?.ctr).toBe(18.18); // 2/11 → 18.18%
    const ad = await getPrisma().advertisement.findFirst({ where: { campaignId: cid } });
    expect(ad?.impressions).toBe(11);
    expect(ad?.clicks).toBe(2);
    expect(ad?.ctr).toBe(18.18);

    // Refund → the campaign stops serving (rotation only matches ACTIVE).
    await prismaRefundCampaignPayment(cid, { by: "Platform Admin", reason: "test" });
    expect((await prismaGetActiveAdsFor("homepage")).some((c) => c.id === cid)).toBe(false);
  });

  it("prismaGetInvoices renders the seeded company's real Invoice rows (scope + status + major amounts, newest first)", async () => {
    // The seed creates BuildCo Ltd + its INV-1045/46/47 advertising invoices
    // (prisma/seed.ts — the W2 boundary) — real rows the /company page now
    // renders in real mode. Requires a current seed (npm run db:seed).
    const invoices = await prismaGetInvoices();
    const seeded = invoices.filter((i) => i.number.startsWith("INV-"));
    expect(seeded.length).toBeGreaterThanOrEqual(3);

    const inv1045 = seeded.find((i) => i.number === "INV-1045");
    expect(inv1045).toMatchObject({
      scope: "advertising",
      status: "paid",
      amount: 5000, // 500000 minor → 5000 major
      currency: "USD",
      campaignId: "seed-c1",
    });
    expect(inv1045?.descriptionEn).toContain("Villa construction");
    expect(inv1045?.descriptionAr).toContain("بناء فيلا");

    const inv1047 = seeded.find((i) => i.number === "INV-1047");
    expect(inv1047?.status).toBe("pending");
    expect(inv1047?.amount).toBe(2500);

    // Newest first (createdAt pinned to each campaign's start in the seed).
    expect(seeded.map((i) => i.number)).toEqual(["INV-1047", "INV-1046", "INV-1045"]);
  });
});
