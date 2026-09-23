import { formatDate } from "@/lib/utils";
import {
  categoriesWithCounts,
  demoSetWorkerInstantBook,
  demoSetWorkerServicePackage,
  workerById,
  workerBySlug,
  WORKERS,
} from "./workers";
import { computeResponseRate, hasFreeSlotsThisWeek } from "./booking-ui";
import { CITIES } from "./cities";
import { getAnalytics } from "./analytics";
import { getFeaturedWorkers, getRelatedWorkers, getSuggestions, POPULAR_SEARCHES, searchWorkers } from "./search";
import { applyPlanChange, periodMonths, PLANS, renewSubscription, startTrialSubscription } from "./subscriptions";
import { TRIAL_PERIOD_DAYS, trialDaysForPlan } from "./subscription-plans";
import { loadPlanCatalog } from "./fee-rules-store";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  pushNotification,
} from "./notifications";
import { ACTION_CODES, getVerificationFunnel, logAdminActivity, type ActivityCode } from "./activity";
import { payoutGuard, type Settlement, type SettlementJob } from "./booking-settlement";
import { benchmarkFor, computePriceBenchmarks, type PriceBenchmark } from "./price-benchmarks";
import { reviewBody, scanReviewText, visibleReviews } from "./review-moderation";
import {
  getChatTyping as getChatTypingFlag,
  setChatTyping as setChatTypingFlag,
  type ChatTypingState,
} from "./chat-presence";
import {
  demoCancelBooking,
  demoRefundBookingDeposit,
  demoCancelRecurringContract,
  demoConfirmBookingCompletion,
  demoCreateBookingRequest,
  demoCreateQuoteRequest,
  demoCreateRecurringRequest,
  demoExpireQuoteRequests,
  demoGenerateSlots,
  demoConfirmBookingPayment,
  demoCreateBookingCheckout,
  demoPendingManualBookingPayments,
  demoReconciliationBookingPayments,
  demoGetAllBookings,
  demoGetBookingById,
  demoGetBookingByNumber,
  demoGetBookingMessages,
  demoGetBookingFunnel,
  demoGetPlatformFeeStats,
  demoGetCustomerBookings,
  demoGetCustomerQuoteRequests,
  demoGetQuoteRequest,
  demoGetWorkerBookings,
  demoGetWorkerSlots,
  demoGetWorkerBalance,
  demoConfirmBookingSettlement,
  demoCreateBookingSettlementCheckout,
  demoGetBookingSlot,
  demoPriceBenchmarkJobs,
  demoGetBookingSettlementPayment,
  demoMarkBookingSettledOutside,
  demoSettlementFor,
  demoSettlementReconciliation,
  demoRequestPayout,
  demoDecidePayout,
  demoGetWorkerPayouts,
  demoGetPendingPayouts,
  demoGetCustomerRecurrings,
  demoGetRecurringById,
  demoGetWorkerRecurrings,
  demoRescheduleBooking,
  demoRespondToBooking,
  demoRespondToRecurring,
  demoSelectQuote,
  demoSendBookingMessage,
  demoAcceptChatQuote,
  demoMarkChatRead,
  demoSetSlotBlocked,
  demoSubmitQuote,
  demoTransitionBooking,
} from "./bookings";
import {
  demoAddInvoice,
  demoCampaignPayment,
  demoCampaignRecipient,
  demoConfirmCampaignPayment,
  demoCreateCampaign,
  demoCreateCampaignCheckout,
  demoGetActiveAdsFor,
  demoGetCampaigns,
  demoGetInvoices,
  demoRecordClick,
  demoRecordImpression,
  demoRefundCampaignPayment,
  demoPendingManualCampaignPayments,
  demoReconciliationCampaignPayments,
  type CampaignCreateInput,
} from "./campaigns";
import {
  demoCreatePurchaseCheckout,
  demoConfirmPurchase,
  demoCancelPendingPurchase,
  demoPendingManualPurchases,
  demoReconciliationPurchases,
  demoPurchasePayment,
  type VerificationTier,
} from "./purchases";
import {
  leadBoardItemFor,
  leadCandidateFromWorker,
  leadCandidatesFromWorkers,
  leadMarketConfig,
  matchReasonsFor,
  scoreLeadCandidate,
  splitLeadBoard,
  type LeadBoardItem,
  type LeadMarketConfig,
  type LeadGradeResult,
  type WorkerLike,
} from "./lead-market";
import {
  getLeadOffers as getLeadOffersStore,
  getWorkerLeadOffers as getWorkerLeadOffersStore,
  listLeadOffers as listLeadOffersStore,
  offerQualifiedLead,
  purchaseLeadOffer as purchaseLeadOfferStore,
  expireLeadOffers as expireLeadOffersStore,
  type LeadPurchaseResult,
} from "./lead-market-store";
import { getWorkerCreditBalance, type WorkerCreditBalance } from "./credit-ledger";
import { getWorkerLeadRebates, listLeadRebates } from "./lead-rebate";
import { getWorkerLeadRefunds } from "./lead-refund-store";
import {
  submitLeadRating as submitLeadRatingStore,
  getWorkerLeadRatings as getWorkerLeadRatingsStore,
  getOfferRating as getOfferRatingStore,
  getAllLeadRatings as getAllLeadRatingsStore,
  getLeadRatingSummary as getLeadRatingSummaryStore,
  getRatingPriceMultipliers as getRatingPriceMultipliersStore,
} from "./lead-market-store";
import { validateLeadRating, type LeadRating, type GradeRatingSummary } from "./lead-rating";
import {
  computeWorkerRoiSeries,
  recentRoiMonthKeys,
  roiMonthKeyOf,
  roiMonthWindow,
  totalWorkerRoi,
  type RoiMonth,
  type RoiSubscription,
  type WorkerRoi,
} from "./worker-roi";
import { leadOfferNotification } from "./lead-notifications";
import { loadActiveFeeRuleSet } from "./fee-rules-store";
import { planTierFor } from "./fee-rules";
import { computeSmartPricing } from "@/lib/pricing/smart-pricing";
import { listSubscriptionEvents, recordSubscriptionEvent, type RecordSubscriptionEventInput } from "./subscription-lifecycle-store";
import { subscriptionAnalytics, type SubscriptionAnalytics, type SubscriptionCohort } from "./subscription-lifecycle";
import type {
  AnalyticsOverview,
  BillingPeriod,
  Booking,
  BookingCancelInput,
  BookingMessage,
  BookingMessageInput,
  BookingRequestInput,
  BookingFunnel,
  BookingSettlementPayment,
  QuoteBidInput,
  QuoteRequest,
  QuoteRequestInput,
  RecurringBooking,
  RecurringRequestInput,
  RecurringRespondInput,
  PlatformFeeStats,
  LedgerEntry,
  WorkerBalance,
  BookingRescheduleInput,
  BookingRespondInput,
  BookingSlot,
  BookingStatus,
  BookingTransitionTarget,
  Campaign,
  CampaignPayment,
  City,
  Invoice,
  Notification,
  PendingManualPayment,
  ReconciliationPayment,
  PurchaseScope,
  Review,
  SearchFilters,
  SearchResult,
  SubscriptionPlan,
  Suggestion,
  VerificationLog,
  Worker,
} from "./types";
import type { Category } from "./types";

// Demo ad campaigns + invoices live in the shared globalThis store
// (src/lib/data/campaigns.ts) — see its module docblock for why: the server
// action (create), the payment webhook (confirm) and the /company page
// (render) run in different Turbopack entry graphs and must share one home.

/**
 * Audit trail for worker-verification decisions (production: prisma.verificationLog).
 * Newest first — every approve/reject appends here via decideVerification().
 */
const VERIFICATION_LOGS: VerificationLog[] = [
  {
    id: "vl-seed-1",
    workerSlug: "omar-al-mutairi-ac",
    workerNameEn: "Omar Al-Mutairi",
    workerNameAr: "عمر المطيري",
    action: "approved",
    adminName: "Platform Admin",
    time: "2026-08-05T09:12:00.000Z",
  },
  {
    id: "vl-seed-2",
    workerSlug: "sami-al-dossary-glass",
    workerNameEn: "Sami Al-Dossary",
    workerNameAr: "سامي الدوسري",
    action: "rejected",
    adminName: "Platform Admin",
    time: "2026-08-03T14:45:00.000Z",
  },
  {
    id: "vl-seed-3",
    workerSlug: "anas-barakat-interior",
    workerNameEn: "Anas Barakat",
    workerNameAr: "أنس بركات",
    action: "approved",
    adminName: "Platform Admin",
    time: "2026-07-28T11:03:00.000Z",
  },
];

export const isDemoMode = process.env.DEMO_MODE !== "false";

/**
 * Real-data gate: DEMO_MODE=false + a configured DATABASE_URL. When on, the
 * catalog read paths below delegate to the Prisma implementations in
 * prisma-repo.ts (lazy-imported so demo mode never requires a generated Prisma
 * client or a reachable database). See docs/ARCHITECTURE.md → W1 flip.
 */
export const realDataEnabled = !isDemoMode && Boolean(process.env.DATABASE_URL);

