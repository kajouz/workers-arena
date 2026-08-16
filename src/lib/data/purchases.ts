/**
 * ────────────────────────────────────────────────────────────────────────────
 * PAID UPGRADES — DEMO ADAPTER (docs/BUSINESS-MODEL.md §5.1, revenue first,
 * no Stripe: the Lebanon launch collects via the OMT/Whish MANUAL methods)
 * ────────────────────────────────────────────────────────────────────────────
 * The revenue levers that need no gateway keys: a worker buys a capability —
 * a subscription renewal, a paid verification tier (Basic ID / Professional
 * license+background), the Featured slot add-on, or the Emergency marker —
 * the purchase mints an OMT/Whish manual checkout (signed instructions URL),
 * the worker pays offline with the reference, and an ADMIN confirms receipt
 * from the /admin pending-payments card (confirmManualPaymentAction →
 * confirmPurchase), which flips the purchased capability live.
 *
 * The store lives on globalThis (same rationale as the campaign store: the
 * server action that creates the purchase, the instructions page and the
 * admin confirm run in different Turbopack entry graphs and must share one
 * home). Real mode persists Payment rows via the prisma adapters
 * (prisma-repo.ts → prismaCreate*Purchase / prismaConfirm*Purchase).
 * ────────────────────────────────────────────────────────────────────────────
 */
import { workerBySlug } from "./workers";
import { pushNotification } from "./notifications";
import { getPaymentProvider } from "@/lib/payments/registry";
import { planPrice, renewSubscription } from "./subscriptions";
import { demoAddInvoice } from "./campaigns";
import type {
  BillingPeriod,
  PendingManualPayment,
  PurchaseScope,
  SubscriptionPlan,
  Worker,
} from "./types";

/** The paid-upgrade catalog — the prices BUSINESS-MODEL.md §5.1 sketches:
 * verification Basic $9 (ID check) / Professional $19 (license + background
 * check), Featured slot $49/category/mo, Emergency marker $9/mo. Subscription
 * renewals price from PLANS via planPrice instead (annual = 10 for 12). */
export const PURCHASE_PRICES = {
  verification: { basic: 900, professional: 1900 },
  featured: 4900,
  emergency: 900,
} as const;

export type VerificationTier = "basic" | "professional";

interface DemoPurchasePayment {
  id: string;
  amount: number; // minor units
  currency: string;
  status: "pending" | "paid";
  method: "omt" | "whish";
  providerRef?: string;
  checkoutUrl?: string;
  paidAt?: string;
  createdAt: string;
  meta: {
    scope: PurchaseScope;
    workerSlug: string;
    plan?: SubscriptionPlan;
    period?: BillingPeriod;
    tier?: VerificationTier;
    kind?: "featured" | "emergency";
  };
}

type PurchaseStore = {
  seq: number;
  payments: Map<string, DemoPurchasePayment>;
};

const GLOBAL_KEY = "__workersArenaDemoPurchaseStore";
const g = globalThis as Record<string, unknown>;
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;
const STORE: PurchaseStore =
  (g[GLOBAL_KEY] as PurchaseStore | undefined) ??
  (g[GLOBAL_KEY] = { seq: 0, payments: new Map() } as PurchaseStore);

if (FIRST_INSTANCE) {
  STORE.seq = 0;
  STORE.payments.clear();
}

/** Reset the demo purchase store to its seeded state (tests). */
export function resetPurchaseStore(): void {
  STORE.seq = 0;
  STORE.payments.clear();
}

function purchaseDescription(
  scope: PurchaseScope,
  w: Worker,
  opts: { plan?: SubscriptionPlan; period?: BillingPeriod; tier?: VerificationTier; kind?: "featured" | "emergency" }
): { en: string; ar: string } {
  switch (scope) {
    case "subscription":
      return {
        en: `${w.nameEn} — ${opts.plan} subscription renewal (${opts.period ?? "monthly"})`,
        ar: `${w.nameAr} — تجديد اشتراك ${opts.plan} (${opts.period ?? "monthly"})`,
      };
    case "verification":
      return {
        en: `${w.nameEn} — ${opts.tier === "professional" ? "Professional" : "Basic"} verification`,
        ar: `${w.nameAr} — توثيق ${opts.tier === "professional" ? "احترافي" : "أساسي"}`,
      };
    case "featured":
      return { en: `${w.nameEn} — Featured slot`, ar: `${w.nameAr} — بطاقة مميزة` };
    case "emergency":
      return { en: `${w.nameEn} — Emergency marker`, ar: `${w.nameAr} — علامة طوارئ` };
  }
}

function purchaseAmount(scope: PurchaseScope, opts: { plan?: SubscriptionPlan; period?: BillingPeriod; tier?: VerificationTier }): number | null {
  if (scope === "subscription") return opts.plan ? planPrice(opts.plan, opts.period ?? "monthly") * 100 : null;
  if (scope === "verification") return opts.tier ? PURCHASE_PRICES.verification[opts.tier] : null;
  if (scope === "featured") return PURCHASE_PRICES.featured;
  if (scope === "emergency") return PURCHASE_PRICES.emergency;
  return null;
}

/**
 * Mint a manual (OMT/Whish) checkout for a paid upgrade. The payment starts
 * PENDING; the capability flips only when an admin confirms receipt
 * (confirmPurchase). Returns the signed instructions URL, or null when the
 * worker is unknown or the option is invalid.
 */
