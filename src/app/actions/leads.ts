"use server";

/**
 * §7–§10 — LEAD MARKETPLACE server actions (docs/lead-marketplace.md).
 *
 * Three mutation paths, each with its own authority:
 *   • buyLeadOfferAction        — a WORKER spends their credits on one offer.
 *   • saveLeadMarketConfigAction — an ADMIN publishes the pricing/matching/
 *                                  ownership/reveal policy as a new rule version.
 *   • grantWorkerCreditsAction   — an ADMIN adjusts a worker's credit ledger.
 *
 * The buy path is a money mutation, so it is server-authoritative: the offer is
 * resolved from the ledger's perspective (`buyLeadOffer` re-checks that the
 * offer is live, unpurchased and belongs to the caller) rather than trusting a
 * price or an owner id sent by the client.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import { buyLeadOffer, getWorkerById, getWorkerBySlug, submitLeadRating } from "@/lib/data/repo";
import { saveFeeRuleSet } from "@/lib/data/fee-rules-store";
import { grantCredits } from "@/lib/data/credit-ledger";
import { requestLeadRefund, decideLeadRefund } from "@/lib/data/lead-refund-store";
import {
  LEAD_GRADES,
  normalizeLeadMarketConfig,
  type ContactReveal,
  type LeadMarketConfig,
} from "@/lib/data/lead-market";

export type LeadActionResult =
  | { ok: true; reveal?: ContactReveal; balanceAfter?: number }
  | { ok: false; error: "unauthorized" | "invalid" | "failed" | LeadPurchaseFailure };

type LeadPurchaseFailure = "not-found" | "not-live" | "already-owned" | "insufficient-credits" | "already-charged";

/**
 * The demo worker account (the same gate `actions/business.ts` uses). Real mode
 * resolves the caller's own worker row by session email, so this is a demo
 * convenience rather than the authorization itself.
 */
const DEMO_WORKER_SLUG = "khaled-al-harbi-plumbing";

/** The worker the session acts as, or null when the caller is not a worker. */
async function sessionWorkerId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "worker") {
    const worker = await getWorkerBySlug(DEMO_WORKER_SLUG);
    return worker?.id ?? null;
  }
  return null;
}

/** §9 — buy one lead offer with platform credits. */
export async function buyLeadOfferAction(offerId: string): Promise<LeadActionResult> {
  const parsed = z.string().min(1).max(120).safeParse(offerId);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const workerId = await sessionWorkerId();
  if (!workerId) return { ok: false, error: "unauthorized" };

  try {
    const result = await buyLeadOffer(parsed.data, workerId);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard");
    revalidatePath("/admin/revenue-settings");
    return { ok: true, reveal: result.reveal };
  } catch (error) {
    console.error("[lead-market] purchase failed", error);
    return { ok: false, error: "failed" };
  }
}

/* ───────────────────── Admin: the lead-market policy (§7–§10) ───────────────────── */

const revealSchema = z.enum(["hidden", "masked", "revealed"] satisfies [ContactReveal, ContactReveal, ContactReveal]);

const leadMarketSchema = z.object({
  prices: z.record(z.string(), z.coerce.number().min(0).max(100_000)),
  maxWorkersPerLead: z.coerce.number().int().min(1).max(20),
  offerTtlMinutes: z.coerce.number().int().min(5).max(10_080),
  exclusive: z.coerce.boolean(),
  reveal: z.object({
    beforePurchase: revealSchema,
    afterPurchase: revealSchema,
    afterPurchaseFreeTier: revealSchema,
    afterBooking: revealSchema,
  }),
  weights: z.record(z.string(), z.coerce.number().min(0).max(100)),
  // §11 — the lead rebate (fee given back on a job that came from a bought
  // lead). `maxMinor: null` means "no ceiling beyond the fee itself".
  rebate: z.object({
    enabled: z.coerce.boolean(),
    pctBps: z.coerce.number().int().min(0).max(10_000),
    maxMinor: z.union([z.coerce.number().int().min(0).max(10_000_000), z.null()]),
  }),
  whatsappTemplates: z.object({
    en: z.record(z.string(), z.string()),
    ar: z.record(z.string(), z.string()),
  }).optional(),
  emailTemplates: z.object({
    en: z.record(z.string(), z.object({ subject: z.string(), body: z.string() })),
    ar: z.record(z.string(), z.object({ subject: z.string(), body: z.string() })),
  }).optional(),
  smsTemplates: z.object({
    en: z.record(z.string(), z.string()),
    ar: z.record(z.string(), z.string()),
  }).optional(),
  notifyChannels: z.object({
    whatsapp: z.coerce.boolean(),
    email: z.coerce.boolean(),
    sms: z.coerce.boolean(),
  }).optional(),
});

export type LeadMarketConfigPayload = z.infer<typeof leadMarketSchema>;

/**
 * Publish the lead-market policy. Prices, weights and limits are clamped by
 * `normalizeLeadMarketConfig` after validation, so a tampered payload cannot
 * set a $0 gold lead or reveal contacts before purchase; the save appends a new
 * rule version (append-only), so offers already created keep the price they
 * were quoted at.
 */
