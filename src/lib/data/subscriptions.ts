import type { BillingPeriod, Invoice, Subscription, SubscriptionPlan, SubscriptionStatus, Worker } from "./types";

/** Subscription plan catalog — prices in USD/month. Mirrors the pricing section. */
export const PLANS: Record<SubscriptionPlan, { price: number; labelEn: string; labelAr: string; hue: number }> = {
  basic: { price: 29, labelEn: "Basic", labelAr: "أساسية", hue: 205 },
  professional: { price: 59, labelEn: "Professional", labelAr: "احترافية", hue: 150 },
  premium: { price: 119, labelEn: "Premium", labelAr: "مميزة", hue: 30 },
  enterprise: { price: 299, labelEn: "Enterprise", labelAr: "مؤسسات", hue: 265 },
};

/**
 * Annual billing — pay for 10 months, get 12 (2 months free): the annual price
 * is the monthly price × ANNUAL_PAID_MONTHS, and the term is 12 months.
 */
export const ANNUAL_PAID_MONTHS = 10;
export const ANNUAL_TERM_MONTHS = 12;

/** Price of a plan for a billing period (USD, major units). */
export function planPrice(plan: SubscriptionPlan, period: BillingPeriod = "monthly"): number {
  return period === "annual" ? PLANS[plan].price * ANNUAL_PAID_MONTHS : PLANS[plan].price;
}

/** How many months a period extends the subscription. */
export function periodMonths(period: BillingPeriod): number {
  return period === "annual" ? ANNUAL_TERM_MONTHS : 1;
}

export const REMINDER_WINDOW_DAYS = [7, 3, 1] as const;

/** Whole days between now and a future ISO date (negative when past). */
export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  // Math.round keeps partial days in the right direction: a sub that expired
  // 0.2 days ago reads as 0 (expired), not -0 (which -0 < 0 misses).
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Derive subscription status from the expiry date: expired / expiring (<8d) / active. */
export function subscriptionStatus(sub: Subscription): SubscriptionStatus {
  const days = daysUntil(sub.expiresAt);
  if (days < 0) return "expired";
  if (days <= 7) return "expiring";
  return "active";
}

/** A worker is invisible to public search while their subscription is expired. */
export function isSubscriptionActive(w: Worker): boolean {
  return subscriptionStatus(w.subscription) !== "expired";
}

/** Add N months to a date, preserving the day-of-month (clamped to month end). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

let invoiceCounter = 1048;

/** Issue a new subscription invoice (demo: sequential numbers). The monthly
 * description keeps its exact historical format; annual adds "(annual)" so the
 * doubled amount reads unambiguously on the dashboard's invoice list. */
export function issueInvoice(w: Worker, plan: SubscriptionPlan, period: BillingPeriod = "monthly"): Invoice {
  invoiceCounter += 1;
  const suffix = period === "annual" ? " (annual)" : "";
  return {
    id: `inv-${invoiceCounter}`,
    number: `INV-${invoiceCounter}`,
    scope: "subscription",
    descriptionEn: `${PLANS[plan].labelEn} subscription${suffix} — ${w.nameEn}`,
    descriptionAr: `اشتراك ${PLANS[plan].labelAr}${suffix} — ${w.nameAr}`,
    amount: planPrice(plan, period),
    currency: "USD",
    date: new Date().toISOString(),
    status: "paid",
  };
}

/**
 * Admin plan correction (docs/ENHANCEMENT-PLAN.md §2.4) — change the plan
 * tier in place. An expired subscription is REACTIVATED for one monthly
 * period so the correction takes effect in public search (an expired sub
 * hides the worker); an active one keeps its expiry. No invoice is issued —
 * it's a correction, not a purchase. Shared by both adapters.
 */
export function applyPlanChange(sub: Subscription, plan: SubscriptionPlan): Subscription {
  const expired = subscriptionStatus(sub) === "expired";
  const next: Subscription = {
    ...sub,
    plan,
    price: planPrice(plan),
    status: "active",
  };
  if (expired) {
    next.startedAt = new Date().toISOString();
    next.expiresAt = addMonths(new Date().toISOString(), periodMonths("monthly"));
  }
  return next;
}

/**
 * Renew (or switch) a worker's subscription, extending from today +1 month
 * (monthly) or +12 months (annual — 2 months free). The term + price follow
 * the billing period, and the period is stamped on the subscription so the
 * dashboard renders the right unit (/month vs /year).
 */
export function renewSubscription(
  w: Worker,
  plan: SubscriptionPlan,
  period: BillingPeriod = "monthly"
): { subscription: Subscription; invoice: Invoice } {
  const invoice = issueInvoice(w, plan, period);
  const subscription: Subscription = {
    plan,
    status: "active",
    startedAt: new Date().toISOString(),
    expiresAt: addMonths(new Date().toISOString(), periodMonths(period)),
    price: planPrice(plan, period),
    invoiceNo: invoice.number,
    period,
  };
  w.subscription = subscription;
  return { subscription, invoice };
}

/** Which reminder (7/3/1 day) a worker is due for, if any — used by the engine. */
export function dueReminderWindow(sub: Subscription): (typeof REMINDER_WINDOW_DAYS)[number] | null {
  if (subscriptionStatus(sub) === "expired") return null;
  const days = daysUntil(sub.expiresAt);
  for (const w of REMINDER_WINDOW_DAYS) {
    if (days === w) return w;
  }
  return null;
}
