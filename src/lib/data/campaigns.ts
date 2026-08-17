import { pushNotification } from "./notifications";
import { campaignRefundNotification } from "./campaign-notifications";
import { ACTION_CODES, logAdminActivity } from "./activity";
import { getPaymentProvider } from "@/lib/payments/registry";
import type { Campaign, CampaignPayment, Invoice, PendingManualPayment } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * AD CAMPAIGNS — DEMO ADAPTER (self-serve purchasing)
 * ────────────────────────────────────────────────────────────────────────────
 * In-memory implementation of the campaign seam (docs/PAYMENTS.md → ad
 * purchases). Mirrors the pattern of src/lib/data/bookings.ts:
 *
 *   • createCampaign mints a PENDING campaign + a PENDING payment + a PENDING
 *     invoice, then a hosted checkout via the payment-provider seam. The
 *     campaign does NOT serve ads until the webhook confirms the payment —
 *     flipping it to ACTIVE (getActiveAdsFor only matches ACTIVE campaigns).
 *   • confirmCampaignPayment is the webhook/callback confirm: PENDING → ACTIVE,
 *     payment → PAID, invoice → paid, company notified. Idempotent, so a
 *     duplicate webhook delivery is harmless.
 *   • createCampaignCheckout re-mints an idempotent checkout for the "Pay
 *     now" button (a company that abandoned the first checkout can resume).
 *
 * The store lives on globalThis (same rationale as the booking store):
 * Turbopack dev loads a module once PER ENTRY GRAPH, so the campaign created
 * by the server action (graph A) must be found + flipped by the payment
 * webhook/simulate API route (graph B) and re-read by the /company page
 * (graph C) — one shared home makes all three agree.
 *
 * Campaigns are prisma-backed in real mode (DEMO_MODE=false): reads
 * (prismaGetCampaigns), the purchase path (prismaCreateCampaign /
 * prismaCreateCampaignCheckout / prismaConfirmCampaignPayment) and the admin
 * refund (prismaRefundCampaignPayment) run against AdCampaign +
 * Payment.advertisementId rows; this demo adapter serves demo mode. Ad
 * rotation (getActiveAdsFor) and the /company invoices list (getInvoices)
 * stay demo-store until their wave lands.
 * ────────────────────────────────────────────────────────────────────────────
 */

type CampaignStore = {
  /** Next campaign id — the 5 seeds are c1..c5. */
  campaignCounter: number;
  campaigns: Campaign[];
  /** Demo invoices (advertising + subscription renewals), newest first. */
  invoices: Invoice[];
  /** Next ad-invoice number (subscription invoices number via subscriptions.ts). */
  invoiceCounter: number;
  /** Campaign purchases keyed by campaign id. */
  payments: Map<string, CampaignPayment>;
};

const GLOBAL_KEY = "__workersArenaDemoCampaignStore";
const g = globalThis as Record<string, unknown>;

/** True only for the first module instance in this process — the only one
 * that seeds; later instances (Turbopack entry graphs in dev) must adopt the
 * existing store instead of resetting it. */
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;

/** The demo campaign store — see the module docblock for why it's globalThis. */
const STORE: CampaignStore =
  (g[GLOBAL_KEY] as CampaignStore | undefined) ??
  (g[GLOBAL_KEY] = {
    campaignCounter: 5,
    campaigns: [],
    invoices: [],
    invoiceCounter: 1047,
    payments: new Map(),
  } as CampaignStore);