/** Lazy-load the production data layer (never touches @prisma/client in demo). */
function prismaRepo() {
  return import("./prisma-repo");
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * DATA ACCESS LAYER
 * ────────────────────────────────────────────────────────────────────────────
 * Every page/API reads through this repository. In demo mode the app runs on
 * an embedded bilingual dataset (no database needed). In production, swap each
 * function body for its Prisma equivalent — the signatures stay identical, so
 * the UI never changes. See src/lib/server/prisma.ts and prisma/schema.prisma.
 *
 * Example production swap:
 *   export async function getWorkerBySlug(slug: string) {
 *     const prisma = await getPrisma();
 *     return prisma.worker.findUnique({ where: { slug }, include: {...} });
 *   }
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — stamp the response rate
 * and "free this week" on demo workers at the seam. Pure over the demo
 * stores (in-memory, cheap); every returned worker is a FRESH copy so the
 * shared WORKERS array is never mutated. Real mode stamps inside the prisma
 * adapters instead (batched, see prisma-repo.ts → stampWorkerSignals).
 */
function withDemoSignals(workers: Worker[]): Worker[] {
  return workers.map((w) => ({
    ...w,
    // Moderation gate on the read side, the twin of the real adapter's
    // `where: { status: "APPROVED" }` include: a pending or rejected review is
    // never handed to a page. Reviews seeded before moderation existed carry no
    // status and stay visible (effectiveStatus → approved).
    reviews: visibleReviews(w.reviews),
    responseRate: computeResponseRate(demoGetWorkerBookings(w.id)),
    availableThisWeek: hasFreeSlotsThisWeek(demoGetWorkerSlots(w.id)),
  }));
}

export async function getCategories(): Promise<Category[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCategories();
  return categoriesWithCounts();
}

export async function getCities(): Promise<City[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCities();
  return CITIES;
}

export async function getWorkers(filters: SearchFilters = {}): Promise<SearchResult> {
  if (realDataEnabled) return (await prismaRepo()).prismaSearchWorkers(filters);
  // In-memory cache: same filters → same result within 60s window.
  const { searchCache, buildSearchCacheKey } = await import("@/lib/cache/search-cache");
  const cacheKey = buildSearchCacheKey(filters as Record<string, unknown>);
  const cached = searchCache.get<SearchResult>(cacheKey);
  if (cached) return cached;
  const res = searchWorkers(filters);
  const result = { ...res, items: withDemoSignals(res.items) };
  searchCache.set(cacheKey, result);
  return result;
}

export async function getWorkerBySlug(slug: string): Promise<Worker | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerBySlug(slug);
  const w = workerBySlug(slug);
  return w ? withDemoSignals([w])[0] : null;
}

export async function getWorkerById(id: string): Promise<Worker | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerById(id);
  const w = workerById(id);
  return w ? withDemoSignals([w])[0] : null;
}

/** Resolve the worker profile owned by an authenticated user. */
export async function getWorkerByUserId(userId: string): Promise<Worker | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerByUserId(userId);
  return userId === "u-worker" || userId === "w-khaled"
    ? withDemoSignals([workerBySlug("khaled-al-harbi-plumbing")!])[0] ?? null
    : null;
}

export async function getFeaturedWorkersList(limit = 4): Promise<Worker[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetFeaturedWorkers(limit);
  return withDemoSignals(getFeaturedWorkers(limit));
}

/** Every worker in the dataset (favorites page needs the full list). */
export async function getAllWorkers(): Promise<Worker[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetAllWorkers();
  return withDemoSignals(WORKERS);
}

export async function getRelated(worker: Worker, limit = 4): Promise<Worker[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetRelated(worker, limit);
  return withDemoSignals(getRelatedWorkers(worker, limit));
}

export async function getSuggestionsList(query: string, locale: "en" | "ar"): Promise<Suggestion[]> {
  return getSuggestions(query, locale);
}

export async function getPopularSearches(): Promise<typeof POPULAR_SEARCHES> {
  return POPULAR_SEARCHES;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  // Merge the LIVE verification + booking funnels into the static analytics
  // shell — the async adapters can't live in getAnalytics().
  const base = getAnalytics();
  base.verificationFunnel = await getVerificationFunnel(30);
  base.bookingFunnel = await getBookingFunnel(30);
  return base;
}

/** Append-only subscription lifecycle event seam (demo ⇄ Prisma). */
export async function recordSubscriptionLifecycleEvent(input: RecordSubscriptionEventInput) {
  return recordSubscriptionEvent(input);
}

/** Retention reporting reads the same lifecycle event source in both modes. */
export async function getSubscriptionCohorts(months = 6, now = new Date()): Promise<SubscriptionCohort[]> {
  const events = await listSubscriptionEvents({ limit: 5000 });
  return subscriptionAnalytics(events, months, now).cohorts;
}

/** Retention and monetization reporting from the append-only lifecycle ledger. */
export async function getSubscriptionAnalytics(months = 6, now = new Date()): Promise<SubscriptionAnalytics> {
  const events = await listSubscriptionEvents({ limit: 5000 });
  return subscriptionAnalytics(events, months, now);
}

/**
 * Demo-only mutable interactions (in-memory). Production persists via Prisma.
 *
 * In real mode these are NOT wired yet (W2) — and must never silently mutate
 * the demo dataset behind a real-mode UI. They no-op with a server-side
 * warning instead, so a demo review/lead never lands in the wrong store.
 */
function realModeMutationUnsupported(name: string) {
  console.warn(`[repo] ${name} is not wired to the database yet (W2) — no-op in real mode. See docs/ARCHITECTURE.md §10.`);
}

/**
 * Submit a review. It lands PENDING: moderation is the gate that publishes it
 * (review-moderation-store.ts), so a claimed review neither appears on the
 * profile nor moves the worker's rating until an admin approves it — and the
 * worker is only told about it when it goes live, not when it is claimed.
 *
 * Returns the stored review, or null when nothing persisted: an unknown worker,
 * or real mode without a signed-in author (the `authorId` FK needs a real User,
 * so an anonymous review cannot be stored). The caller reports !ok rather than
 * claiming success for a review that was never written.
 */
export async function addReview(
  workerId: string,
  review: Omit<Review, "id" | "date">,
  options?: { authorId?: string }
): Promise<Review | null> {
  if (realDataEnabled) {
    if (!options?.authorId) {
      realModeMutationUnsupported("addReview (anonymous — no authorId)");
      return null;
    }
    return (await prismaRepo()).prismaCreatePendingReview(workerId, review, options.authorId);
  }
  const w = workerById(workerId);
  if (!w) return null;
  const stored: Review = {
    ...review,
    id: `u-${Date.now()}`,
    date: new Date().toISOString(),
    status: review.status ?? "pending",
    flags: review.flags ?? scanReviewText(reviewBody(review)),
  };
  w.reviews.unshift(stored);
  return stored;
}

export async function addLead(workerId: string): Promise<Worker | null> {
  if (realDataEnabled) {
    realModeMutationUnsupported("addLead");
    return null;
  }
  const w = workerById(workerId);
  if (!w) return null;
  w.leads += 1;
  // Notify the worker: a potential customer wants a quote.
  await pushNotification(
    {
      type: "lead",
      titleEn: "New service request",
      titleAr: "طلب خدمة جديد",
      bodyEn: "A customer requested a quote from your profile — reply to win the job.",
      bodyAr: "طلب عميل عرض سعر من ملفك — ردّ لتكسب الصفقة.",
      href: "/dashboard",
    },
    { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
  );
  return w;
}

export async function registerView(workerId: string): Promise<void> {
  if (realDataEnabled) {
    // Views are analytics, not user data — a silent no-op is the right call
    // here (throwing would spam the profile page on every load in real mode).
    realModeMutationUnsupported("registerView");
    return;
  }
  const w = workerById(workerId);
  if (w) w.views += 1;
}

export async function getActiveWorkersCount(): Promise<number> {
  return WORKERS.filter((w) => w.available).length;
}

/**
 * All campaigns, newest first — demo store or the prisma AdCampaign rows in
 * real mode (placement/type/impressions derive from the campaign's ads).
 */
export async function getCampaigns(): Promise<Campaign[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCampaigns();
  return demoGetCampaigns();
}

/**
 * Create a campaign (company dashboard). The campaign starts PENDING and a
 * hosted checkout URL is returned — it does NOT serve ads (getActiveAdsFor
 * only matches ACTIVE) until the payment webhook confirms the purchase
 * (confirmCampaignPayment). Dual adapter: real mode persists the AdCampaign +
 * primary Advertisement + PENDING Payment rows and mints the checkout via
 * prisma (docs/PAYMENTS.md → ad purchases); `input.companyId` (the acting
 * company's user id) resolves the Company row there. Returns null when the
 * checkout could not be minted.
 */
export async function createCampaign(input: CampaignCreateInput): Promise<{ campaign: Campaign; checkoutUrl: string } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaCreateCampaign(input);
  return demoCreateCampaign(input);
}

/**
 * Mint (or re-mint) the hosted checkout for a PENDING campaign — the "Pay
 * now" button path (idempotent per campaign). Returns null for unknown or
 * already-active campaigns. Dual adapter — real mode persists the provider
 * ref on the Payment row (prismaCreateCampaignCheckout).
 */
export async function createCampaignCheckout(
  campaignId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "STRIPE"
): Promise<{ url: string } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaCreateCampaignCheckout(campaignId, method);
  return demoCreateCampaignCheckout(campaignId, method);
}

/**
 * The payment webhook/checkout callback landed for an ad purchase: flips the
 * PENDING campaign to ACTIVE (it starts serving ads), the payment to PAID and
 * mints the purchase's PAID invoice (what the /admin credit-note flip voids
 * on refund). Idempotent — a webhook redelivery returns the already-active
 * campaign without re-invoicing or re-notifying. Dual adapter — real mode
 * runs the flips + invoice inside $transaction (prismaConfirmCampaignPayment).
 */
export async function confirmCampaignPayment(
  campaignId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<Campaign | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaConfirmCampaignPayment(campaignId, providerRef, opts);
  return demoConfirmCampaignPayment(campaignId, providerRef, opts);
}

/**
 * The campaign's purchase Payment row, if one exists — demo store or the
 * prisma Payment row (advertisementId → campaign) in real mode.
 */
export async function getCampaignPayment(campaignId: string): Promise<CampaignPayment | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCampaignPayment(campaignId);
  return demoCampaignPayment(campaignId);
}

/**
 * The company a campaign's refund notification is addressed to — demo store
 * (the demo company constant) or the prisma AdCampaign's company user in real
 * mode. Used by the /admin refund-email preview to show the recipient line.
 */
export async function getCampaignRecipient(
  campaignId: string
): Promise<{ name: string; email: string; locale: "en" | "ar" } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCampaignRecipient(campaignId);
  return demoCampaignRecipient();
}

/**
 * Admin side: refund a campaign purchase — the provider charge is refunded,
 * the payment flips to REFUNDED and the campaign stops serving (ended). The
 * admin-stated `reason` is recorded on the payment, in the activity feed
 * entry and in the campaignRefunded notification the company receives.
 * Idempotent; returns null when the payment isn't PAID. Dual adapter — demo
 * keeps the in-memory store, real mode delegates to prisma.
 */
export async function refundCampaignPayment(
  campaignId: string,
  by?: string,
  reason?: string
): Promise<CampaignPayment | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaRefundCampaignPayment(campaignId, { by, reason });
  return demoRefundCampaignPayment(campaignId, { by, reason });
}

/**
 * Ad rotation: active campaigns matching a placement, newest-first. Dual
 * adapter — real mode serves ACTIVE campaigns whose ACTIVE creatives match
 * (prismaGetActiveAdsFor reads real Advertisement rows; the demo store serves
 * its seeded campaigns). PENDING campaigns never serve until the payment
 * webhook confirms.
 */
