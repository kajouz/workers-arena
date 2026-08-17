"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import {
  changeWorkerPlan,
  confirmBookingPayment,
  confirmCampaignPayment,
  confirmPurchase,
  createCampaign,
  createCampaignCheckout,
  createPurchaseCheckout,
  decideVerification,
  getPendingManualPayments,
  refundCampaignPayment,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  renewWorkerSubscriptionBySlug,
  submitVerificationRequest,
} from "@/lib/data/repo";
import type { Campaign } from "@/lib/data/types";

const AD_TYPES = ["banner", "slider", "featuredCard", "sponsoredSearch", "sponsoredCategory", "popup", "native", "video"] as const;

const campaignSchema = z.object({
  nameEn: z.string().min(3, "nameEn"),
  nameAr: z.string().min(3, "nameAr"),
  placement: z.string().min(2, "placement"),
  adType: z.enum(AD_TYPES),
  budget: z.coerce.number().min(50, "budget").max(100000),
  targetCategories: z.array(z.string()).optional(),
  targetCities: z.array(z.string()).optional(),
});

export async function createCampaignAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean; campaign?: Campaign; checkoutUrl?: string }> {
  const session = await getSession();
  if (!session || (session.role !== "company" && session.role !== "admin")) {
    return { error: "unauthorized" };
  }
  const parsed = campaignSchema.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    placement: formData.get("placement"),
    adType: formData.get("adType"),
    budget: formData.get("budget"),
    targetCategories: formData.getAll("targetCategories").map(String),
    targetCities: formData.getAll("targetCities").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] as string };
  // Self-serve ad purchasing: the campaign is created PENDING and the company
  // is redirected to the hosted checkout — it only goes live once the payment
  // webhook confirms (confirmCampaignPayment flips it to ACTIVE). In real mode
  // session.id resolves the Company row (Company.userId); demo mode ignores it.
  const created = await createCampaign({ ...parsed.data, companyId: session.id });
  if (!created) return { error: "checkout" };
  revalidatePath("/company");
  revalidatePath("/");
  return { ok: true, campaign: created.campaign, checkoutUrl: created.checkoutUrl };
}

/**
 * Mint the hosted checkout for a PENDING campaign — the "Pay now" button on
 * the company dashboard (idempotent per campaign). Returns the provider
 * redirect URL — Stripe's hosted checkout (or the local simulated checkout
 * when no keys are set), or the signed OMT/Whish instructions page for the
 * Lebanon-first manual methods. The chosen method is stamped on the Payment
 * row at mint time. Returns null when the campaign isn't awaiting payment.
 */
export async function payCampaignAction(
  campaignId: string,
  method: "stripe" | "omt" | "whish" = "stripe"
): Promise<{ ok: boolean; url?: string; error?: "invalid" | "not-found" }> {
  if (!campaignId) return { ok: false, error: "invalid" };
  const parsed = z.enum(["stripe", "omt", "whish"]).safeParse(method);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await getSession();
  if (!session || (session.role !== "company" && session.role !== "admin")) {
    return { ok: false, error: "invalid" };
  }
  const provider = parsed.data === "omt" ? "OMT" : parsed.data === "whish" ? "WHISH" : "STRIPE";
  const checkout = await createCampaignCheckout(campaignId, provider);
  if (!checkout) return { ok: false, error: "not-found" };
  return { ok: true, url: checkout.url };
}

/**
 * Admin side: refund a paid campaign purchase (the /admin campaign-payments
 * card). Refunds the provider charge, marks the payment REFUNDED and ends the
 * campaign. The refund lands in the admin activity feed with the acting
 * admin's name and the stated `reason` (a refund without a recorded reason is
 * refused — every refund must be explainable for the dispute trail).
 */
export async function refundCampaignAction(
  campaignId: string,
  reason?: string
): Promise<{ ok: boolean; error?: "invalid" | "not-found" | "reason" }> {
  if (!campaignId) return { ok: false, error: "invalid" };
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "invalid" };
  // Reason is validated AFTER auth — a non-admin must never learn whether a
  // campaign is refundable (the established action pattern: campaignId →
  // session → business validation).
  if (!reason?.trim()) return { ok: false, error: "reason" };
  const payment = await refundCampaignPayment(campaignId, session.name, reason.trim());
  if (!payment) return { ok: false, error: "not-found" };
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Admin inline plan correction (the worker-management audit table): set a
 * worker's subscription tier directly. Admin-only, reversible, no money
 * moves — an expired subscription is reactivated so the fix takes effect in
 * search (both adapters via applyPlanChange / the prisma upsert).
 */
export async function changeWorkerPlanAction(
  workerId: string,
  plan: string
): Promise<{ ok: boolean; error?: "invalid" | "unauthorized" | "not-found" }> {
  if (!workerId) return { ok: false, error: "invalid" };
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  const parsed = z.enum(["basic", "professional", "premium", "enterprise"]).safeParse(plan);
  if (!parsed.success) return { ok: false, error: "invalid" };
  // The acting admin's identity rides the audit entry (actorId = the real
  // session user id, the ActivityLog FK) — same trail as verification decisions.
  const worker = await changeWorkerPlan(workerId, parsed.data, {
    actor: session.name,
    actorId: session.id,
  });
  if (!worker) return { ok: false, error: "not-found" };
  revalidatePath("/admin");
  return { ok: true };
}

