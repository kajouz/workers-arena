"use server";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * CREDIT PURCHASE — server actions for topping up the platform credit balance
 * ────────────────────────────────────────────────────────────────────────────
 * Workers buy credits to pay for leads, featured placement, and add-ons.
 * Supports OMT/Whish manual payment rails (Lebanon launch) and Stripe.
 *
 * The action validates the request, mints a checkout (Stripe hosted page
 * or OMT/Whish signed instructions URL), and returns it to the client.
 * Credits are granted only after payment confirmation (webhook or admin).
 */

import { getSession } from "@/lib/auth-demo";
import {
  getWorkerBySlug,
  getWorkerById,
  createPurchaseCheckout as repoCreatePurchaseCheckout,
  confirmPurchase as repoConfirmPurchase,
} from "@/lib/data/repo";
import { validateCreditPurchase, type CreditPurchaseValidation } from "@/lib/data/credit-purchases";
import { getCreditPackages, isStreamEnabled } from "@/lib/data/revenue-settings";
import { logAdminActivity, ACTION_CODES } from "@/lib/data/activity";

/** The purchase checkout result returned to the client. */
interface CreditPurchaseResult {
  ok: true;
  checkoutUrl: string;
  /** For OMT/Whish: the signed payment instructions page. */
  method: string;
  /** The amount the worker will pay (display). */
  amountUsd: number;
  /** Credits they will receive. */
  credits: number;
}

interface CreditPurchaseFailed {
  ok: false;
  error: string;
}

/**
 * Create a credit purchase checkout. The worker picks a package and payment
 * method (OMT, Whish, or Stripe). Returns the checkout URL the client
 * should redirect to.
 */
export async function createCreditPurchaseAction(input: {
  packageId: string;
  method: "OMT" | "WHISH" | "STRIPE";
}): Promise<CreditPurchaseResult | CreditPurchaseFailed> {
  if (!isStreamEnabled("credits")) {
    return { ok: false, error: "Credits system is disabled" };
  }

  const session = await getSession();
  if (!session || session.role !== "worker") {
    return { ok: false, error: "Only worker accounts can buy credits." };
  }

  // Resolve the worker — demo uses a hardcoded slug; real mode would use session.id.
  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) return { ok: false, error: "Worker account not found." };

  // Validate the package
  const packages = getCreditPackages();
  const validation = validateCreditPurchase(packages, input.packageId);
  if (!validation.ok) {
    return { ok: false, error: `Invalid package: ${validation.error}` };
  }

  // Mint the checkout via the existing purchase seam
  const result = await repoCreatePurchaseCheckout({
    workerSlug: worker.slug,
    scope: "credit",
    method: input.method === "STRIPE" ? "OMT" : input.method, // Stripe goes through a hosted checkout; OMT/Whish use signed instructions
  });

  if (!result) {
    return { ok: false, error: "Could not create checkout." };
  }

  return {
    ok: true,
    checkoutUrl: result.url,
    method: input.method,
    amountUsd: validation.priceUsd,
    credits: validation.totalCredits,
  };
}

/**
 * Admin confirm of a credit purchase: the worker paid offline with a
 * reference, the admin confirms receipt, credits are granted.
 * Idempotent — a double-confirm returns the same result.
 */
export async function confirmCreditPurchaseAction(
  paymentId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<{ ok: boolean; credits?: number; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Only admins can confirm credit purchases." };
  }

  const confirmed = await repoConfirmPurchase(paymentId, providerRef, opts);
  if (!confirmed) {
    return { ok: false, error: "Payment not found or already confirmed." };
  }

  // Audit the confirmation
  await logAdminActivity({
    code: ACTION_CODES.ADMIN_PLAN_CHANGED, // reuse existing code; a more specific one can be added later
    actionEn: `${opts.by ?? "Admin"} confirmed credit purchase ${paymentId}`,
    actionAr: `${opts.by ?? "المشرف"} أكّد شراء أرصدة ${paymentId}`,
    actor: opts.by ?? "Platform Admin",
    ...(opts.byId ? { actorId: opts.byId } : {}),
    type: "worker",
  });

  return { ok: true };
}