function seed(): void {
  STORE.campaignCounter = 5;
  STORE.invoiceCounter = 1047;
  STORE.campaigns.length = 0;
  STORE.invoices.length = 0;
  STORE.payments.clear();

  STORE.campaigns.push(
    { id: "c1", nameEn: "Villa construction — Riyadh", nameAr: "بناء فيلا — الرياض", placement: "Homepage · Banner", adType: "banner", impressions: 48210, clicks: 1284, ctr: 2.66, budget: 5000, spent: 3120, status: "active", created: "2026-03-02T00:00:00.000Z" },
    { id: "c2", nameEn: "AC maintenance — Jeddah & Riyadh", nameAr: "صيانة مكيفات — جدة والرياض", placement: "Sponsored search", adType: "sponsoredSearch", impressions: 35640, clicks: 1487, ctr: 4.17, budget: 4000, spent: 4010, status: "active", created: "2026-04-11T00:00:00.000Z" },
    { id: "c3", nameEn: "Deep cleaning — Dubai Marina", nameAr: "تنظيف عميق — مرسى دبي", placement: "Category · Cleaning", adType: "sponsoredCategory", impressions: 21450, clicks: 690, ctr: 3.22, budget: 2500, spent: 1890, status: "active", created: "2026-05-06T00:00:00.000Z" },
    { id: "c4", nameEn: "Interior design showcase", nameAr: "عرض تصميم داخلي", placement: "Featured cards", adType: "featuredCard", impressions: 18920, clicks: 511, ctr: 2.7, budget: 3000, spent: 3000, status: "paused", created: "2026-01-20T00:00:00.000Z" },
    { id: "c5", nameEn: "Pest control promo", nameAr: "عرض مكافحة الحشرات", placement: "Popup · Homepage", adType: "popup", impressions: 29300, clicks: 902, ctr: 3.08, budget: 1800, spent: 1800, status: "ended", created: "2025-12-01T00:00:00.000Z" }
  );
  STORE.invoices.push(
    { id: "i1", number: "INV-1045", scope: "advertising", descriptionEn: "Banner campaign — Villa construction", descriptionAr: "حملة لافتة — بناء فيلا", amount: 3120, currency: "USD", date: "2026-07-02T00:00:00.000Z", status: "paid" },
    { id: "i2", number: "INV-1046", scope: "advertising", descriptionEn: "Sponsored search — AC maintenance", descriptionAr: "رعاية بحث — صيانة مكيفات", amount: 2500, currency: "USD", date: "2026-07-12T00:00:00.000Z", status: "paid" },
    { id: "i3", number: "INV-1047", scope: "advertising", descriptionEn: "Category sponsorship — Cleaning", descriptionAr: "رعاية تصنيف — تنظيف", amount: 1890, currency: "USD", date: "2026-07-19T00:00:00.000Z", status: "pending" }
  );
}

// Seed once per process — a later module instance (another Turbopack entry
// graph in dev) must find the store already populated, not reset it.
if (FIRST_INSTANCE) {
  seed();
}

/** Reset the demo store to its seeded state (used by tests). */
export function resetCampaignStore(): void {
  seed();
}

/** The demo company the campaign notifications are addressed to — mirrors the
 * demo company session (src/lib/auth-demo.ts → u-company / ads@buildco.sa). */
const COMPANY = { name: "BuildCo Ltd", email: "ads@buildco.sa" };

/**
 * The company the refund notification is addressed to (demo adapter): the
 * demo company constant — mirrors how the prisma adapter resolves the
 * company's user row from the AdCampaign. Used by the admin preview to show
 * the recipient line exactly as dispatched.
 */
export function demoCampaignRecipient(): { name: string; email: string } {
  return { ...COMPANY };
}

/** Campaign creation input (the server action's zod schema feeds this). */
export interface CampaignCreateInput {
  nameEn: string;
  nameAr: string;
  placement: string;
  adType: Campaign["adType"];
  budget: number; // major units (USD) — the checkout charges budget × 100 minor
  targetCategories?: string[];
  targetCities?: string[];
  /**
   * The acting company's USER id (Company.userId is unique) — real mode
   * resolves the Company row from it (prismaCreateCampaign); the demo adapter
   * ignores it (single fixed demo company). The server action passes
   * session.id.
   */
  companyId?: string;
}

/* ─────────────────────────────── Reads ─────────────────────────────── */

export function demoGetCampaigns(): Campaign[] {
  return [...STORE.campaigns].sort((a, b) => b.created.localeCompare(a.created));
}

/** All demo invoices (advertising + subscription renewals), newest first. */
export function demoGetInvoices(): Invoice[] {
  return STORE.invoices;
}

export function demoGetCampaignById(id: string): Campaign | null {
  return STORE.campaigns.find((c) => c.id === id) ?? null;
}

/** A campaign's purchase row, if one exists. */
export function demoCampaignPayment(campaignId: string): CampaignPayment | null {
  return STORE.payments.get(campaignId) ?? null;
}

