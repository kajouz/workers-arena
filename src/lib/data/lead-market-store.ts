/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD MARKETPLACE — store (§7–§10): offers, purchases, expiry
 * ────────────────────────────────────────────────────────────────────────────
 * The pure decisions live in `lead-market.ts` (grading, pricing, matching,
 * ownership, reveal). This module is the mutable half, following the app's
 * two-adapter convention:
 *
 *   • demo  → a globalThis store (the admin board, the worker board and the
 *             request hooks share one home; no database needed)
 *   • real  → `LeadOffer` rows (+ the credit ledger's `offerId` debit)
 *
 * The purchase path is the one that touches money, so it is strict about
 * order: check the offer is live and not already owned → charge credits
 * (`spendCredits`, idempotent by offerId) → flip the offer to purchased →
 * revoke the competing offers when the lead is exclusive (§9) → record the
 * reveal the buyer now has (§10). A refusal at any earlier step leaves no
 * trace: an unpaid offer never becomes purchased.
 */

import { logAdminActivity, ACTION_CODES } from "./activity";
import { spendCredits, type CreditLedgerEntry } from "./credit-ledger";
import {
  contactRevealFor,
  gradeLeadRequest,
  leadMarketConfig,
  leadPrice,
  matchLeadCandidates,
  offerIsLive,
  offersToRevoke,
  type ContactReveal,
  type LeadCandidate,
  type LeadGrade,
  type LeadGradeInput,
  type LeadGradeResult,
  type LeadOffer,
  type LeadOfferStatus,
} from "./lead-market";
import { loadActiveFeeRuleSet } from "./fee-rules-store";
import {
  validateLeadRating,
  aggregateRatings,
  pricingMultipliers,
  matchingWeightAdjustments,
  type LeadRating,
  type GradeRatingSummary,
} from "./lead-rating";

function realLeadDataEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

function leadPrisma() {
  return import("./lead-market-prisma");
}

/* ───────────────────────────── Demo (globalThis) ───────────────────────────── */

interface LeadStore {
  seq: number;
  offers: LeadOffer[];
}

const GLOBAL_KEY = "__workersArenaLeadOffers";
const g = globalThis as Record<string, unknown>;
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;
const STORE: LeadStore =
  (g[GLOBAL_KEY] as LeadStore | undefined) ?? (g[GLOBAL_KEY] = { seq: 0, offers: [] } as LeadStore);

if (FIRST_INSTANCE) {
  STORE.seq = 0;
  STORE.offers = [];
}

/** Reset the demo offer store (tests). */
export function resetLeadOfferStore(): void {
  STORE.seq = 0;
  STORE.offers = [];
}

/* ────────────────────────────── Offer creation ────────────────────────────── */

export interface CreateLeadOffersInput {
  /** The job post: everything the matcher and the grader need. */
  lead: {
    id: string;
    number: string;
    categorySlug: string;
    citySlug: string;
    isEmergency?: boolean;
    grade: LeadGrade;
    gradeScore: number;
  };
  /** The worker pool the caller already has (its own search/query). */
  candidates: LeadCandidate[];
  /** ISO stamp (defaults to now) — injected so tests are deterministic. */
  at?: string;
  /** Rule set override (callers that already loaded it). */
  ruleSet?: Awaited<ReturnType<typeof loadActiveFeeRuleSet>>;
  /** Phase 2 demand/dispatch multiplier, computed by the repository seam. */
  smartPriceMultiplier?: number;
  smartPriceReason?: string;
  /** Worker ids that already hold an offer on this lead (idempotent re-runs). */
  excludeWorkerIds?: string[];
}

/**
 * Match the lead and persist one offer per chosen worker. Idempotent per
 * (lead, worker): re-running a match never duplicates an offer, and an
 * already-existing offer is returned as-is rather than re-priced.
 *
 * Returns BOTH sets: `offers` is everything on the lead (the board), `created`
 * is only what this call added — the caller notifies exactly those workers, so
 * a re-run cannot spam the ones who already hold an offer.
 */
export async function createLeadOffers(
  input: CreateLeadOffersInput
): Promise<{ offers: LeadOffer[]; created: LeadOffer[] }> {
  const ruleSet = input.ruleSet ?? (await loadActiveFeeRuleSet());
  const config = leadMarketConfig(ruleSet);
  const at = input.at ?? new Date().toISOString();
  const atMs = Date.parse(at);

  const existing = await getLeadOffers(input.lead.id);
  const exclude = new Set<string>([
    ...(input.excludeWorkerIds ?? []),
    ...existing.map((o) => o.workerId),
  ]);

  // §12 — adjust matching weights by the grade's rating signal.
  // Low-rated grades get a penalty on the category weight (looser matching);
  // high-rated grades get a boost (tighter, more relevant offers).
  const weightAdjustments = matchingWeightAdjustments(getLeadRatingSummary());
  const gradeAdjustment = weightAdjustments[input.lead.grade] ?? 0;
  const adjustedWeights = { ...config.weights, category: Math.max(0, config.weights.category + gradeAdjustment) };

  const matched = matchLeadCandidates(
    input.candidates,
    { categorySlug: input.lead.categorySlug, citySlug: input.lead.citySlug, isEmergency: input.lead.isEmergency },
    { weights: adjustedWeights, maxWorkers: config.maxWorkersPerLead, excludeWorkerIds: [...exclude] }
  );
  if (matched.length === 0) return { offers: existing, created: [] };

  // §12 — apply the rating-based price multiplier for this grade
  const multipliers = getRatingPriceMultipliers();
  const ratingMultiplier = multipliers[input.lead.grade] ?? 1.0;
  const smartPriceMultiplier = Math.max(0.7, Math.min(2.0, input.smartPriceMultiplier ?? 1.0));
  const price = leadPrice(ruleSet, input.lead.grade, ratingMultiplier * smartPriceMultiplier);
  const expiresAt = new Date(atMs + config.offerTtlMinutes * 60_000).toISOString();
  const fresh: LeadOffer[] = matched.map((row) => ({
    id: `offer-${(STORE.seq += 1)}`,
    leadId: input.lead.id,
    leadNumber: input.lead.number,
    workerId: row.candidate.workerId,
    grade: input.lead.grade,
    matchScore: row.score,
    priceCredits: price.credits,
    pricingMultiplier: Math.round(ratingMultiplier * smartPriceMultiplier * 100) / 100,
    ...(input.smartPriceReason ? { pricingReason: input.smartPriceReason } : {}),
    status: "offered" as LeadOfferStatus,
    exclusive: config.exclusive,
    offeredAt: at,
    expiresAt,
  }));

  if (realLeadDataEnabled()) {
    const offers = await (await leadPrisma()).prismaCreateLeadOffers(fresh);
    const createdIds = new Set(fresh.map((o) => o.workerId));
    return { offers, created: offers.filter((o) => createdIds.has(o.workerId)) };
  }
  STORE.offers.push(...fresh);
  return { offers: [...existing, ...fresh], created: fresh };
}

/**
 * §7–§10 — the whole distribution step for one customer request: grade it,
 * then offer it to the FEW best-matched workers who are not already on it.
 *
 * Workers the customer invited directly are excluded on purpose: they hold a
 * free invite to the same job, so selling them the lead would be charging for
 * something they already have. What the marketplace sells is the match the
 * customer never made.
 */
export interface OfferQualifiedLeadInput {
  /** The job post (grading needs the signals, not the whole row). */
  lead: LeadGradeInput & { id: string; number: string };
  /** The pool the caller already queried (its own search/eligibility rules). */
  candidates: LeadCandidate[];
  /** Workers who already hold an invite or an offer on this lead. */
  invitedWorkerIds?: string[];
  at?: string;
  ruleSet?: Awaited<ReturnType<typeof loadActiveFeeRuleSet>>;
  smartPriceMultiplier?: number;
  smartPriceReason?: string;
}

export interface OfferQualifiedLeadResult {
  grade: LeadGradeResult;
  /** Every offer on the lead (the board). */
  offers: LeadOffer[];
  /** Only the offers this call created (the ones to notify). */
  created: LeadOffer[];
}

export async function offerQualifiedLead(input: OfferQualifiedLeadInput): Promise<OfferQualifiedLeadResult> {
  const grade = gradeLeadRequest(input.lead);
  const { offers, created } = await createLeadOffers({
    lead: {
      id: input.lead.id,
      number: input.lead.number,
      categorySlug: input.lead.categorySlug ?? "",
      citySlug: input.lead.citySlug ?? "",
      isEmergency: Boolean(input.lead.isEmergency),
      grade: grade.grade,
      gradeScore: grade.score,
    },
    candidates: input.candidates,
    ...(input.invitedWorkerIds ? { excludeWorkerIds: input.invitedWorkerIds } : {}),
    ...(input.at ? { at: input.at } : {}),
    ...(input.ruleSet ? { ruleSet: input.ruleSet } : {}),
    ...(input.smartPriceMultiplier !== undefined ? { smartPriceMultiplier: input.smartPriceMultiplier } : {}),
    ...(input.smartPriceReason ? { smartPriceReason: input.smartPriceReason } : {}),
  });
  return { grade, offers, created };
}

/* ──────────────────────────────── Reads ──────────────────────────────── */

/** Every offer on one lead (the lead board). */
export async function getLeadOffers(leadId: string): Promise<LeadOffer[]> {
  if (realLeadDataEnabled()) return (await leadPrisma()).prismaGetLeadOffers(leadId);
  return STORE.offers
    .filter((o) => o.leadId === leadId)
    .sort((a, b) => b.matchScore - a.matchScore || a.workerId.localeCompare(b.workerId));
}

/** One worker's offers, live ones first (the worker's lead board). */
export async function getWorkerLeadOffers(workerId: string, now = new Date()): Promise<LeadOffer[]> {
  if (realLeadDataEnabled()) return (await leadPrisma()).prismaGetWorkerLeadOffers(workerId);
  const atMs = now.getTime();
  return STORE.offers
    .filter((o) => o.workerId === workerId)
    .sort((a, b) => Number(offerIsLive(b, atMs)) - Number(offerIsLive(a, atMs)) || b.offeredAt.localeCompare(a.offeredAt));
}

/** Recent offers, newest first (admin audit list). */
export async function listLeadOffers(limit = 50): Promise<LeadOffer[]> {
  if (realLeadDataEnabled()) return (await leadPrisma()).prismaListLeadOffers(limit);
  return [...STORE.offers].sort((a, b) => b.offeredAt.localeCompare(a.offeredAt)).slice(0, Math.max(1, Math.trunc(limit)));
}

/**
 * The purchased offer a worker holds on a lead — SYNCHRONOUS and demo-only,
 * the same convention as `activeFeeRuleSetSync`. The demo completion path
 * credits earnings synchronously, and rebate attribution must happen inside
 * that same step, so it cannot await. Real mode reads the row inside the
 * completion transaction (`prismaFindPurchasedLeadOffer`) instead.
 */
export function purchasedLeadOfferSync(
  workerId: string,
  leadId: string
): { offerId: string; leadId: string; priceCredits: number } | null {
  const hit = STORE.offers.find(
    (o) => o.workerId === workerId && o.leadId === leadId && o.status === "purchased"
  );
  return hit ? { offerId: hit.id, leadId: hit.leadId, priceCredits: hit.priceCredits } : null;
}

/** Look up one offer by id for worker actions (never exposes another worker's data). */
export function getLeadOfferById(offerId: string): LeadOffer | null {
  return STORE.offers.find((offer) => offer.id === offerId) ?? null;
}

/** The offer a worker bought for a lead, if any (contact-reveal lookups). */
export async function getPurchasedOffer(leadId: string, workerId: string): Promise<LeadOffer | null> {
  const offers = await getLeadOffers(leadId);
  return offers.find((o) => o.workerId === workerId && o.status === "purchased") ?? null;
}

export type LeadPurchaseResult =
  | { ok: true; offer: LeadOffer; reveal: ContactReveal; entry: CreditLedgerEntry }
  | { ok: false; error: "not-found" | "not-live" | "already-owned" | "insufficient-credits" | "already-charged" };

/**
 * Buy a lead offer with platform credits. See the module header for the order
 * of operations; every failure mode returns a refusal and changes nothing.
 */
export async function purchaseLeadOffer(
  offerId: string,
  workerId: string,
  opts: { at?: string; planTier?: "free" | "starter" | "professional" | "growth" | "business" } = {}
): Promise<LeadPurchaseResult> {
  const ruleSet = await loadActiveFeeRuleSet();
  const config = leadMarketConfig(ruleSet);
  const at = opts.at ?? new Date().toISOString();
  const atMs = Date.parse(at);

  const offers = realLeadDataEnabled()
    ? await (await leadPrisma()).prismaGetLeadOffersByIds([offerId])
    : STORE.offers.filter((o) => o.id === offerId);
  const offer = offers[0];
  if (!offer) return { ok: false, error: "not-found" };
  if (offer.workerId !== workerId) return { ok: false, error: "not-found" }; // never leak someone else's offer
  if (offer.status === "purchased") return { ok: false, error: "already-owned" };
  if (!offerIsLive(offer, atMs)) return { ok: false, error: "not-live" };

  const charge = await spendCredits({
    workerId,
    amount: offer.priceCredits,
    reason: `Lead ${offer.leadNumber} (${offer.grade})`,
    offerId: offer.id,
    at,
  });
  if (!charge.ok) return { ok: false, error: charge.error === "already-charged" ? "already-charged" : "insufficient-credits" };

  const reveal = contactRevealFor({
    policy: config.reveal,
    purchased: true,
    ...(opts.planTier ? { planTier: opts.planTier } : {}),
  });

  const purchased: LeadOffer = {
    ...offer,
    status: "purchased",
    purchasedAt: at,
    creditEntryId: charge.entry.id,
    contactReveal: reveal,
  };

  // §9 ownership: an exclusive lead is the buyer's alone — the competing
  // pending offers are revoked (their workers are told when notifications land).
  const revokeIds = offer.exclusive ? offersToRevoke(await getLeadOffers(offer.leadId), offer.id, atMs) : [];

  if (realLeadDataEnabled()) {
    await (await leadPrisma()).prismaMarkOfferPurchased(purchased, revokeIds);
  } else {
    const index = STORE.offers.findIndex((o) => o.id === offer.id);
    if (index >= 0) STORE.offers[index] = purchased;
    for (const id of revokeIds) {
      const other = STORE.offers.findIndex((o) => o.id === id);
      if (other >= 0) STORE.offers[other] = { ...STORE.offers[other], status: "revoked" };
    }
  }

  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED,
    actionEn: `Lead ${offer.leadNumber} (${offer.grade}) purchased by worker ${workerId} for ${offer.priceCredits} credits${revokeIds.length ? ` — ${revokeIds.length} competing offer(s) revoked` : ""}`,
    actionAr: `تم شراء العميل المحتمل ${offer.leadNumber} (${offer.grade}) بمبلغ ${offer.priceCredits} رصيد${revokeIds.length ? ` — تم إلغاء ${revokeIds.length} عرض منافس` : ""}`,
    actor: "Platform",
    type: "payment",
  });

  return { ok: true, offer: purchased, reveal, entry: charge.entry };
}