export async function renewSubscriptionAction(
  formData: FormData
): Promise<{ ok?: boolean; error?: string; days?: number; url?: string }> {
  const session = await getSession();
  // Only the demo worker account may renew its own subscription.
  if (!session || session.role !== "worker") return { error: "unauthorized" };
  const plan = z.enum(["basic", "professional", "premium", "enterprise"]).safeParse(formData.get("plan"));
  if (!plan.success) return { error: "plan" };
  // Billing period (annual = 10 paid months for 12) — defaults to monthly so
  // the existing renewal flows keep their exact term + price.
  const period = z
    .enum(["monthly", "annual"])
    .safeParse(formData.get("period") ?? "monthly");
  if (!period.success) return { error: "period" };
  const workerSlug = String(formData.get("workerSlug") ?? "khaled-al-harbi-plumbing");
  if (workerSlug !== "khaled-al-harbi-plumbing") return { error: "unauthorized" };

  // §Lebanon — the OMT/Whish MANUAL renewal: the purchase mints the signed
  // instructions URL, the worker pays offline with the reference, and an
  // admin confirms receipt (confirmManualPaymentAction → confirmPurchase),
  // which is when the subscription actually extends. Card/Stripe keeps the
  // instant simulated path below.
  const method = z.enum(["stripe", "omt", "whish"]).safeParse(formData.get("method") ?? "stripe");
  if (!method.success) return { error: "method" };
  if (method.data === "omt" || method.data === "whish") {
    const res = await createPurchaseCheckout({
      workerSlug,
      scope: "subscription",
      plan: plan.data,
      period: period.data,
      method: method.data === "omt" ? "OMT" : "WHISH",
    });
    if (!res) return { error: "checkout" };
    revalidatePath("/dashboard");
    return { ok: true, url: res.url };
  }

  const res = await renewWorkerSubscriptionBySlug(workerSlug, plan.data, period.data);
  revalidatePath("/dashboard");
  return { ok: !!res.worker, days: res.days };
}

export async function submitVerificationAction(): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "worker") return { error: "unauthorized" };
  await submitVerificationRequest("khaled-al-harbi-plumbing");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function decideVerificationAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "admin") return;
  const workerSlug = String(formData.get("workerSlug") ?? "");
  const approve = formData.get("approve") === "1";
  // Thread the real session user id so ActivityLog.actorId becomes a genuine FK.
  await decideVerification(workerSlug, approve, session.name, session.id);
  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
}

export async function markReadAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (id) await markNotificationReadAction(id);
  revalidatePath("/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await markAllNotificationsReadAction();
  revalidatePath("/notifications");
}

/**
 * §Lebanon — admin confirms receipt of a PENDING manual (OMT/Whish) payment.
 * The customer paid offline with the reference the /payments/manual page
 * showed; this runs the SAME confirm path a provider webhook would have run:
 * booking deposit → confirmBookingPayment, campaign purchase →
 * confirmCampaignPayment, paid upgrade → confirmPurchase. Admin-only;
 * idempotent (a second confirm no-ops).
 */
export async function confirmManualPaymentAction(
  paymentId: string
): Promise<{ ok: boolean; error?: "invalid" | "not-found" | "unauthorized" }> {
  if (!paymentId) return { ok: false, error: "invalid" };
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };

  const pending = await getPendingManualPayments();
  const payment = pending.find((p) => p.id === paymentId);
  if (!payment) return { ok: false, error: "not-found" };

  // Thread the ACTING ADMIN's identity into the confirm so the audited
  // activity-feed entry credits who actually confirmed receipt — the
  // BOOKING_CONFIRMED / CAMPAIGN_PAID / PURCHASE_CONFIRMED entries all carry
  // `actor: session.name` (and the admin FK as actorId) instead of a generic
  // worker or "Platform Admin" fallback.
  const by = session.name ?? "Platform Admin";
  const byId = session.id;

  let ok = false;
  if (payment.scope === "booking") {
    ok = (await confirmBookingPayment(payment.entityId, payment.reference, { by, byId })) !== null;
  } else if (payment.scope === "campaign") {
    ok = (await confirmCampaignPayment(payment.entityId, payment.reference, { by, byId })) !== null;
  } else {
    ok = await confirmPurchase(payment.entityId, payment.reference, { by, byId });
  }
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok };
}

/**
 * §Lebanon — a worker buys a paid upgrade (verification tier / featured slot
 * / emergency marker) via the OMT/Whish MANUAL methods (docs/BUSINESS-MODEL.md
 * §5.1, revenue first, no Stripe): the purchase mints the signed instructions
 * URL and the capability flips once an admin confirms receipt. Worker-only
 * (the demo worker account is khaled-al-harbi-plumbing — same gate as the
 * renew action).
 */
export async function purchaseUpgradeAction(
  formData: FormData
): Promise<{ ok?: boolean; error?: string; url?: string }> {
  const session = await getSession();
  if (!session || session.role !== "worker") return { error: "unauthorized" };
  const scope = z
    .enum(["verification", "featured", "emergency"])
    .safeParse(formData.get("scope"));
  if (!scope.success) return { error: "scope" };
  const method = z.enum(["omt", "whish"]).safeParse(formData.get("method"));
  if (!method.success) return { error: "method" };
  const workerSlug = String(formData.get("workerSlug") ?? "khaled-al-harbi-plumbing");
  if (workerSlug !== "khaled-al-harbi-plumbing") return { error: "unauthorized" };
  const tier = scope.data === "verification"
    ? z.enum(["basic", "professional"]).safeParse(formData.get("tier") ?? "basic")
    : { success: true as const, data: undefined };
  if (!tier.success) return { error: "tier" };

  const res = await createPurchaseCheckout({
    workerSlug,
    scope: scope.data,
    tier: tier.data,
    method: method.data === "omt" ? "OMT" : "WHISH",
  });
  if (!res) return { error: "checkout" };
  revalidatePath("/dashboard");
  return { ok: true, url: res.url };
}