export async function getActiveAdsFor(placement: string, opts: { category?: string; city?: string } = {}): Promise<Campaign[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetActiveAdsFor(placement, opts);
  return demoGetActiveAdsFor(placement, opts);
}

/** Track a served impression (ad rotation). Returns the updated campaign. Dual
 * adapter — real mode bumps the served Advertisement's counters + the
 * campaign's spent (prismaRecordImpression). */
export async function recordImpression(campaignId: string): Promise<Campaign | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaRecordImpression(campaignId);
  return demoRecordImpression(campaignId);
}

/** Track a click. Returns the updated campaign. Dual adapter — real mode
 * bumps the served Advertisement's counters + the campaign's spent
 * (prismaRecordClick). */
export async function recordClick(campaignId: string): Promise<Campaign | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaRecordClick(campaignId);
  return demoRecordClick(campaignId);
}

/**
 * All invoices (advertising + subscription renewals), newest first — demo
 * store or, in real mode, the seeded company's Prisma Invoice rows
 * (prismaGetInvoices — the self-serve purchase receipts + their credit-note
 * VOIDs read back here). The /company page filters to advertising.
 */
export async function getInvoices(): Promise<Invoice[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetInvoices();
  return demoGetInvoices();
}

/** ── Notifications ────────────────────────────────────────────────────────── */
/**
 * `ownerId` scopes the inbox to one user in prisma mode. In production the
 * caller threads the session user id (NextAuth wired in Phase 1); demo mode
 * ignores it and returns the single global feed (backward compat for E2E).
 */
export async function getNotificationsList(ownerId?: string): Promise<Notification[]> {
  return await getNotifications(ownerId);
}

export async function getNotificationsUnreadCount(ownerId?: string): Promise<number> {
  return await getUnreadCount(ownerId);
}

export async function markNotificationReadAction(id: string, ownerId?: string): Promise<void> {
  await markNotificationRead(id, ownerId);
}

export async function markAllNotificationsReadAction(ownerId?: string): Promise<void> {
  await markAllNotificationsRead(ownerId);
}

/** ── Subscriptions ────────────────────────────────────────────────────────── */
/** Renew a worker's subscription by slug (demo worker dashboard). The billing
 * period (monthly/annual) sets the term + price — annual pays 10 months for 12. */
export async function renewWorkerSubscriptionBySlug(
  slug: string,
  plan: SubscriptionPlan,
  period: BillingPeriod = "monthly"
): Promise<{ worker: Worker | null; invoice: Invoice | null; days: number }> {
  const w = workerBySlug(slug);
  if (!w) return { worker: null, invoice: null, days: 0 };
  // ── First plan = free trial (docs/subscription-trial.md) ────────────────
  // A worker with NO subscription is a new worker; their first plan start is
  // the trial: the admin-configured number of days at $0 on the chosen plan,
  // no invoice, no payment rail. trialDays = 0 disables the trial entirely.
  // Any worker who ever had a plan (active, expiring or expired) pays from day
  // one — the trial is once per worker, not once per lapse.
  if (!w.subscription) {
    const catalog = await loadPlanCatalog();
    // The catalog may override the global trial, but the recommended Phase 1
    // defaults differentiate higher-value plans (Pro 14d; Business assisted).
    const trialDays = catalog.trialDaysByPlan?.[plan] ??
      (catalog.trialDays === 30 ? trialDaysForPlan(plan) : catalog.trialDays);
    if (trialDays > 0) {
      w.subscription = startTrialSubscription(plan, new Date(), trialDays);
      await recordSubscriptionEvent({
        workerId: w.id,
        type: "trial_started",
        toPlan: plan,
        periodDays: trialDays,
        amount: 0,
        source: "onboarding",
      });
      await pushNotification(
        {
          type: "subscription",
          titleEn: `Free trial started — ${plan}`,
          titleAr: `بدأت الفترة التجريبية المجانية — ${plan}`,
          bodyEn: `${w.nameEn}: your ${trialDays}-day free trial of the ${plan} plan is active until ${formatDate(w.subscription.expiresAt, "en")}. No charge — renew any time to keep your plan.`,
          bodyAr: `${w.nameAr}: فترتك التجريبية المجانية (${trialDays} يوماً) على خطة ${plan} نشطة حتى ${formatDate(w.subscription.expiresAt, "ar")}. بدون رسوم — جدّد في أي وقت للاحتفاظ بخطتك.`,
          href: "/dashboard",
        },
        { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
      );
      return {
        worker: w,
        invoice: null,
        days: trialDays,
      };
    }
  }
  // renewSubscription issues the invoice internally — don't create a second one.
  // The invoice lands in the shared campaign/invoice store so any graph (the
  // action that renewed, the dashboard page that renders) reads the same list.
  // Priced through the ADMIN catalog: a repriced plan charges the new price.
  const { subscription, invoice } = renewSubscription(w, plan, period, await loadPlanCatalog());
  demoAddInvoice(invoice);
  await recordSubscriptionEvent({
    workerId: w.id,
    type: "renewed",
    toPlan: plan,
    periodDays: period === "annual" ? 365 : 30,
    amount: Math.round(invoice.amount * 100),
    source: "manual_payment",
  });
  await pushNotification(
    {
      type: "subscription",
      titleEn: `Subscription renewed — ${plan}`,
      titleAr: `تم تجديد الاشتراك — ${plan}`,
      // Each body carries its OWN locale's date (the Lebanese Arabic one spells
      // آذار/أيار, not the Egyptian مارس/مايو a bare runtime-locale call gave).
      bodyEn: `${w.nameEn}: your ${plan} plan is active until ${formatDate(subscription.expiresAt, "en")}.`,
      bodyAr: `${w.nameAr}: خطتك ${plan} نشطة حتى ${formatDate(subscription.expiresAt, "ar")}.`,
      href: "/dashboard",
    },
    { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
  );
  return {
    worker: w,
    invoice,
    days: Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  };
}

/**
 * Admin plan correction (the worker-management table's inline plan change) —
 * set the worker's subscription tier directly. An expired subscription is
 * reactivated for one monthly period (so the correction takes effect in
 * search); an active one keeps its expiry. No invoice — a correction, not a
 * purchase. Dual adapter: demo mutates the in-memory WORKERS entry, real mode
 * upserts the Subscription row.
 */
export async function changeWorkerPlan(
  workerId: string,
  plan: SubscriptionPlan,
  opts: { actor: string; actorId?: string } = { actor: "Platform Admin" }
): Promise<Worker | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaChangeWorkerPlan(workerId, plan, opts);
  const w = workerById(workerId);
  if (!w) return null;
  const from = w.subscription.plan;
  w.subscription = applyPlanChange(w.subscription, plan);
  await recordSubscriptionEvent({
    workerId: w.id,
    type: "plan_changed",
    fromPlan: from,
    toPlan: plan,
    periodDays: 30,
    amount: Math.round(w.subscription.price * 100),
    source: "admin",
  });
  // Audit trail — the same ADMIN_PLAN_CHANGED entry both adapters write (via
  // this seam and prismaChangeWorkerPlan), carrying the admin identity (and
  // their real user id as the FK when available) + worker + from → to plan.
  await logAdminActivity({
    code: ACTION_CODES.ADMIN_PLAN_CHANGED,
    actionEn: `${opts.actor} changed ${w.nameEn}'s plan: ${PLANS[from].labelEn} → ${PLANS[plan].labelEn}`,
    actionAr: `${opts.actor} غيّر خطة ${w.nameAr}: من ${PLANS[from].labelAr} إلى ${PLANS[plan].labelAr}`,
    actor: opts.actor,
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    type: "worker",
  });
  // Notify the worker — the plan badge on their dashboard reflects the change.
  await pushNotification(
    {
      type: "subscription",
      titleEn: `Plan updated — ${plan}`,
      titleAr: `تم تحديث الخطة — ${plan}`,
      bodyEn: `${w.nameEn}: your plan was changed to ${plan} by the platform team.`,
      bodyAr: `${w.nameAr}: تم تغيير خطتك إلى ${plan} من قبل فريق المنصة.`,
      href: "/dashboard",
    },
    { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
  );
  return withDemoSignals([w])[0];
}

/** ── Verification workflow ────────────────────────────────────────────────── */
/** Workers awaiting admin review (production: prisma.verificationRequest). */
export async function getVerificationQueue(): Promise<Worker[]> {
  return WORKERS.filter((w) => w.verification === "pending");
}

/** Full verification audit trail, newest first. */
export async function getVerificationLogs(): Promise<VerificationLog[]> {
  return [...VERIFICATION_LOGS].sort((a, b) => b.time.localeCompare(a.time));
}

export async function decideVerification(
  workerSlug: string,
  approve: boolean,
  adminName: string,
  adminId?: string
): Promise<Worker | null> {
  const w = workerBySlug(workerSlug);
  if (!w) return null;
  w.verification = approve ? "verified" : "rejected";
  w.verified = approve;
  // Audit trail: record who decided, when, and the outcome — in the repo's
  // verification log AND the live admin activity feed (which persists to
  // ActivityLog in production), so decisions surface in Recent activity.
  // `adminId` (when provided) stamps the ActivityLog.actorId FK column.
  VERIFICATION_LOGS.unshift({
    id: `vl-${Date.now()}`,
    workerSlug: w.slug,
    workerNameEn: w.nameEn,
    workerNameAr: w.nameAr,
    action: approve ? "approved" : "rejected",
    adminName,
    adminId,
    time: new Date().toISOString(),
  });
  await logAdminActivity({
    code: approve ? ACTION_CODES.WORKER_VERIFIED : ACTION_CODES.VERIFICATION_DECLINED,
    actionEn: `${w.nameEn} ${approve ? "verified" : "declined"} by ${adminName}`,
    actionAr: `${w.nameAr} ${approve ? "تم توثيقه" : "تم رفضه"} بواسطة ${adminName}`,
    actor: adminName,
    actorId: adminId,
    type: "verification",
  });
  await pushNotification(
    {
      type: "verification",
      titleEn: approve ? "Profile verified ✓" : "Verification request declined",
      titleAr: approve ? "تم توثيق الملف ✓" : "تم رفض طلب التوثيق",
      bodyEn: approve
        ? `${w.nameEn}: your profile now shows the Verified badge.`
        : `${w.nameEn}: your documents were declined. Please resubmit.`,
      bodyAr: approve
        ? `${w.nameAr}: ملفك يعرض الآن شارة التوثيق.`
        : `${w.nameAr}: تم رفض مستنداتك. يرجى إعادة الإرسال.`,
      href: "/dashboard",
    },
    { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
  );
  return w;
}

/** Worker-side: submit (or resubmit) a verification request. */
export async function submitVerificationRequest(workerSlug: string): Promise<Worker | null> {
  const w = workerBySlug(workerSlug);
  if (!w) return null;
  w.verification = "pending";
  w.verified = false;
  // Audit the worker-side of the workflow — distinct from the admin's decision
  // (WORKER_VERIFIED / VERIFICATION_DECLINED). The worker is the display actor
  // but carries NO actorId: this is not an admin action, and demo workers have
  // no real user row, so the ActivityLog.actorId FK stays null.
  await logAdminActivity({
    code: ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED,
    actionEn: `${w.nameEn} submitted a verification request`,
    actionAr: `${w.nameAr} أرسل طلب توثيق`,
    actor: w.nameEn,
    type: "verification",
  });
  await pushNotification(
    {
      type: "verification",
      titleEn: "Verification request submitted",
      titleAr: "تم إرسال طلب التوثيق",
      bodyEn: `${w.nameEn}: your documents are under review.`,
      bodyAr: `${w.nameAr}: مستنداتك قيد المراجعة.`,
      href: "/admin",
    },
    { name: "Platform Admin", email: "admin@workersarena.com" }
  );
  return w;
}

/** Preferred notification locale from a worker's first listed language. */
function primaryLocale(w: Worker): "en" | "ar" {
  return w.languages[0]?.code === "ar" ? "ar" : "en";
}

/** ── Bookings & scheduling (M1 demo adapter · W2 Prisma adapter) ───────────── */
/**
 * Booking seam — dual adapter (docs/booking-scheduling.md §4): demo keeps the
 * in-memory store, real mode delegates to prisma-repo. Reads, the
 * request/respond mutations (W2), the M2 availability editor
 * (generateSlots / setSlotBlocked), and the customer-side lookup are all
 * wired in real mode.
 */
export async function getWorkerSlots(
  workerId: string,
  range: { from?: string; to?: string } = {}
): Promise<BookingSlot[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerSlots(workerId, range);
  return demoGetWorkerSlots(workerId, range);
}

export async function getWorkerBookings(
  workerId: string,
  opts: { status?: BookingStatus; limit?: number } = {}
): Promise<Booking[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerBookings(workerId, opts);
  return demoGetWorkerBookings(workerId, opts);
}

export async function getCustomerBookings(
  identifier: { email?: string; phone?: string } = {}
): Promise<Booking[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetCustomerBookings(identifier);
  return demoGetCustomerBookings(identifier);
}

/**
 * A single booking by its human-readable number — the admin dispute view
 * (/admin/bookings/[number]), which the activity feed's booking entries
 * deep-link to.
 */
export async function getBookingByNumber(number: string): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetBookingByNumber(number);
  return demoGetBookingByNumber(number);
}

/**
 * A single booking by its internal id — the §2.3 chat permission gate's
 * lookup (the thread's send action re-checks ownership before writing).
 */
export async function getBookingById(id: string): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetBookingById(id);
  return demoGetBookingById(id);
}

/**
 * §2.3 chat — the customer ⇄ worker negotiation thread keyed on Booking.id.
 * Oldest first, the order the shared BookingChat component renders on all
 * three surfaces (customer row, worker row, admin dispute view).
 */
export async function getBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetBookingMessages(bookingId);
  return demoGetBookingMessages(bookingId);
}

