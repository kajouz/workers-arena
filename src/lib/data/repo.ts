import { categoriesWithCounts, workerById, workerBySlug, WORKERS } from "./workers";
import { computeResponseRate, hasFreeSlotsThisWeek } from "./booking-ui";
import { CITIES } from "./cities";
import { getAnalytics } from "./analytics";
import { getFeaturedWorkers, getRelatedWorkers, getSuggestions, POPULAR_SEARCHES, searchWorkers } from "./search";
import { applyPlanChange, PLANS, renewSubscription } from "./subscriptions";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  pushNotification,
} from "./notifications";
import { ACTION_CODES, getVerificationFunnel, logAdminActivity, type ActivityCode } from "./activity";
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
  type CampaignCreateInput,
} from "./campaigns";
import {
  demoCreatePurchaseCheckout,
  demoConfirmPurchase,
  demoPendingManualPurchases,
  demoPurchasePayment,
  type VerificationTier,
} from "./purchases";
import type {
  AnalyticsOverview,
  BillingPeriod,
  Booking,
  BookingCancelInput,
  BookingMessage,
  BookingMessageInput,
  BookingRequestInput,
  BookingFunnel,
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
  const res = searchWorkers(filters);
  return { ...res, items: withDemoSignals(res.items) };
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

export async function addReview(workerId: string, review: Omit<Review, "id" | "date">): Promise<Worker | null> {
  if (realDataEnabled) {
    realModeMutationUnsupported("addReview");
    return null;
  }
  const w = workerById(workerId);
  if (!w) return null;
  const id = `u-${Date.now()}`;
  w.reviews.unshift({ ...review, id, date: new Date().toISOString() });
  const count = w.reviewCount + 1;
  w.reviewCount = count;
  w.rating = Math.round(((w.rating * (count - 1) + review.rating) / count) * 10) / 10;
  // Notify the worker: new review lands in the inbox and dispatches via email/push.
  await pushNotification(
    {
      type: "review",
      titleEn: `New ${review.rating}-star review`,
      titleAr: `تقييم جديد ${review.rating} نجوم`,
      bodyEn: `${review.author} rated you ${review.rating}/5 — see what they wrote on your profile.`,
      bodyAr: `${review.author} منحك ${review.rating}/5 — اطّلع على ما كتبوه في ملفك.`,
      href: `/workers/${w.slug}`,
    },
    { name: w.nameEn, email: w.email, phone: w.phone, locale: primaryLocale(w) }
  );
  return w;
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
): Promise<{ name: string; email: string } | null> {
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
 * `ownerId` scopes the inbox to one user in prisma mode. Production TODO: pass
 * the acting session user id from the page/route once NextAuth is wired (demo
 * mode ignores it and returns the single global feed).
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
  // renewSubscription issues the invoice internally — don't create a second one.
  // The invoice lands in the shared campaign/invoice store so any graph (the
  // action that renewed, the dashboard page that renders) reads the same list.
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
 * view. Production TODO: paginate for very large stores.
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
 * Worker payouts (docs/payouts.md) — the worker's spendable balance from the
 * ledger: available = Σ posted earnings/adjustments − Σ processed withdrawals;
 * pending = Σ pending withdrawals (reserved while in review).
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
  return realDataEnabled
    ? (await prismaRepo()).prismaCreateQuoteRequest(input, workerIds)
    : demoCreateQuoteRequest(input, workerIds);
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