export async function demoCreatePurchaseCheckout(
  input: {
    workerSlug: string;
    scope: PurchaseScope;
    plan?: SubscriptionPlan;
    period?: BillingPeriod;
    tier?: VerificationTier;
    method: "OMT" | "WHISH";
  }
): Promise<{ url: string } | null> {
  const w = workerBySlug(input.workerSlug);
  if (!w) return null;
  const amount = purchaseAmount(input.scope, input);
  if (amount === null) return null;

  STORE.seq += 1;
  const id = `pay-pur-${STORE.seq}`;
  const desc = purchaseDescription(input.scope, w, input);
  const payment: DemoPurchasePayment = {
    id,
    amount,
    currency: "USD",
    status: "pending",
    method: input.method === "OMT" ? "omt" : "whish",
    createdAt: new Date().toISOString(),
    meta: {
      scope: input.scope,
      workerSlug: input.workerSlug,
      plan: input.plan,
      period: input.period,
      tier: input.tier,
      kind: input.scope === "featured" || input.scope === "emergency" ? input.scope : undefined,
    },
  };
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const result = await getPaymentProvider(input.method).createCheckout({
    paymentId: id,
    amountMinor: amount,
    currency: "USD",
    customerEmail: w.email,
    description: desc.en,
    successUrl: `${base}/dashboard?purchased=1`,
    cancelUrl: `${base}/dashboard`,
  });
  payment.providerRef = result.providerRef;
  payment.checkoutUrl = result.url;
  STORE.payments.set(id, payment);
  return { url: result.url };
}

/**
 * Admin confirm — the manual twin of a provider webhook: the customer paid
 * offline with the reference, the admin's confirm flips the payment PAID and
 * activates the purchased capability. Idempotent (a second confirm no-ops).
 */
export async function demoConfirmPurchase(paymentId: string, providerRef: string): Promise<boolean> {
  const payment = STORE.payments.get(paymentId);
  if (!payment) return false;
  if (payment.status === "paid") return true; // idempotent
  const w = workerBySlug(payment.meta.workerSlug);
  if (!w) return false;

  payment.status = "paid";
  payment.providerRef = providerRef;
  payment.paidAt = new Date().toISOString();

  switch (payment.meta.scope) {
    case "subscription": {
      const plan = payment.meta.plan ?? "professional";
      const period = payment.meta.period ?? "monthly";
      const { subscription, invoice } = renewSubscription(w, plan, period);
      demoAddInvoice(invoice);
      await pushNotification(
        {
          type: "subscription",
          titleEn: `Subscription renewed — ${plan}`,
          titleAr: `تم تجديد الاشتراك — ${plan}`,
          bodyEn: `${w.nameEn}: your ${plan} plan is active until ${new Date(subscription.expiresAt).toLocaleDateString()}.`,
          bodyAr: `${w.nameAr}: خطتك ${plan} نشطة حتى ${new Date(subscription.expiresAt).toLocaleDateString()}.`,
          href: "/dashboard",
        },
        { name: w.nameEn, email: w.email, phone: w.phone, locale: w.languages[0]?.code === "ar" ? "ar" : "en" }
      );
      break;
    }
    case "verification": {
      w.verified = true;
      w.verification = "verified";
      await pushNotification(
        {
          type: "verification",
          titleEn: "Profile verified ✓",
          titleAr: "تم توثيق الملف ✓",
          bodyEn: `${w.nameEn}: your profile now shows the Verified badge.`,
          bodyAr: `${w.nameAr}: ملفك يعرض الآن شارة التوثيق.`,
          href: "/dashboard",
        },
        { name: w.nameEn, email: w.email, phone: w.phone, locale: w.languages[0]?.code === "ar" ? "ar" : "en" }
      );
      break;
    }
    case "featured": {
      w.featured = true;
      await pushNotification(
        {
          type: "system",
          titleEn: "Featured slot active",
          titleAr: "البطاقة المميزة نشطة",
          bodyEn: `${w.nameEn}: your profile is featured on the homepage for 30 days.`,
          bodyAr: `${w.nameAr}: ملفك مميز في الصفحة الرئيسية لمدة 30 يومًا.`,
          href: "/dashboard",
        },
        { name: w.nameEn, email: w.email, phone: w.phone, locale: w.languages[0]?.code === "ar" ? "ar" : "en" }
      );
      break;
    }
    case "emergency": {
      w.emergency = true;
      await pushNotification(
        {
          type: "system",
          titleEn: "Emergency marker active",
          titleAr: "علامة الطوارئ نشطة",
          bodyEn: `${w.nameEn}: customers can now book you for urgent 24/7 jobs.`,
          bodyAr: `${w.nameAr}: يمكن للعملاء الآن حجزك للطوارئ على مدار الساعة.`,
          href: "/dashboard",
        },
        { name: w.nameEn, email: w.email, phone: w.phone, locale: w.languages[0]?.code === "ar" ? "ar" : "en" }
      );
      break;
    }
  }
  return true;
}

/** A purchase payment by id (admin confirm resolution). */
export function demoPurchasePayment(paymentId: string): DemoPurchasePayment | null {
  return STORE.payments.get(paymentId) ?? null;
}

/** Every PENDING manual (OMT/Whish) purchase awaiting admin confirmation. */
export function demoPendingManualPurchases(): PendingManualPayment[] {
  const out: PendingManualPayment[] = [];
  for (const payment of STORE.payments.values()) {
    if (payment.status !== "pending" || !payment.providerRef) continue;
    const w = workerBySlug(payment.meta.workerSlug);
    if (!w) continue;
    const desc = purchaseDescription(payment.meta.scope, w, payment.meta);
    out.push({
      id: payment.id,
      scope: payment.meta.scope,
      entityId: payment.id,
      labelEn: desc.en,
      labelAr: desc.ar,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      reference: payment.providerRef,
      createdAt: payment.createdAt,
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