/**
 * §2.3 chat — append a message to a booking's thread. The sender is
 * actor-stamped like an audit entry (role + optional real user id), so the
 * negotiation stays inside the booking's record on both adapters. Returns
 * null when the booking is unknown. Quote is minor units — a price shared
 * in-thread (quote sharing). Callers gate permissions; the message is NOT
 * written when the booking is unknown.
 */
export async function sendBookingMessage(
  bookingId: string,
  input: BookingMessageInput
): Promise<BookingMessage | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaSendBookingMessage(bookingId, input);
  return demoSendBookingMessage(bookingId, input);
}

/**
 * §2.3 chat — the customer accepts the worker's quoted price in-thread: the
 * REQUESTED booking converts to CONFIRMED with the message's quote, the slot
 * is booked, the take-rate fee is stamped, and a customer audit event lands
 * in the trail. Returns null when the booking isn't negotiable or the message
 * isn't a worker quote (callers surface "not-found"). Callers gate
 * permissions — only the booking's customer should invoke this.
 */
export async function acceptChatQuote(bookingId: string, messageId: string): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaAcceptChatQuote(bookingId, messageId);
  return demoAcceptChatQuote(bookingId, messageId);
}

/**
 * §2.3 presence snapshot for the chat poll — who is typing (TTL-guarded) plus
 * the readAt per message id, so the sender sees "Seen" on their own bubbles
 * without a page refresh. Extends the ephemeral typing state with the adapter
 * read-receipt map.
 */
export interface ChatPresenceSnapshot extends ChatTypingState {
  /** readAt (ISO) keyed by message id — null stamps are simply absent. */
  readAt: Record<string, string>;
}

/**
 * §2.3 read receipts — stamp readAt on every message the OTHER party sent
 * (their messages are "seen" when the counterpart opens the thread).
 * Idempotent; returns the number of messages newly marked.
 */
export async function markChatRead(
  bookingId: string,
  readerRole: "customer" | "worker"
): Promise<number> {
  if (realDataEnabled) return (await prismaRepo()).prismaMarkChatRead(bookingId, readerRole);
  return demoMarkChatRead(bookingId, readerRole);
}

/**
 * §2.3 typing indicator — the ephemeral presence flag (who is composing).
 * Shared on both backends: typing state is process-local and never persisted,
 * so there is no demo/prisma split — the same module serves both.
 */
export function setChatTyping(
  bookingId: string,
  role: "customer" | "worker",
  active: boolean
): void {
  setChatTypingFlag(bookingId, role, active);
}

/**
 * §2.3 presence snapshot for the chat poll — who is typing (TTL-guarded) plus
 * the readAt per message id, so the sender sees "Seen" on their own bubbles
 * without a page refresh. The readAt map comes from the active adapter; the
 * typing flag from the shared ephemeral module.
 */
export async function getChatPresence(bookingId: string): Promise<ChatPresenceSnapshot> {
  const typing = getChatTypingFlag(bookingId);
  const readAt: Record<string, string> = {};
  if (realDataEnabled) {
    const prisma = await prismaRepo();
    for (const r of await prisma.prismaGetBookingMessageReadAt(bookingId)) {
      readAt[r.id] = r.readAt.toISOString();
    }
  } else {
    for (const m of demoGetBookingMessages(bookingId)) {
      if (m.readAt) readAt[m.id] = m.readAt;
    }
  }
  return { typingRole: typing.typingRole, typingAt: typing.typingAt, readAt };
}

/**
 * §2.4 admin export — EVERY booking's full event trail (the CSV/PDF trails
 * export on /admin). Demo reads the whole in-memory store; prisma reads all
 * Booking rows with the same include set as the per-booking read (events,
 * service item, M3 receipt) so the combined document matches the dispute
 * view. For very large stores (>10k bookings) callers should paginate upstream.
 */
export async function getAllBookings(): Promise<Booking[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetAllBookings();
  return demoGetAllBookings();
}

/**
 * M4 admin funnel — booking counts by status + REQUESTED→CONFIRMED conversion
 * over the last `days` (mirrors getVerificationFunnel). Demo adapter tallies
 * the in-memory store; prisma groupBy's Booking.createdAt. NaN-safe day clamp
 * (mirrors getVerificationFunnel / pruneActivityLog) so a bad env can't zero
 * or blow the window: NaN would make the demo count EVERYTHING (created < NaN
 * is always false) while the prisma path would build an Invalid Date — the
 * clamp makes both adapters see the same sane window.
 */
export async function getBookingFunnel(days = 30): Promise<BookingFunnel> {
  const raw = Math.floor(days);
  const clamped = Number.isFinite(raw) ? Math.max(1, raw) : 30;
  if (realDataEnabled) return (await prismaRepo()).prismaGetBookingFunnel(clamped);
  return demoGetBookingFunnel(clamped);
}

/**
 * M5 admin revenue — platform take-rate fees over the last `days` (gross,
 * refunded, net, per-booking average) — the booking funnel card's money twin.
 */
export async function getPlatformFeeStats(days = 30): Promise<PlatformFeeStats> {
  const raw = Math.floor(days);
  const clamped = Number.isFinite(raw) ? Math.max(1, raw) : 30;
  if (realDataEnabled) return (await prismaRepo()).prismaGetPlatformFeeStats(clamped);
  return demoGetPlatformFeeStats(clamped);
}

/**
 * §Instant booking — the worker's opt-in to selling published fixed prices
 * without a request/response round-trip (docs/ENHANCEMENT-PLAN.md Phase 2).
 */
export async function setWorkerInstantBook(workerId: string, enabled: boolean): Promise<Worker | null> {
  if (!workerId) return null;
  if (realDataEnabled) return (await prismaRepo()).prismaSetWorkerInstantBook(workerId, enabled);
  return demoSetWorkerInstantBook(workerId, enabled);
}

/**
 * §Instant booking — publish or withdraw one fixed-price package. The worker's
 * opt-in is consent; this is the price it consents to sell at.
 */
export async function setWorkerServicePackage(
  workerId: string,
  nameEn: string,
  price: number,
  fixedPrice: boolean
): Promise<Worker | null> {
  if (!workerId || !nameEn) return null;
  if (realDataEnabled) return (await prismaRepo()).prismaSetWorkerServicePackage(workerId, nameEn, price, fixedPrice);
  return demoSetWorkerServicePackage(workerId, nameEn, price, fixedPrice);
}

/** §Instant booking — one slot by id, for the eligibility re-check. */
export async function getBookingSlot(slotId: string): Promise<BookingSlot | null> {
  if (!slotId) return null;
  if (realDataEnabled) return (await prismaRepo()).prismaGetBookingSlot(slotId);
  return demoGetBookingSlot(slotId);
}

/* ────────────── §Price benchmarks — "what does this normally cost?" ────────────── */