/**
 * Ad rotation: ACTIVE campaigns matching a placement, newest-first. A
 * PENDING campaign (created but unpaid) never serves ads — this is the
 * payment gate the checkout enforces.
 */
export function demoGetActiveAdsFor(
  placement: string,
  opts: { category?: string; city?: string } = {}
): Campaign[] {
  const cat = opts.category;
  const city = opts.city;
  return STORE.campaigns
    .filter((c) => {
      if (c.status !== "active") return false;
      const placements = placement.split("|");
      const placementMatch = placements.some((p) => c.placement.toLowerCase().includes(p.toLowerCase()));
      if (!placementMatch) return false;
      if (cat && c.targetCategories?.length && !c.targetCategories.includes(cat)) return false;
      if (city && c.targetCities?.length && !c.targetCities.includes(city)) return false;
      return true;
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

/* ─────────────────────────────── Mutations ─────────────────────────────── */

/**
 * Create a campaign (company dashboard). The campaign starts PENDING — it
 * does not serve ads until the payment webhook confirms (see
 * confirmCampaignPayment). A Payment row + a PENDING advertising invoice are
 * minted alongside, and a hosted checkout URL is returned for the company to
 * pay. Returns null when the checkout could not be minted.
 */
export async function demoCreateCampaign(
  input: CampaignCreateInput
): Promise<{ campaign: Campaign; checkoutUrl: string } | null> {
  STORE.campaignCounter += 1;
  const campaign: Campaign = {
    id: `c-${STORE.campaignCounter}`,
    nameEn: input.nameEn,
    nameAr: input.nameAr,
    placement: input.placement,
    adType: input.adType,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    budget: input.budget,
    spent: 0,
    status: "pending",
    targetCategories: input.targetCategories,
    targetCities: input.targetCities,
    created: new Date().toISOString(),
  };
  STORE.campaigns.push(campaign);

  // The purchase row — amount in minor units (the provider seam's contract:
  // Stripe unit_amount etc.). NOTE the deliberate asymmetry: the Payment is
  // minor (budget × 100) while the campaign's INV-* invoice below stays in
  // major units (the pre-existing INV-* convention) — don't "fix" one to
  // match the other without also updating the invoice rendering.
  const payment: CampaignPayment = {
    id: `pay-${campaign.id}`,
    campaignId: campaign.id,
    amount: Math.round(input.budget * 100),
    currency: "USD",
    status: "pending",
  };
  STORE.payments.set(campaign.id, payment);

  STORE.invoiceCounter += 1;
  const invoice: Invoice = {
    id: `i-${STORE.invoiceCounter}`,
    number: `INV-${STORE.invoiceCounter}`,
    scope: "advertising",
    descriptionEn: `${input.nameEn} — ${input.placement}`,
    descriptionAr: `${input.nameAr} — ${input.placement}`,
    amount: input.budget,
    currency: "USD",
    date: new Date().toISOString(),
    status: "pending",
    campaignId: campaign.id,
  };
  STORE.invoices.unshift(invoice);

  // Mint the hosted checkout. A provider failure (e.g. Stripe API error) is
  // caught so the ACTION can return { error: "checkout" } instead of 500ing
  // with the campaign stuck mid-create. The PENDING campaign + payment +
  // invoice rows stay behind on purpose — the "Pay now" button (idempotent
  // re-mint) makes them recoverable once the provider is back.
  try {
    const checkout = await demoCreateCampaignCheckout(campaign.id);
    if (!checkout) return null;
    return { campaign, checkoutUrl: checkout.url };
  } catch {
    return null;
  }
}

/**
 * Mint (or re-mint) the hosted checkout for a PENDING campaign — the "Pay
 * now" path. Idempotent per campaign: a re-click returns the already-minted
 * URL. A provider failure returns null (the caller surfaces "checkout").
 * Returns null for unknown campaigns or ones not awaiting payment.
 */
export async function demoCreateCampaignCheckout(
  campaignId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "STRIPE"
): Promise<{ url: string } | null> {
  const campaign = demoGetCampaignById(campaignId);
  const payment = STORE.payments.get(campaignId);
  if (!campaign || campaign.status !== "pending" || !payment) return null;
  // Idempotent for the SAME method — but a method switch (e.g. the customer
  // picks Whish after the create-time STRIPE pre-mint) re-mints instead of
  // returning the stale simulate URL.
  const requestedMethod = method === "OMT" ? "omt" : method === "WHISH" ? "whish" : "stripe";
  if (payment.providerRef && payment.checkoutUrl && payment.method === requestedMethod) {
    return { url: payment.checkoutUrl };
  }
  // The customer's chosen method is stamped on the Payment row at mint time
  // (the /admin pending-payments card + the campaign payment table read it).
  payment.method = method === "OMT" ? "omt" : method === "WHISH" ? "whish" : "stripe";

  const base = typeof window === "undefined" ? "" : window.location.origin;
  let result: { url: string; providerRef: string };
  try {
    result = await getPaymentProvider(method).createCheckout({
      paymentId: payment.id,
      campaignId: campaign.id,
      amountMinor: payment.amount,
      currency: payment.currency,
      customerEmail: COMPANY.email,
      description: `${campaign.nameEn} — ${campaign.placement}`,
      successUrl: `${base}/company?paid=1`,
      cancelUrl: `${base}/company`,
    });
  } catch {
    return null;
  }
  payment.providerRef = result.providerRef;
  payment.checkoutUrl = result.url;
  return { url: result.url };
}

/**
 * The webhook/checkout callback landed: the campaign purchase is paid.
 * PENDING → ACTIVE (it starts serving ads), payment → PAID, the campaign's
 * invoice → paid, and the company is notified. Idempotent — a provider
 * redelivery returns the already-active campaign without re-notifying.
 */
export async function demoConfirmCampaignPayment(
  campaignId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<Campaign | null> {
  const campaign = demoGetCampaignById(campaignId);
  const payment = STORE.payments.get(campaignId);
  // Already confirmed by an earlier webhook delivery — no-op success.
  if (campaign?.status === "active" && payment?.status === "paid") return campaign;
  if (!campaign || campaign.status !== "pending" || !payment) return null;

  campaign.status = "active";
  payment.status = "paid";
  payment.providerRef = providerRef;
  payment.paidAt = new Date().toISOString();

  const invoice = STORE.invoices.find((i) => i.campaignId === campaignId);
  if (invoice && invoice.status === "pending") {
    invoice.status = "paid";
  }

  // §Lebanon — audit the manual (OMT/Whish) campaign confirm with the ACTING
  // ADMIN as actor (the /admin pending-payments confirm threads it through
  // opts.by), mirroring the booking deposit's BOOKING_CONFIRMED entry so all
  // three manual scopes show up in the feed. Webhook-simulated confirms fall
  // back to "Platform Admin" — the same default the refund uses.
  const actor = opts.by ?? "Platform Admin";
  await logAdminActivity({
    code: ACTION_CODES.CAMPAIGN_PAID,
    actionEn: `${actor} confirmed campaign ${campaign.nameEn} (${payment.id})`,
    actionAr: `${actor} أكّد دفع حملة ${campaign.nameAr} (${payment.id})`,
    actor,
    ...(opts.byId ? { actorId: opts.byId } : {}),
    type: "payment",
  });

  await pushNotification(
    {
      type: "campaign",
      titleEn: "Campaign is live",
      titleAr: "الحملة نشطة الآن",
      bodyEn: `${campaign.nameEn} is now running — ads are being served across your placements.`,
      bodyAr: `${campaign.nameAr} تعمل الآن — يتم عرض الإعلانات في المواضع المحددة.`,
      href: "/company",
    },
    COMPANY
  );
  return campaign;
}

/**
 * §Lebanon — every PENDING campaign purchase whose checkout was minted with a
 * MANUAL method (OMT/Whish): the customer paid offline with the reference,
 * and the /admin pending-payments card lists these for the admin's confirm.
 * Demo adapter — mirrors prismaGetPendingManualPayments in real mode.
 */
export function demoPendingManualCampaignPayments(): PendingManualPayment[] {
  const out: PendingManualPayment[] = [];
  for (const [campaignId, payment] of STORE.payments) {
    if (payment.status !== "pending") continue;
    if (payment.method !== "omt" && payment.method !== "whish") continue;
    if (!payment.providerRef) continue;
    const campaign = demoGetCampaignById(campaignId);
    if (!campaign) continue;
    out.push({
      id: payment.id,
      scope: "campaign",
      entityId: campaignId,
      labelEn: `${campaign.nameEn} (${campaign.placement})`,
      labelAr: `${campaign.nameAr} (${campaign.placement})`,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      reference: payment.providerRef,
      createdAt: campaign.created,
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Admin side: refund a campaign purchase (the /admin campaign-payments card).
 * Only a PAID payment is refundable: the provider charge is refunded, the
 * payment flips to REFUNDED, and the campaign stops serving (status → ended —
 * there is no "refunded" campaign status; ended is the terminal state). The
 * refund is audited to the admin activity feed (type "payment", code
 * CAMPAIGN_REFUNDED) — carrying the admin-stated `reason` (see
 * refundCampaignAction) in the payment row AND the feed entry, so the table
 * tooltip and the activity feed tell the same story. Idempotent: a second
 * refund of the same payment no-ops. Returns the updated payment, or null
 * when nothing was refundable.
 */
export async function demoRefundCampaignPayment(
  campaignId: string,
  opts: { by?: string; reason?: string } = {}
): Promise<CampaignPayment | null> {
  const campaign = demoGetCampaignById(campaignId);
  const payment = STORE.payments.get(campaignId);
  if (!payment || payment.status !== "paid") return null;

  await getPaymentProvider(payment.method === "omt" ? "OMT" : payment.method === "whish" ? "WHISH" : "STRIPE")
    .refund(payment.providerRef ?? payment.id, payment.amount);
  payment.status = "refunded";
  payment.refundedAt = new Date().toISOString();
  // Trim once here (not just in the action) so direct seam callers can't
  // store stray whitespace in the payment row or the feed entry.
  const reason = opts.reason?.trim();
  payment.refundReason = reason || undefined;
  if (campaign && campaign.status === "active") {
    campaign.status = "ended";
  }
  // Credit note — a paid advertising invoice for this campaign flips to
  // "refunded" so the company invoices list shows the refunded amount instead
  // of a stale "paid" row (the refunded amount IS the invoice amount). Only
  // purchase-minted invoices carry campaignId; the seeded INV-* rows stay put.
  const invoice = STORE.invoices.find((i) => i.campaignId === campaignId);
  if (invoice && invoice.status === "paid") {
    invoice.status = "refunded";
  }

  const actor = opts.by ?? "Platform Admin";
  const reasonSuffix = reason ? ` — ${reason}` : "";
  await logAdminActivity({
    code: ACTION_CODES.CAMPAIGN_REFUNDED,
    actionEn: `${actor} refunded ${campaign?.nameEn ?? campaignId} (${payment.id})${reasonSuffix}`,
    actionAr: `${actor} استردّ مبلغ حملة ${campaign?.nameAr ?? campaignId} (${payment.id})${reasonSuffix}`,
    actor,
    type: "payment",
  });

  // Notify the company: the purchase was refunded, with the amount and the
  // admin-stated reason — the SAME campaignRefunded payload the prisma adapter
  // dispatches (shared campaignRefundNotification builder), so the /admin
  // preview renders exactly what the company received. The builder's body
  // rounds the amount the same way the email card does (no inbox/email drift).
  // Fallback name when the campaign row is gone is the campaign id — body and
  // card agree (both read campaignId), keeping demo/prisma copy identical.
  await pushNotification(
    campaignRefundNotification(campaign ?? { nameEn: campaignId, nameAr: campaignId }, payment),
    COMPANY
  );
  return payment;
}

/** Track a served impression (ad rotation). Returns the updated campaign. */
export function demoRecordImpression(campaignId: string): Campaign | null {
  const c = demoGetCampaignById(campaignId);
  if (!c) return null;
  c.impressions += 1;
  c.spent = Math.min(c.budget, c.spent + 0.01);
  c.ctr = c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0;
  return c;
}

/** Track a click. Returns the updated campaign. */
export function demoRecordClick(campaignId: string): Campaign | null {
  const c = demoGetCampaignById(campaignId);
  if (!c) return null;
  c.clicks += 1;
  c.spent = Math.min(c.budget, c.spent + 1);
  c.ctr = c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0;
  return c;
}

/** Append an invoice to the shared list (subscription renewals, newest first). */
export function demoAddInvoice(invoice: Invoice): void {
  STORE.invoices.unshift(invoice);
}