export async function saveLeadMarketConfigAction(
  payload: LeadMarketConfigPayload
): Promise<{ ok?: boolean; error?: "unauthorized" | "invalid" | "failed"; version?: number }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };

  const parsed = leadMarketSchema.safeParse(payload);
  if (!parsed.success) return { error: "invalid" };

  // Rebuild from canonical keys so an unknown grade/weight key is dropped
  // rather than stored (the normalizer reads known keys only).
  const prices: Partial<Record<(typeof LEAD_GRADES)[number], number>> = {};
  for (const grade of LEAD_GRADES) {
    const value = parsed.data.prices[grade];
    if (typeof value === "number") prices[grade] = value;
  }
  const config = normalizeLeadMarketConfig({
    prices: prices as LeadMarketConfig["prices"],
    maxWorkersPerLead: parsed.data.maxWorkersPerLead,
    offerTtlMinutes: parsed.data.offerTtlMinutes,
    exclusive: parsed.data.exclusive,
    reveal: parsed.data.reveal,
    weights: parsed.data.weights as unknown as LeadMarketConfig["weights"],
    rebate: parsed.data.rebate,
    whatsappTemplates: parsed.data.whatsappTemplates as LeadMarketConfig["whatsappTemplates"] | undefined,
    emailTemplates: parsed.data.emailTemplates as LeadMarketConfig["emailTemplates"] | undefined,
    smsTemplates: parsed.data.smsTemplates as LeadMarketConfig["smsTemplates"] | undefined,
    notifyChannels: parsed.data.notifyChannels,
  });

  try {
    const saved = await saveFeeRuleSet(
      { leadMarket: config, change: "lead marketplace policy" },
      { id: session.id, name: session.name }
    );
    revalidatePath("/admin/revenue-settings");
    revalidatePath("/dashboard/leads");
    return { ok: true, version: saved.version };
  } catch (error) {
    console.error("[lead-market] config save failed", error);
    return { error: "failed" };
  }
}

/** §20 — an admin adjustment to a worker's credit ledger (grant or claw-back). */
export async function grantWorkerCreditsAction(input: {
  workerId: string;
  amount: number;
  reason: string;
}): Promise<{ ok?: boolean; error?: "unauthorized" | "invalid" | "not-found" | "failed"; balanceAfter?: number }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };

  const parsed = z
    .object({
      workerId: z.string().min(1).max(120),
      amount: z.coerce.number().int().refine((n) => n !== 0, "amount"),
      reason: z.string().min(2).max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  // The panel may address a worker by id OR by slug (its audit list shows
  // slugs); accept either so an admin can't accidentally grant to nobody.
  const exists = (await getWorkerById(parsed.data.workerId)) ?? (await getWorkerBySlug(parsed.data.workerId));
  if (!exists) return { error: "not-found" };

  try {
    // A negative amount is an admin ADJUSTMENT row (never an edit of history),
    // so the ledger stays append-only whichever direction the correction goes.
    const entry = await grantCredits({
      workerId: exists.id,
      amount: parsed.data.amount,
      kind: parsed.data.amount > 0 ? "grant" : "adjustment",
      reason: parsed.data.reason,
      createdBy: session.name,
    });
    if (!entry) return { error: "invalid" };
    revalidatePath("/admin/revenue-settings");
    revalidatePath("/dashboard/leads");
    return { ok: true };
  } catch (error) {
    console.error("[lead-market] credit grant failed", error);
    return { error: "failed" };
  }
}

// ──────────────────── Lead-quality refund workflow (Phase 1) ────────────────────

export async function requestLeadRefundAction(input: { offerId: string; reason: string; evidence?: string }): Promise<{ ok?: boolean; error?: string }> {
  const workerId = await sessionWorkerId();
  if (!workerId) return { error: "unauthorized" };
  const parsed = z.object({ offerId: z.string().min(1).max(120), reason: z.string().min(1).max(40), evidence: z.string().max(1000).optional() }).safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const result = await requestLeadRefund({ ...parsed.data, workerId });
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/leads");
  revalidatePath("/admin/revenue-settings");
  return { ok: true };
}

export async function decideLeadRefundAction(input: { requestId: string; approve: boolean; approvedCredits?: number; adminNote?: string }): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };
  const parsed = z.object({ requestId: z.string().min(1).max(120), approve: z.boolean(), approvedCredits: z.number().int().min(0).max(100000).optional(), adminNote: z.string().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const result = await decideLeadRefund({ ...parsed.data, decidedBy: session.name });
  if (!result) return { error: "not-found" };
  revalidatePath("/admin/revenue-settings");
  revalidatePath("/dashboard/leads");
  return { ok: true };
}

// ──────────────────── Lead rating action (§12) ────────────────────

export async function submitLeadRatingAction(input: {
  offerId: string;
  quality: number;
  reason?: string;
  converted?: boolean;
  reachable?: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "worker") {
    return { error: "Only workers can rate leads." };
  }

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) return { error: "Worker not found." };

  try {
    const result = await submitLeadRating({
      offerId: input.offerId,
      workerId: worker.id,
      quality: input.quality,
      reason: input.reason,
      converted: input.converted,
      reachable: input.reachable,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/dashboard/leads");
    return { ok: true };
  } catch (error) {
    console.error("[lead-rating] submit failed", error);
    return { error: "failed" };
  }
}