/**
 * §Price benchmarks (docs/ENHANCEMENT-PLAN.md Phase 2) — the typical price band
 * per trade, built from the completed jobs the platform has already priced.
 *
 * Read-only and derived: nothing is stored, so a benchmark can never go stale
 * against the jobs it describes. Both adapters gather the same rows (COMPLETED
 * jobs with a real quote, inside the window) and the SAME pure engine computes
 * the band (src/lib/data/price-benchmarks.ts) — a category below the sample
 * floor is simply absent, and the surfaces must render nothing rather than
 * something the data cannot support.
 */
export async function getPriceBenchmarks(days = 180): Promise<PriceBenchmark[]> {
  const jobs = realDataEnabled
    ? await (await prismaRepo()).prismaPriceBenchmarkJobs(days)
    : demoPriceBenchmarkJobs(days);
  return computePriceBenchmarks(jobs);
}

/** The benchmark for one trade, or null when the data cannot state one. */
export async function getPriceBenchmark(categorySlug: string | null | undefined): Promise<PriceBenchmark | null> {
  if (!categorySlug) return null;
  return benchmarkFor(await getPriceBenchmarks(), categorySlug);
}

/* ───────────────────── §Settlement — the money behind a job ───────────────────── */

/**
 * Where a booking's money stands (src/lib/data/booking-settlement.ts). Every
 * money surface reads this instead of the raw payment rows: the customer's
 * pay-to-release card, the worker's "awaiting settlement" banner, the payout
 * guard and the admin reconciliation.
 */
export async function getBookingSettlement(bookingId: string): Promise<Settlement | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaSettlementFor(bookingId);
  return demoSettlementFor(bookingId);
}

/**
 * Mint the checkout for a finished job's outstanding balance (the second
 * payment leg). Same rails as the deposit: Stripe-shaped URL, or a signed
 * OMT/Whish manual reference the admin confirms from the pending-payments card.
 */
export async function createBookingSettlementCheckout(
  bookingId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "OMT"
): Promise<{ url: string } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaCreateBookingSettlementCheckout(bookingId, method);
  return demoCreateBookingSettlementCheckout(bookingId, method);
}

/**
 * The balance landed (webhook or admin confirming an OMT/Whish receipt). The
 * booking's earnings are (re)computed against what is now collected — this is
 * the call that can finally pay a worker for a quote-only job.
 */
export async function confirmBookingSettlement(
  bookingId: string,
  providerRef: string
): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaConfirmBookingSettlement(bookingId, providerRef);
  return demoConfirmBookingSettlement(bookingId, providerRef);
}

/**
 * Declare that the parties settled directly (cash). The platform collected
 * nothing, so it credits nothing and its fee becomes a claim.
 */
export async function markBookingSettledOutside(
  bookingId: string,
  opts: { by?: "worker" | "admin"; reason?: string } = {}
): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaMarkBookingSettledOutside(bookingId, opts);
  return demoMarkBookingSettledOutside(bookingId, opts);
}

/**
 * The settlement payment record for a booking (null when none was minted) —
 * the customer's card needs the reference/method to render its instructions.
 */
export async function getBookingSettlementPayment(bookingId: string): Promise<BookingSettlementPayment | null> {
  if (realDataEnabled) {
    const booking = await (await prismaRepo()).prismaGetBookingById(bookingId);
    return booking?.settlement ?? null;
  }
  return demoGetBookingSettlementPayment(bookingId);
}

/**
 * §Settlement — the admin reconciliation read (docs/booking-take-rate.md §6).
 *
 * Every job that finished in the window with its money spelled out: what the
 * customer paid, what the platform actually holds, what the take rate *says* it
 * earned, and what the earnings ledger already credits. The panel tallies it
 * with `reconcileSettlements` / `reconciliationQueue` (the pure engine), so the
 * numbers a reader sees and the numbers the ledger acts on are the same ones.
 */
export async function getSettlementReconciliation(days = 30): Promise<SettlementJob[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaSettlementReconciliation(days);
  return demoSettlementReconciliation(days);
}

/**
 * Worker payouts (docs/payouts.md) — the worker's spendable balance from the
 * ledger: available = Σ posted earnings/adjustments − Σ processed withdrawals;
 * pending = Σ pending withdrawals (reserved while in review).
 *
 * The balance is FUNDED BY CONSTRUCTION: `creditEarnings` only ever posts money
 * the platform collected (src/lib/data/booking-settlement.ts), so there is no
 * path that accrues a payout against cash the platform never received.
 */
export async function getWorkerBalance(workerId: string): Promise<WorkerBalance> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerBalance(workerId);
  return demoGetWorkerBalance(workerId);
}

/** Worker requests a withdrawal of part of the available balance. */
export async function requestPayout(
  workerId: string,
  amountMinor: number,
  reason?: string
): Promise<LedgerEntry | { error: "invalid" | "insufficient" }> {
  // §Settlement — the guard has ONE statement (payoutGuard), and it counts a
  // pending reservation as unspendable, so the rule cannot drift between the
  // adapters or from the UI's affordability hint.
  const balance = await getWorkerBalance(workerId);
  const allowed = payoutGuard({
    availableMinor: balance.availableMinor,
    pendingMinor: balance.pendingMinor,
    requestedMinor: amountMinor,
  });
  if (!allowed.ok) return { error: allowed.error };
  if (realDataEnabled) return (await prismaRepo()).prismaRequestPayout(workerId, amountMinor, reason);
  return demoRequestPayout(workerId, amountMinor, reason);
}

/** Admin decides a PENDING payout: approve → PROCESSED, reject → REJECTED. */
export async function decidePayout(
  payoutId: string,
  approve: boolean,
  reason?: string,
  reviewedBy?: string
): Promise<LedgerEntry | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaDecidePayout(payoutId, approve, reason, reviewedBy);
  return demoDecidePayout(payoutId, approve, reason);
}

/** A worker's payout history — withdrawals newest first. */
export async function getWorkerPayouts(workerId: string): Promise<LedgerEntry[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetWorkerPayouts(workerId);
  return demoGetWorkerPayouts(workerId);
}

/** Admin queue — every WITHDRAWAL still in review, oldest first. */
export async function getPendingPayouts(): Promise<LedgerEntry[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetPendingPayouts();
  return demoGetPendingPayouts();
}

/**
 * M4 — log a booking lifecycle event to the admin activity feed, carrying the
 * booking number as a deep link to the dispute view (/admin/bookings/[number]).
 * Called from the seam after a successful mutation, so BOTH adapters (demo +
 * prisma) share ONE logging site — the booking funnel's counts and the Recent
 * activity feed then tell the same story (docs/booking-scheduling.md §7).
 *
 * No actorId on purpose: the acting party is a customer or worker, never an
 * admin, and ActivityLog.actorId is the acting-admin FK (see the verification
 * workflow — its worker side also keeps actorId null). The display name rides
 * meta.actor; the booking's own row carries the customer/worker identity.
 */
/** The lifecycle codes the booking seam logs (funnel & feed stay in lockstep). */
type BookingLifecycleCode = Extract<
  ActivityCode,
  | "BOOKING_REQUESTED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_NO_SHOW"
  | "BOOKING_REFUNDED"
>;

async function logBookingLifecycle(
  code: BookingLifecycleCode,
  booking: Booking,
  copy: { en: string; ar: string },
  actor: string
): Promise<void> {
  await logAdminActivity({
    code,
    actionEn: copy.en,
    actionAr: copy.ar,
    actor,
    type: "booking",
    bookingNo: booking.number,
  });
}

/** Customer side: request a booking on an AVAILABLE slot ($transaction, row-locked). */
export async function createBookingRequest(
  input: BookingRequestInput
): Promise<Booking | { error: "slot-taken" | "invalid" }> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaCreateBookingRequest(input)
    : await demoCreateBookingRequest(input);
  if (!("error" in result)) {
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_REQUESTED,
      result,
      {
        en: `${result.customerName} requested ${result.number} — ${result.jobTitle}`,
        ar: `${result.customerName} طلب الحجز ${result.number} — ${result.jobTitle}`,
      },
      result.customerName
    );
  }
  return result;
}

/** Worker side: accept (quote/deposit) or decline a REQUESTED booking. */
export async function respondToBooking(
  bookingId: string,
  input: BookingRespondInput
): Promise<Booking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaRespondToBooking(bookingId, input)
    : await demoRespondToBooking(bookingId, input);
  // Log CONFIRMED only when the booking actually reached it — a deposit accept
  // sits in PENDING_PAYMENT until the payment lands (confirmBookingPayment logs
  // that transition), so the feed matches the funnel's confirmed bucket.
  if (result && input.accept && result.status === "confirmed") {
    const worker = await getWorkerById(result.workerId);
    const name = worker?.nameEn ?? "Worker";
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_CONFIRMED,
      result,
      { en: `${name} confirmed ${result.number}`, ar: `${name} أكّد الحجز ${result.number}` },
      name
    );
  }
  return result;
}

/* ─────────── Multi-candidate quotes (docs/multi-candidate-quotes.md) ─────────── */

/**
 * Customer side: post a job and invite up to MAX_QUOTE_WORKERS workers to
 * quote it. Rule 1 (duplicates + over-limit rejected) is enforced by both
 * adapters; each invite becomes a slot-less QUOTING Booking under the job.
 */
export async function createQuoteRequest(
  input: QuoteRequestInput,
  workerIds: string[]
): Promise<QuoteRequest | { error: "invalid" | "too-many" | "duplicate" | "unknown-worker" }> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaCreateQuoteRequest(input, workerIds)
    : await demoCreateQuoteRequest(input, workerIds);
  // §7–§10 — the marketplace arm of the same post: grade the request and offer
  // it to the few best-matched workers the customer did NOT invite. Excluded
  // workers hold a free invite, so selling them the lead would be charging for
  // what they already have. Never fatal: a matching failure must not lose a
  // customer's request, so it logs and returns whatever happened.
  if (!("error" in result)) {
    try {
      await distributeQualifiedLead(result, workerIds);
    } catch (error) {
      console.error("[lead-market] distribution failed", error);
    }
  }
  return result;
}

/* ────────────── Qualified lead marketplace (§7–§10) ────────────── */

/**
 * How many search pages of the category the matcher may consider. The public
 * search page shows `PAGE_SIZE` workers per page, so a few pages is a real pool
 * without turning a customer's post into a table scan.
 */