/** Expire every live offer past its window. Idempotent (a status CAS in real
 * mode; a plain filter in demo) — the cron twin of the quote SLA sweep. */
export async function expireLeadOffers(now = new Date()): Promise<number> {
  const atMs = now.getTime();
  if (realLeadDataEnabled()) return (await leadPrisma()).prismaExpireLeadOffers(now);
  let count = 0;
  for (let i = 0; i < STORE.offers.length; i += 1) {
    const offer = STORE.offers[i];
    if (offer.status !== "offered") continue;
    const expiry = Date.parse(offer.expiresAt);
    if (Number.isFinite(expiry) && expiry <= atMs) {
      STORE.offers[i] = { ...offer, status: "expired" };
      count += 1;
    }
  }
  return count;
}

/** The grade of a lead as computed by the caller (re-exported for the UI). */
export type { LeadGradeResult };

// ──────────────────── Lead rating store (§12) ────────────────────

const RATING_STORE = globalThis as typeof globalThis & {
  __leadRatings?: LeadRating[];
};

function getRatingStore(): LeadRating[] {
  if (!RATING_STORE.__leadRatings) RATING_STORE.__leadRatings = [];
  return RATING_STORE.__leadRatings;
}

/** Reset the demo rating store (tests). */
export function resetLeadRatingStore(): void {
  RATING_STORE.__leadRatings = [];
}