const LEAD_POOL_PAGES = 3;

/**
 * Distribute one freshly posted request: grade it (§7), match the pool (§8), and
 * create the paid offers (§9) — notifying exactly the workers this call added.
 * Returns the grade + offers so callers can surface it (a demo/dev seed, an
 * admin view, a future "your request was sent to 3 more pros" message).
 */
export async function distributeQualifiedLead(
  request: QuoteRequest,
  invitedWorkerIds: string[] = []
): Promise<{ grade: LeadGradeResult; created: number; offers: number } | null> {
  const pool: WorkerLike[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= LEAD_POOL_PAGES; page += 1) {
    const result = await getWorkers({
      category: request.categorySlug,
      city: request.citySlug,
      sort: "rating",
      page,
    });
    for (const worker of result.items) {
      if (seen.has(worker.id)) continue;
      seen.add(worker.id);
      pool.push(worker);
    }
    if (pool.length === 0 || pool.length >= result.total) break;
  }
  if (pool.length === 0) return null;

  const ruleSet = await loadActiveFeeRuleSet();
  // Phase 2: lock a bounded demand/dispatch multiplier into every offer.
  // The pool is the current category/city supply snapshot and the new request
  // is one pending lead; this keeps pricing deterministic in both adapters
  // without introducing a second query or any payment dependency.
  const smartPrice = computeSmartPricing({
    now: new Date(),
    categorySlug: request.categorySlug,
    citySlug: request.citySlug,
    availableWorkers: pool.length,
    pendingLeads: 1,
    isEmergency: request.isEmergency,
  });
  const { grade, offers, created } = await offerQualifiedLead({
    lead: {
      id: request.id,
      number: request.number,
      jobTitle: request.jobTitle,
      note: request.note,
      categorySlug: request.categorySlug,
      citySlug: request.citySlug,
      serviceItem: request.serviceItem ? { nameEn: request.serviceItem.nameEn, price: request.serviceItem.price } : undefined,
      customerId: request.customerId,
      customerEmail: request.customerEmail,
      isEmergency: request.isEmergency,
    },
    candidates: leadCandidatesFromWorkers(pool),
    invitedWorkerIds,
    ruleSet,
    smartPriceMultiplier: smartPrice.multiplier,
    smartPriceReason: smartPrice.reason,
  });

  for (const offer of created) {
    const worker = await getWorkerById(offer.workerId);
    if (!worker) continue;
    await pushNotification(leadOfferNotification(offer, "lead-offer"), {
      name: worker.nameEn,
      email: worker.email,
      phone: worker.phone,
      locale: worker.languages[0]?.code === "ar" ? "ar" : "en",
    });
  }

  return { grade, created: created.length, offers: offers.length };
}

/** What the worker's lead board renders (loaded server-side, one round trip). */
export interface WorkerLeadBoard {
  /** Buyable now — best match first. */
  live: LeadBoardItem[];
  /** Already bought (the customer's details are unlocked per policy). */
  owned: LeadBoardItem[];
  /** Expired / revoked / declined history. */
  past: LeadBoardItem[];
  balance: WorkerCreditBalance;
  /** The policy in force — the board explains the prices from THIS object. */
  config: LeadMarketConfig;
  /** §11 — what this worker's bought leads have given back in total (money). */
  rebates: { totalMinor: number; count: number };
}

/**
 * The worker's lead board: offers + the lead as far as the §10 contact-reveal
 * policy allows, priced from the ACTIVE rule set. The reveal decision is made
 * by the pure engine (`leadBoardItemFor`), so the board cannot be the surface
 * that leaks a customer's phone number.
 */
export async function getWorkerLeadBoard(workerId: string, now = new Date()): Promise<WorkerLeadBoard> {
  const [offers, ruleSet, balance, worker, bookings, rebates, refundRequests] = await Promise.all([
    getWorkerLeadOffersStore(workerId, now),
    loadActiveFeeRuleSet(),
    getWorkerCreditBalance(workerId),
    getWorkerById(workerId),
    getWorkerBookings(workerId),
    // §11 — the rebates this worker's leads have already returned, keyed by lead
    // so each owned row can show whether that lead has paid for itself.
    getWorkerLeadRebates(workerId, 100),
    getWorkerLeadRefunds(workerId),
  ]);
  const config = leadMarketConfig(ruleSet);
  const planTier = planTierFor(worker?.subscription.plan);
  const nowMs = now.getTime();
  const rebateByLead = new Map<string, number>();
  const refundByOffer = new Map(refundRequests.map((request) => [request.offerId, request.status]));
  for (const rebate of rebates) {
    rebateByLead.set(rebate.leadId, (rebateByLead.get(rebate.leadId) ?? 0) + rebate.rebateMinor);
  }

  const items: LeadBoardItem[] = [];
  for (const offer of offers) {
    const lead = await getQuoteRequest(offer.leadId);
    if (!lead) continue;
    // §10 — a lead that became a real booking reveals its contact (the
    // customer chose this worker), so the board keeps working after the sale.
    const booking = bookings.find((b) => b.quoteRequestId === lead.id);
    const booked = Boolean(
      booking && booking.status !== "quoting" && booking.status !== "declined" && booking.status !== "cancelled"
    );
    items.push(
      leadBoardItemFor({
        offer,
        lead: {
          id: lead.id,
          number: lead.number,
          jobTitle: lead.jobTitle,
          note: lead.note,
          categorySlug: lead.categorySlug,
          citySlug: lead.citySlug,
          isEmergency: lead.isEmergency,
          serviceNameEn: lead.serviceItem?.nameEn,
          serviceNameAr: lead.serviceItem?.nameAr,
          createdAt: lead.createdAt,
        },
        policy: config.reveal,
        planTier,
        booked,
        rebateMinor: rebateByLead.get(lead.id) ?? 0,
        refundStatus: refundByOffer.get(offer.id),
        customer: { name: lead.customerName, phone: lead.customerPhone, email: lead.customerEmail },
        // "Why you were matched" — the SAME scoring function that ranked the
        // pool when the offer was created, re-run for this one worker, so the
        // explanation is arithmetic rather than a display-side guess.
        ...(worker
          ? {
              reasons: matchReasonsFor(
                scoreLeadCandidate(
                  leadCandidateFromWorker(worker),
                  { categorySlug: lead.categorySlug, citySlug: lead.citySlug, isEmergency: lead.isEmergency },
                  config.weights
                )?.breakdown ?? []
              ),
            }
          : {}),
        now: nowMs,
      })
    );
  }

  return {
    ...splitLeadBoard(items),
    balance,
    config,
    rebates: {
      totalMinor: rebates.reduce((sum, r) => sum + r.rebateMinor, 0),
      count: rebates.length,
    },
  };
}

/**
 * Buy a lead offer with platform credits. Side effects (the debit, the exclusive
 * revoke, the audit entry) live in the store; this wrapper resolves the buyer's
 * plan tier so the §10 reveal the buyer gets matches the policy exactly.
 */
export async function buyLeadOffer(offerId: string, workerId: string): Promise<LeadPurchaseResult> {
  const worker = await getWorkerById(workerId);
  return purchaseLeadOfferStore(offerId, workerId, { planTier: planTierFor(worker?.subscription.plan) });
}

/** Every offer on one lead (admin audit / the customer's own job page). */
export async function getLeadOffers(leadId: string) {
  return getLeadOffersStore(leadId);
}

/** One worker's lead offers, live ones first (the dashboard's lead CTA). */
export async function getWorkerLeadOffers(workerId: string, now = new Date()) {
  return getWorkerLeadOffersStore(workerId, now);
}

/** Recent offers, newest first (admin audit list). */
export async function listLeadOffers(limit = 50) {
  return listLeadOffersStore(limit);
}

/** Expire offers past their window — the cron twin of the quote SLA sweep. */
export async function expireLeadOffers(now = new Date()): Promise<number> {
  return expireLeadOffersStore(now);
}

// ──────────────────── Lead rating repo seam (§12) ────────────────────

/** Submit a worker's rating for a purchased lead. */
export async function submitLeadRating(input: {
  offerId: string;
  workerId: string;
  quality: number;
  reason?: string;
  reasonAr?: string;
  converted?: boolean;
  reachable?: boolean;
}): Promise<{ ok: true; rating: LeadRating } | { ok: false; error: string }> {
  if (realDataEnabled) {
    const { prismaSubmitLeadRating } = await import("./lead-rating-prisma");
    return prismaSubmitLeadRating(input);
  }
  return submitLeadRatingStore(input);
}

/** All ratings for a specific worker. */
export async function getWorkerLeadRatings(workerId: string): Promise<LeadRating[]> {
  if (realDataEnabled) {
    const { prismaGetWorkerLeadRatings } = await import("./lead-rating-prisma");
    return prismaGetWorkerLeadRatings(workerId);
  }
  return getWorkerLeadRatingsStore(workerId);
}

/** A rating for a specific offer (or null). */
export async function getOfferRating(offerId: string): Promise<LeadRating | null> {
  if (realDataEnabled) {
    const { prismaGetOfferRating } = await import("./lead-rating-prisma");
    return prismaGetOfferRating(offerId);
  }
  return getOfferRatingStore(offerId);
}

/** All ratings in the system (admin). */
export async function getAllLeadRatings(): Promise<LeadRating[]> {
  if (realDataEnabled) {
    const { prismaGetAllLeadRatings } = await import("./lead-rating-prisma");
    return prismaGetAllLeadRatings();
  }
  return getAllLeadRatingsStore();
}

/** Aggregate per-grade rating stats. */
export async function getLeadRatingSummary(): Promise<GradeRatingSummary> {
  // Summary is always computed from the full set — no Prisma shortcut needed.
  return getLeadRatingSummaryStore();
}

/** Per-grade pricing multipliers from the rating signal. */
export async function getRatingPriceMultipliers(): Promise<Record<string, number>> {
  return getRatingPriceMultipliersStore();
}

/** A quote job by id or number — ownership enforced when an identifier is given. */
export async function getQuoteRequest(
  idOrNumber: string,
  identifier?: { customerId?: string; phone?: string }
): Promise<QuoteRequest | null> {
  return realDataEnabled
    ? (await prismaRepo()).prismaGetQuoteRequest(idOrNumber, identifier)
    : demoGetQuoteRequest(idOrNumber, identifier);
}

/** A customer's quote jobs, matched by signed-in customerId, email or
 * normalized phone (the /bookings page — the customerId branch covers a
 * signed-in customer who skips the optional email). */
export async function getCustomerQuoteRequests(
  identifier: { email?: string; phone?: string; customerId?: string } = {}
): Promise<QuoteRequest[]> {
  return realDataEnabled
    ? (await prismaRepo()).prismaGetCustomerQuoteRequests(identifier)
    : demoGetCustomerQuoteRequests(identifier);
}

/**
 * Per-category lead-funnel conversion metrics (§2.1) — offers joined with
 * their lead's category, the completion-attributed rebates (a bought lead
 * that became a paid job), and the workers' self-reported conversions. Pure
 * engine: src/lib/data/category-conversion.ts; the admin lead-quality page
 * renders the table.
 */
export async function getCategoryConversionMetrics(
  windowDays = 30
): Promise<import("./category-conversion").CategoryConversionReport> {
  const { computeCategoryConversion } = await import("./category-conversion");
  // The lead-offer store is dual-adapter already (real mode delegates to
  // lead-market-prisma), so one call covers both.
  const offers = await listLeadOffersStore(2000);
  const leadCategories = new Map<string, string>();
  if (realDataEnabled) {
    const rows = await (await prismaRepo()).prismaQuoteRequestCategories();
    for (const row of rows) leadCategories.set(row.id, row.categorySlug);
  } else {
    const { demoGetAllQuoteRequests } = await import("./bookings");
    for (const q of demoGetAllQuoteRequests()) leadCategories.set(q.id, q.categorySlug);
  }
  const [rebates, ratings] = await Promise.all([listLeadRebates(2000), getAllLeadRatings()]);
  return computeCategoryConversion(
    offers
      .filter((o) => leadCategories.has(o.leadId))
      .map((o) => ({
        offerId: o.id,
        leadId: o.leadId,
        categorySlug: leadCategories.get(o.leadId)!,
        grade: o.grade,
        status: o.status,
        priceCredits: o.priceCredits,
        offeredAt: o.offeredAt,
      })),
    rebates.map((r) => ({ leadId: r.leadId, createdAt: r.createdAt })),
    ratings.map((r) => ({ offerId: r.offerId, converted: r.converted })),
    { windowDays }
  );
}

/** Worker side: submit a bid on a quote invite (no slot claim — rule 3). */
export async function submitQuote(bookingId: string, input: QuoteBidInput): Promise<Booking | null> {
  return realDataEnabled
    ? (await prismaRepo()).prismaSubmitQuote(bookingId, input)
    : demoSubmitQuote(bookingId, input);
}

/** Customer side: pick the winner + a slot — the winner claims it via the
 * existing atomic CAS, the losers are DECLINED, the job flips to SELECTED. */
export async function selectQuote(
  quoteRequestId: string,
  winnerBookingId: string,
  slotId: string
): Promise<Booking | { error: "slot-taken" | "invalid" | "not-quoted" | "closed" }> {
  return realDataEnabled
    ? (await prismaRepo()).prismaSelectQuote(quoteRequestId, winnerBookingId, slotId)
    : demoSelectQuote(quoteRequestId, winnerBookingId, slotId);
}

/** The SLA cron — expire OPEN/QUOTING jobs past QUOTE_SLA_MS, decline open bids. */
export async function expireQuoteRequests(now = new Date()): Promise<number> {
  return realDataEnabled
    ? (await prismaRepo()).prismaExpireQuoteRequests(now)
    : demoExpireQuoteRequests(now);
}

/**
 * M1 recurring bookings (ENHANCEMENT-PLAN §7 #1) — worker's contracts.
 * W2: fully prisma-backed (createRecurringRequest / respondToRecurring claim
 * real slots via the CAS inside $transaction; the generation cron rolls the
 * cadence forward).
 */
export async function getWorkerRecurrings(workerId: string): Promise<RecurringBooking[]> {
  return realDataEnabled
    ? (await prismaRepo()).prismaGetWorkerRecurrings(workerId)
    : demoGetWorkerRecurrings(workerId);
}

/** M1 — customer requests a repeat service; first occurrence claims the slot. */
export async function createRecurringRequest(
  input: RecurringRequestInput
): Promise<{ recurring: RecurringBooking; booking: Booking } | { error: "slot-taken" | "invalid" }> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaCreateRecurringRequest(input)
    : await demoCreateRecurringRequest(input);
  if (!("error" in result)) {
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_REQUESTED,
      result.booking,
      {
        en: `${result.booking.customerName} requested recurring ${result.booking.number} — ${result.booking.jobTitle}`,
        ar: `${result.booking.customerName} طلب تكرار ${result.booking.number} — ${result.booking.jobTitle}`,
      },
      result.booking.customerName
    );
  }
  return result;
}

/** M1 — worker accepts (quote/deposit) or declines the whole contract. */
export async function respondToRecurring(
  recurringId: string,
  input: RecurringRespondInput
): Promise<RecurringBooking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaRespondToRecurring(recurringId, input)
    : await demoRespondToRecurring(recurringId, input);
  // Log CONFIRMED only when the first occurrence actually reached it — a
  // deposit accept sits in PENDING_PAYMENT until the payment lands (mirrors
  // the one-shot respondToBooking's feed rule).
  if (result && input.accept && result.occurrences[0]?.status === "confirmed") {
    const worker = await getWorkerById(result.workerId);
    const name = worker?.nameEn ?? "Worker";
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_CONFIRMED,
      result.occurrences[0],
      { en: `${name} confirmed recurring ${result.number}`, ar: `${name} أكّد العقد الدوري ${result.number}` },
      name
    );
  }
  return result;
}

/** A customer's contracts — email for signed-in, normalized phone for guests. */
export async function getCustomerRecurrings(
  identifier: { email?: string; phone?: string } = {}
): Promise<RecurringBooking[]> {
  return realDataEnabled
    ? (await prismaRepo()).prismaGetCustomerRecurrings(identifier)
    : demoGetCustomerRecurrings(identifier);
}

/** A contract by id — the admin dispute view resolves an occurrence's contract. */
export async function getRecurringById(id: string): Promise<RecurringBooking | null> {
  return realDataEnabled ? (await prismaRepo()).prismaGetRecurringById(id) : demoGetRecurringById(id);
}

/** Customer cancels an active contract — anchor slot frees, cadence stops. */
export async function cancelRecurringContract(
  recurringId: string,
  reason?: string
): Promise<RecurringBooking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaCancelRecurringContract(recurringId, reason)
    : await demoCancelRecurringContract(recurringId, reason);
  if (result) {
    // The contract number is the feed key — the dispute deep-link resolves to
    // the first occurrence's booking page (like the cancelBooking logging).
    const first = result.occurrences[0];
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_CANCELLED,
      first ?? ({
        number: result.number,
        workerId: result.workerId,
        customerName: result.customerName,
        jobTitle: result.jobTitle,
      } as Booking),
      {
        en: `${result.customerName} cancelled recurring contract ${result.number}${reason ? ` — ${reason}` : ""}`,
        ar: `${result.customerName} ألغى العقد الدوري ${result.number}${reason ? ` — ${reason}` : ""}`,
      },
      result.customerName
    );
  }
  return result;
}


/**
 * Worker side: transition a scheduled booking to inProgress / completed /
 * noShow (M4). The state machine lives in BOOKING_TRANSITION_FROM.
 */
export async function transitionBooking(
  bookingId: string,
  to: BookingTransitionTarget
): Promise<Booking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaTransitionBooking(bookingId, to)
    : await demoTransitionBooking(bookingId, to);

  // NO_SHOW is the only transition that voids a booked job — log it so the
  // feed's lifecycle story matches the dispute trail (inProgress/completed
  // are visible in the dispute view's events either way, and get no codes).
  if (result && to === "noShow") {
    const worker = await getWorkerById(result.workerId);
    const name = worker?.nameEn ?? "Worker";
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_NO_SHOW,
      result,
      { en: `${name} marked ${result.number} as a no-show`, ar: `${name} سجّل ${result.number} كعدم حضور` },
      name
    );
  }
  return result;
}

/**
 * §2.3 customer-confirms-completion — the customer confirms a staged
 * completion (completionPending → completed, earnings credit + worker
 * notified). Returns null unless the booking is staged. Completes get no
 * lifecycle codes by design (the dispute view's event trail carries them).
 */
export async function confirmBookingCompletion(bookingId: string): Promise<Booking | null> {
  return realDataEnabled
    ? await (await prismaRepo()).prismaConfirmBookingCompletion(bookingId)
    : await demoConfirmBookingCompletion(bookingId);
}

/**
 * Worker/customer side: cancel a booking (M4) — frees the slot and notifies
 * the other party. Returns null for unknown or terminal bookings.
 */
export async function cancelBooking(
  bookingId: string,
  input: BookingCancelInput
): Promise<Booking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaCancelBooking(bookingId, input)
    : await demoCancelBooking(bookingId, input);
  if (result) {
    // The actor is whoever cancelled — customer (their id when signed in),
    // the worker, or an admin from the dispute view. Logged so the feed
    // mirrors the funnel's cancelled bucket.
    const worker = input.by === "customer" ? null : await getWorkerById(result.workerId);
    const name =
      input.by === "customer" ? result.customerName : input.by === "admin" ? (input.adminName ?? "Platform Admin") : (worker?.nameEn ?? "Worker");
    const reason = input.reason ? ` — ${input.reason}` : "";
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_CANCELLED,
      result,
      { en: `${name} cancelled ${result.number}${reason}`, ar: `${name} ألغى الحجز ${result.number}${reason}` },
      name
    );
  }
  return result;
}

/**
 * §2.4 admin dispute view — refund the booking's PAID deposit WITHOUT
 * cancelling it (money-only correction; the job and slot stay as they are).
 * Both adapters require a PAID deposit (PENDING / already-refunded → null,
 * idempotent), append a REFUNDED audit event, and notify the customer with
 * the M4 refund email. Logged to the activity feed with the acting admin.
 */
export async function refundBookingDeposit(
  bookingId: string,
  input: { reason?: string; adminName?: string }
): Promise<Booking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaRefundBookingDeposit(bookingId, input)
    : await demoRefundBookingDeposit(bookingId, input);
  if (result) {
    const admin = input.adminName ?? "Platform Admin";
    const reason = input.reason ? ` — ${input.reason}` : "";
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_REFUNDED,
      result,
      { en: `${admin} refunded the deposit on ${result.number}${reason}`, ar: `${admin} استرد دفعة الحجز ${result.number}${reason}` },
      admin
    );
  }
  return result;
}