/** Submit a worker's rating of a purchased lead. Pure validation + append. */
export async function submitLeadRating(input: {
  offerId: string;
  workerId: string;
  quality: number;
  reason?: string;
  reasonAr?: string;
  converted?: boolean;
  reachable?: boolean;
}): Promise<{ ok: true; rating: LeadRating } | { ok: false; error: string }> {
  // First, look up the offer across all leads by scanning the global store
  // (we need the leadId to call getLeadOffers properly).
  let offer: LeadOffer | null = null;
  for (const entry of STORE.offers) {
    if (entry.id === input.offerId) { offer = entry; break; }
  }
  const offers = offer ? await getLeadOffers(offer.leadId) : [];
  const existingRating = getRatingStore().find((r) => r.offerId === input.offerId) ?? null;

  const validation = validateLeadRating(offer, existingRating, input.quality, input.workerId);
  if (!validation.ok) return { ok: false, error: validation.error };

  const grade = offer!.grade as LeadGrade;
  const rating: LeadRating = {
    id: `rlr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    offerId: input.offerId,
    workerId: input.workerId,
    leadId: offer!.leadId,
    grade,
    quality: input.quality,
    reason: input.reason ?? null,
    reasonAr: input.reasonAr ?? null,
    converted: input.converted ?? false,
    reachable: input.reachable ?? null,
    createdAt: new Date().toISOString(),
  };

  getRatingStore().push(rating);

  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED, // reuse; a more specific code can be added later
    actionEn: `Worker ${input.workerId} rated lead ${offer!.leadNumber} (${grade}) ${input.quality}/5 stars`,
    actionAr: `قيّم العامل ${input.workerId} العميل المحتمل ${offer!.leadNumber} (${grade}) بـ ${input.quality}/5 نجوم`,
    actor: "Platform",
    type: "payment",
  });

  return { ok: true, rating };
}

/** Get all ratings for a specific worker. */
export function getWorkerLeadRatings(workerId: string): LeadRating[] {
  return getRatingStore().filter((r) => r.workerId === workerId);
}

/** Get a rating for a specific offer (or null). */
export function getOfferRating(offerId: string): LeadRating | null {
  return getRatingStore().find((r) => r.offerId === offerId) ?? null;
}

/** Get all ratings in the system. */
export function getAllLeadRatings(): LeadRating[] {
  return [...getRatingStore()];
}

/** Aggregate all ratings into per-grade stats. */
export function getLeadRatingSummary(): GradeRatingSummary {
  return aggregateRatings(getRatingStore());
}

/** Get the current pricing multipliers from the rating signal. */
export function getRatingPriceMultipliers(): Record<LeadGrade, number> {
  return pricingMultipliers(getLeadRatingSummary());
}