/**
 * Generate AVAILABLE slots from the worker's weekly hours template (M2).
 * Returns how many slots were created (idempotent — no double-booking).
 */
export async function generateSlots(
  workerId: string,
  range: { from?: string; to?: string } = {}
): Promise<number> {
  if (realDataEnabled) return (await prismaRepo()).prismaGenerateSlots(workerId, range);
  return demoGenerateSlots(workerId, range);
}

/** Block/unblock an AVAILABLE/BLOCKED slot (M2 availability editor). */
export async function setSlotBlocked(
  workerId: string,
  slotId: string,
  blocked: boolean,
  note?: string
): Promise<BookingSlot | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaSetSlotBlocked(workerId, slotId, blocked, note);
  return demoSetSlotBlocked(workerId, slotId, blocked, note);
}

/**
 * M4 — move a scheduled booking (confirmed/inProgress) to another AVAILABLE
 * slot of the same worker. The booking keeps its status; the old slot is
 * freed, the target is claimed, a RESCHEDULED event is appended, and the
 * other party is notified. Returns null for unknown/wrong-status bookings or
 * an invalid/claimed target slot.
 */
export async function rescheduleBooking(
  bookingId: string,
  targetSlotId: string,
  input: BookingRescheduleInput
): Promise<Booking | null> {
  const result = realDataEnabled
    ? await (await prismaRepo()).prismaRescheduleBooking(bookingId, targetSlotId, input)
    : await demoRescheduleBooking(bookingId, targetSlotId, input);
  if (result) {
    // The actor is whoever moved the booking — customer (when they reschedule)
    // or the worker. Logged so the feed mirrors the RESCHEDULED audit event.
    const worker = input.by === "customer" ? null : await getWorkerById(result.workerId);
    const name = input.by === "customer" ? result.customerName : (worker?.nameEn ?? "Worker");
    await logBookingLifecycle(
      ACTION_CODES.BOOKING_RESCHEDULED,
      result,
      { en: `${name} rescheduled ${result.number}`, ar: `${name} غيّر موعد الحجز ${result.number}` },
      name
    );
  }
  return result;
}

/**
 * M3 — create the deposit checkout for a PENDING_PAYMENT booking. Returns the
 * provider redirect URL (Stripe hosted checkout, or the local simulated
 * checkout when no keys are set), or null when the booking isn't awaiting
 * payment. Idempotent per booking.
 */
export async function createBookingCheckout(
  bookingId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "STRIPE"
): Promise<{ url: string } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaCreateBookingCheckout(bookingId, method);
  return demoCreateBookingCheckout(bookingId, method);
}

/**
 * M3 — the provider webhook (or simulated checkout callback) landed: flips
 * PENDING_PAYMENT → CONFIRMED and marks the deposit PAID. Idempotent.
 *
 * The CONFIRMED feed entry for the deposit path is logged by the ADAPTERS
 * (demo + prisma), not here: a webhook redelivery returns the already-confirmed
 * booking with no status change, and only the adapter knows whether the flip
 * actually happened this call (the seam can't tell redelivery from the first
 * delivery). REQUESTED / CANCELLED / accept-without-deposit CONFIRMED stay
 * seam-logged — those adapters return null on no-op, so a non-null result is
 * always a real transition.
 */
export async function confirmBookingPayment(
  bookingId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<Booking | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaConfirmBookingPayment(bookingId, providerRef, opts);
  return demoConfirmBookingPayment(bookingId, providerRef, opts);
}

/* ────────────────────────────────────────────────────────────────────────────
 * §LEBANON — MANUAL (OMT/WHISH) PAYMENTS + PAID UPGRADES (docs/PAYMENTS.md §manual
 * methods · docs/BUSINESS-MODEL.md §5.1 revenue first, no Stripe)
 * ────────────────────────────────────────────────────────────────────────────
 * OMT/Whish have no webhook: the customer pays offline with the reference the
 * /payments/manual instructions page shows, and an admin confirms receipt
 * from the /admin pending-payments card (confirmManualPaymentAction). The
 * confirm runs the SAME paths a provider webhook would have run.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every PENDING manual (OMT/Whish) payment with a minted reference — booking
 * deposits, campaign purchases, and the paid upgrades (subscription renewal /
 * verification / featured / emergency). The /admin pending-payments card
 * lists these for the admin's confirm. Demo merges its three stores; prisma
 * queries the Payment rows.
 */
export async function getPendingManualPayments(): Promise<PendingManualPayment[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetPendingManualPayments();
  return [
    ...demoPendingManualBookingPayments(),
    ...demoPendingManualCampaignPayments(),
    ...demoPendingManualPurchases(),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Settled and pending manual payments for admin reconciliation and receipts. */
export async function getManualPaymentReconciliation(): Promise<ReconciliationPayment[]> {
  if (realDataEnabled) return (await prismaRepo()).prismaGetManualPaymentReconciliation();
  return [
    ...demoReconciliationPurchases(),
    ...demoReconciliationBookingPayments(),
    ...demoReconciliationCampaignPayments(),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * §Lebanon — mint a manual (OMT/Whish) checkout for a paid upgrade. The
 * payment starts PENDING and the capability flips only when an admin confirms
 * receipt (confirmPurchase). Demo keeps an in-memory store; prisma persists a
 * Payment row (metadata.scope + option stamps). Returns the signed
 * instructions URL, or null for an unknown worker / invalid option.
 */
export async function createPurchaseCheckout(input: {
  workerSlug: string;
  scope: PurchaseScope;
  plan?: SubscriptionPlan;
  period?: BillingPeriod;
  tier?: VerificationTier;
  method: "OMT" | "WHISH";
}): Promise<{ url: string } | null> {
  if (realDataEnabled) return (await prismaRepo()).prismaCreatePurchaseCheckout(input);
  return demoCreatePurchaseCheckout(input);
}

/**
 * §Lebanon — admin confirm of a paid upgrade: the customer paid offline with
 * the reference, the confirm flips the payment PAID and activates the
 * purchased capability (subscription renewal / verified badge / featured
 * slot / emergency marker). Idempotent. Demo mutates the in-memory worker;
 * prisma flips the Payment row (CAS) + the worker's row in real mode.
 */
export async function cancelPendingPurchase(paymentId: string): Promise<boolean> {
  if (realDataEnabled) return (await prismaRepo()).prismaCancelPendingPurchase(paymentId);
  return demoCancelPendingPurchase(paymentId);
}

export async function confirmPurchase(
  paymentId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<boolean> {
  if (realDataEnabled) return (await prismaRepo()).prismaConfirmPurchase(paymentId, providerRef, opts);
  return demoConfirmPurchase(paymentId, providerRef, opts);
}

/**
 * §Lebanon — the demo purchase store lookup used by the seam's demo branch
 * when the admin confirm needs to resolve a purchase payment's reference.
 * (The prisma branch resolves everything from the Payment row itself.)
 */
export async function getPurchasePaymentReference(paymentId: string): Promise<string | null> {
  if (realDataEnabled) {
    const rows = await getPendingManualPayments();
    return rows.find((r) => r.id === paymentId)?.reference ?? null;
  }
  return demoPurchasePayment(paymentId)?.providerRef ?? null;
}

/**
 * The worker's monthly ROI report (docs/worker-roi.md) — what the marketplace
 * cost them and what it returned.
 *
 * The GATHERING is this seam: whichever adapter is live supplies the same two
 * facts (the worker's bookings with their audit trails, and their lead offers),
 * and the pure engine (`worker-roi.ts`) does all of the arithmetic. Nothing is
 * stored or cached, so the page can never disagree with the records it reads.
 */
export interface WorkerRoiReport {
  /** The month actually summarised (never null — a bad key falls back). */
  month: RoiMonth;
  /** The raw `?month=` value the caller asked for, echoed for the picker. */
  requested: string;
  /** False when `requested` was absent or malformed and the current month was used. */
  monthValid: boolean;
  /** True when the selected month is the one we are living in. */
  isCurrentMonth: boolean;
  /** The month's summary. */
  roi: WorkerRoi;
  /** The trailing window ending at the selected month, oldest first. */
  series: WorkerRoi[];
  /** The series summed, for the period footer. */
  total: WorkerRoi;
  /** The plan in force, for the cost line (null = no subscription). */
  plan: string | null;
}

/**
 * Build the ROI report for `workerId`. `month` is a `YYYY-MM` key; an absent or
 * malformed one falls back to the current UTC month (`monthValid: false`, so the
 * UI can say so rather than silently answering a different question).
 *
 * Returns null when the worker does not exist.
 */
export async function getWorkerRoi(
  workerId: string,
  opts: { month?: string; months?: number; now?: Date } = {}
): Promise<WorkerRoiReport | null> {
  const now = opts.now ?? new Date();
  const currentKey = roiMonthKeyOf(now);
  const requested = (opts.month ?? "").trim();
  const month = roiMonthWindow(requested) ?? roiMonthWindow(currentKey);
  if (!month) return null;

  const [worker, bookings, offers] = await Promise.all([
    getWorkerById(workerId),
    getWorkerBookings(workerId),
    getWorkerLeadOffers(workerId, now),
  ]);
  if (!worker) return null;

  // The worker's plan, priced per MONTH so one annual invoice can't distort a
  // single month's multiple (the engine reports the cash separately). `price` is
  // USD major units; the engine works in minor units throughout.
  const sub = worker.subscription;
  const subscription: RoiSubscription | null = sub
    ? {
        plan: sub.plan,
        priceMinor: Math.round(sub.price * 100),
        periodMonths: periodMonths(sub.period ?? "monthly"),
        startedAt: sub.startedAt,
        expiresAt: sub.expiresAt,
      }
    : null;

  const base = { offers, bookings, subscription };
  const seriesMonths: RoiMonth[] = [];
  for (const key of recentRoiMonthKeys(month.key, opts.months ?? 6)) {
    const window = roiMonthWindow(key);
    if (window) seriesMonths.push(window);
  }
  const series = computeWorkerRoiSeries(base, seriesMonths);

  return {
    month,
    requested,
    monthValid: roiMonthWindow(requested) !== null,
    isCurrentMonth: month.key === currentKey,
    roi: series[series.length - 1],
    series,
    total: totalWorkerRoi(series),
    plan: sub?.plan ?? null,
  };
}
