/**
 * ────────────────────────────────────────────────────────────────────────────
 * PRODUCTION DATA LAYER (real mode: DEMO_MODE=false + DATABASE_URL)
 * ────────────────────────────────────────────────────────────────────────────
 * Prisma-backed implementations of the repository seam in src/lib/data/repo.ts.
 * repo.ts branches to this module whenever realDataEnabled(); demo mode never
 * imports it (lazy dynamic import), so demo builds stay free of a Prisma client
 * requirement. Signatures match the demo implementations exactly — the UI never
 * changes between modes.
 *
 * W1 scope (catalog reads): getCategories, getWorkerBySlug, getWorkers,
 * getFeaturedWorkersList, getRelated. W2 adds the booking seam
 * (docs/booking-scheduling.md §4): getWorkerSlots / getWorkerBookings reads
 * plus createBookingRequest / respondToBooking mutations — the mutation pair
 * runs inside prisma.$transaction with an atomic AVAILABLE→RESERVED claim on
 * the slot (compare-and-swap, the Postgres row-lock equivalent) so concurrent
 * requests can never double-book. The M2 availability editor (generateSlots /
 * setSlotBlocked) is also Prisma-backed.
 *
 * Campaigns are fully Prisma-backed for the purchase lifecycle: reads
 * (prismaGetCampaigns), the self-serve purchase path (prismaCreateCampaign /
 * prismaCreateCampaignCheckout / prismaConfirmCampaignPayment — PENDING
 * AdCampaign + primary Advertisement + PENDING Payment → checkout → ACTIVE +
 * PAID + PAID Invoice + "Campaign is live" notification) and the admin refund
 * (prismaRefundCampaignPayment, whose credit-note flip voids that Invoice)
 * all run against AdCampaign + Payment.advertisementId rows. The W2 boundary
 * is closed: ad rotation (prismaGetActiveAdsFor / prismaRecordImpression /
 * prismaRecordClick) serves REAL Advertisement rows and the /company invoices
 * list (prismaGetInvoices) reads the company's real Invoice rows. Remaining
 * demo-only (later waves): reviews, leads, subscriptions, activity feed,
 * cities, suggestions, analytics — in real mode they no-op with a
 * server-side warning (see repo.ts).
 *
 * Known parity gaps vs the demo search engine (see docs/ARCHITECTURE.md §10):
 *   • Text matching is Postgres ILIKE substring — no Arabic normalization or
 *     fuzzy subsequence scoring yet (pg_trgm similarity is the planned upgrade).
 *   • "relevance" sorts by rating as a proxy for the demo's weighted score.
 *   • open-now filtering and the "nearest" sort run in JS after a capped fetch
 *     (POST_FILTER_FETCH rows; fine for the seeded dataset — geo indexes are
 *     the production upgrade).
 *   • List queries load ≤2 reviews per row; profiles load ≤50.
 *   • Guest booking lookups (prismaGetCustomerBookings) have no index on
 *     customerEmail/customerPhone — fine at seed scale; add a partial index
 *     before real traffic lands.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { getPrisma } from "@/lib/server/prisma";
import { PLATFORM_FEE_RATE_BPS, computePlatformFee, isPlanFeeExempt, responseRateFromCounts } from "./booking-ui";
import type { Prisma, $Enums } from "@prisma/client";
import { FEE_EXEMPT_PLANS } from "./booking-ui";
import { categoryBySlug as demoCategoryBySlug } from "./categories";
import { CITIES, cityBySlug } from "./cities";
import { addMonths, planPrice, PLANS, subscriptionStatus } from "./subscriptions";
import { pushNotification } from "./notifications";
import { bookingNotification } from "./booking-notifications";
import { RECURRING_OCCURRENCE_COUNT, generateRecurringOccurrences, occurrencesInWindow } from "./recurring";
import { campaignActiveNotification, campaignRefundNotification } from "./campaign-notifications";
import { quoteNotification } from "./quote-notifications";
import type { CampaignCreateInput } from "./campaigns";
import { PURCHASE_PRICES, type VerificationTier } from "./purchases";
import { ACTION_CODES, logAdminActivity } from "./activity";
import { getPaymentProvider } from "@/lib/payments/registry";

/**
 * Absolute base URL for checkout success/cancel redirects. Uses APP_URL when
 * set (Vercel/prod); otherwise a relative URL — good enough for the simulated
 * provider in local dev/tests.
 */
function origin(): string {
  return process.env.APP_URL ?? "";
}
import { distanceKm, isOpenNow, type CurrencyCode } from "@/lib/utils";
import {
  BOOKING_COMPLETION_CONFIRM_GRACE_HOURS,
  BOOKING_REMINDER_WINDOW_MS,
  BOOKING_RESCHEDULABLE_FROM,
  BOOKING_SLA_EXPIRE_HOURS,
  BOOKING_SLA_NUDGE_HOURS,
  BOOKING_TERMINAL_STATUSES,
  BOOKING_TRANSITION_FROM,
  MAX_QUOTE_WORKERS,
  QUOTE_SLA_MS,
  bookingCancelRefundDue,
  formatInvoiceNumber,
  formatQuoteNumber,
  emptyBookingFunnelCounts,
  bookingConversionRate,
  tallyPlatformFeeStats,
  type QuoteBidInput,
  type QuoteRequest,
  type QuoteRequestInput,
  type QuoteStatus,
  type RequestSlaRun,
  type Booking,
  type BookingCancelInput,
  type BookingMessage,
  type BookingMessageInput,
  type BookingPayment,
  type BookingFunnel,
  type LedgerEntry,
  type PlatformFeeStats,
  type WorkerBalance,
  type BookingRequestInput,
  type BookingRescheduleInput,
  type BookingRespondInput,
  type BookingSlot,
  type BookingStatus,
  type RecurringBooking,
  type RecurringFrequency,
  type RecurringRequestInput,
  type RecurringRespondInput,
  type RecurringStatus,
  type BookingTransitionTarget,
  type Campaign,
  type CampaignPayment,
  type Category,
  type Certification,
  type City,
  type Invoice,
  type Review,
  type SearchFilters,
  type SearchResult,
  type ServiceItem,
  type SlotStatus,
  type Subscription,
  type SubscriptionPlan,
  type Worker,
  type WorkingDay,
  type BillingPeriod,
  type PendingManualPayment,
  type PurchaseScope,
  toDomainPaymentMethod,
} from "./types";

/** Must match the demo engine's page size (src/lib/data/search.ts). */
const PAGE_SIZE = 9;
/** Rows fetched before JS-only post-filters/sorts (open-now, nearest). */
const POST_FILTER_FETCH = 1000;
/** Reviews loaded on worker profiles. */
const PROFILE_REVIEWS_TAKE = 50;
/** Reviews loaded per row on list queries (cards render none). */
const LIST_REVIEWS_TAKE = 2;

const PLAN_MAP = {
  BASIC: "basic",
  PROFESSIONAL: "professional",
  PREMIUM: "premium",
  ENTERPRISE: "enterprise",
} as const;

/** Relations shared by every catalog query. */
const BASE_INCLUDE = {
  category: true,
  city: true,
  area: true,
  subscription: true,
  services: { orderBy: { sortOrder: "asc" as const } },
  certifications: true,
  hours: { orderBy: { day: "asc" as const } },
  portfolio: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.WorkerInclude;

const approvedReviews = (take: number) => ({
  where: { status: "APPROVED" as const },
  orderBy: { createdAt: "desc" as const },
  take,
  include: { author: { select: { name: true } } },
});

/** Rich include for worker profiles (full review list). */
export const PROFILE_INCLUDE = { ...BASE_INCLUDE, reviews: approvedReviews(PROFILE_REVIEWS_TAKE) } satisfies Prisma.WorkerInclude;
/** Lean include for list queries (search, featured, related, all). */
export const LIST_INCLUDE = { ...BASE_INCLUDE, reviews: approvedReviews(LIST_REVIEWS_TAKE) } satisfies Prisma.WorkerInclude;

type WorkerRow = Prisma.WorkerGetPayload<{ include: typeof PROFILE_INCLUDE }>;

/* ─────────────────────────────── Mappers ─────────────────────────────── */

function toDomainSubscription(sub: NonNullable<WorkerRow["subscription"]>): Subscription {
  const base = {
    plan: PLAN_MAP[sub.plan] ?? ("basic" as const),
    status: "active" as Subscription["status"],
    startedAt: sub.startedAt.toISOString(),
    expiresAt: sub.expiresAt.toISOString(),
    // Demo prices are USD major units; the seed stores minor units (×100).
    price: sub.price / 100,
    // No invoice-number column on Subscription; the row id is stable & unique.
    // (The UI never renders invoiceNo — it only round-trips through renewals.)
    invoiceNo: sub.id,
  };
  return { ...base, status: subscriptionStatus(base) };
}

/** Map a Prisma Worker row (with relations) to the domain Worker type. */
export function toDomainWorker(row: WorkerRow): Worker {
  const verification: Worker["verification"] = row.verified
    ? "verified"
    : row.status === "PENDING_VERIFICATION"
      ? "pending"
      : "rejected";
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    categorySlug: row.category.slug,
    citySlug: row.city.slug,
    areaSlug: row.area.slug,
    taglineEn: row.taglineEn ?? "",
    taglineAr: row.taglineAr ?? "",
    bioEn: row.bioEn ?? "",
    bioAr: row.bioAr ?? "",
    rating: row.rating,
    reviewCount: row.reviewCount,
    yearsExp: row.yearsExp,
    verified: row.verified,
    verification,
    premium: row.premium,
    featured: row.isFeatured,
    emergency: row.emergency,
    available: row.available,
    subscription: row.subscription
      ? toDomainSubscription(row.subscription)
      : // No subscription row → expired, so the worker stays hidden from public
        // search until one exists (mirrors the schema's INACTIVE semantics).
        { plan: "basic", status: "expired", startedAt: row.joinedAt.toISOString(), expiresAt: row.joinedAt.toISOString(), price: 0, invoiceNo: "" },
    // All money is minor units in the DB (schema convention); the domain and
    // UI work in major units, so prices divide by 100 here — same as
    // toDomainSubscription. See docs/ARCHITECTURE.md §10.
    priceMin: row.priceMin / 100,
    priceMax: row.priceMax / 100,
    currency: (row.city.currency as Worker["currency"]) ?? "USD",
    phone: row.phone,
    whatsapp: row.whatsapp ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    socials: (row.socials as Worker["socials"]) ?? [],
    languages: (row.languages as Worker["languages"]) ?? [],
    services: row.services.map(
      (s): ServiceItem => ({
        nameEn: s.nameEn,
        nameAr: s.nameAr,
        price: s.price,
        // Schema stores unit as a free string; the domain narrows to hour|job.
        unit: s.unit === "hour" ? "hour" : "job",
      })
    ),
    certifications: row.certifications.map(
      (c): Certification => ({
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        issuerEn: c.issuerEn ?? "",
        issuerAr: c.issuerAr ?? "",
        year: c.year ?? 0,
      })
    ),
    hours: row.hours.map(
      (h): WorkingDay => ({ day: h.day, open: h.open, close: h.close, closed: h.closed })
    ),
    gallery: row.portfolio.map((p) => ({ titleEn: p.titleEn, titleAr: p.titleAr, hue: row.hue })),
    reviews: row.reviews.map(
      (r): Review => ({
        id: r.id,
        author: r.author?.name ?? "Customer",
        rating: r.rating,
        date: r.createdAt.toISOString(),
        textEn: r.textEn ?? "",
        textAr: r.textAr ?? "",
        verifiedPurchase: r.verifiedPurchase,
      })
    ),
    joinedYear: row.joinedAt.getFullYear(),
    views: row.viewCount,
    leads: row.leadCount,
    completion: row.completion,
    hue: row.hue,
    lat: row.lat ?? row.city.lat,
    lng: row.lng ?? row.city.lng,
  };
}

/** Map a Prisma Category row (with worker count) to the domain Category type. */
export function toDomainCategory(
  row: Prisma.CategoryGetPayload<{ include: { _count: { select: { workers: true } } } }>
): Category {
  const demo = demoCategoryBySlug(row.slug);
  return {
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    // profession* is a domain-only field (no column) — resolved from the demo
    // category catalog (the seed mirrors its slugs 1:1), with a sane fallback.
    professionEn: demo?.professionEn ?? row.nameEn.toLowerCase(),
    professionAr: demo?.professionAr ?? row.nameAr,
    icon: row.icon,
    taglineEn: row.taglineEn ?? "",
    taglineAr: row.taglineAr ?? "",
    hue: row.hue,
    workerCount: row._count.workers,
  };
}

/** Map a Prisma City row (with its areas) to the domain City type. */
export function toDomainCity(
  row: Prisma.CityGetPayload<{ include: { areas: true } }>
): City {
  return {
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    countryEn: row.countryEn,
    countryAr: row.countryAr,
    currency: (row.currency || "SAR") as CurrencyCode,
    lat: row.lat,
    lng: row.lng,
    areas: row.areas.map((a) => ({ slug: a.slug, nameEn: a.nameEn, nameAr: a.nameAr })),
  };
}

/* ─────────────────────────────── Queries ─────────────────────────────── */

/** Workers visible to the public catalog (not soft-deleted, not blocked). */
const PUBLIC_WORKER_FILTER: Prisma.WorkerWhereInput = {
  deletedAt: null,
  status: { not: "BLOCKED" },
};

/**
 * W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — stamp responseRate +
 * availableThisWeek on a worker list with ONE batched slot query + ONE
 * batched booking tally, mirroring the demo's computeResponseRate /
 * hasFreeSlotsThisWeek (responseRateFromCounts + the same 7-day window) so
 * the two adapters can never drift. Workers without booking history get
 * responseRate null; the availability flag is false when no AVAILABLE slot
 * starts within the window.
 */
async function stampWorkerSignals(workers: Worker[]): Promise<Worker[]> {
  if (workers.length === 0) return workers;
  const prisma = getPrisma();
  const ids = workers.map((w) => w.id);
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const freeRows = await prisma.bookingSlot.findMany({
    where: { workerId: { in: ids }, status: "AVAILABLE", startAt: { gte: now, lte: horizon } },
    select: { workerId: true },
  });
  const freeIds = new Set(freeRows.map((s) => s.workerId));

  const tally = await prisma.booking.groupBy({
    by: ["workerId", "status"],
    where: { workerId: { in: ids } },
    _count: { _all: true },
  });
  const answeredByWorker = new Map<string, { total: number; answered: number }>();
  for (const row of tally) {
    const cur = answeredByWorker.get(row.workerId) ?? { total: 0, answered: 0 };
    cur.total += row._count._all;
    if (row.status !== "REQUESTED") cur.answered += row._count._all;
    answeredByWorker.set(row.workerId, cur);
  }

  return workers.map((w) => {
    const t = answeredByWorker.get(w.id);
    return {
      ...w,
      responseRate: t ? responseRateFromCounts(t.answered, t.total) : null,
      availableThisWeek: freeIds.has(w.id),
    };
  });
}

export async function prismaGetCategories(): Promise<Category[]> {
  const prisma = getPrisma();
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    // Same visibility predicate as public search, so card counts match results.
    include: {
      _count: {
        select: {
          workers: { where: { deletedAt: null, status: { not: "BLOCKED" } } },
        },
      },
    },
  });
  return rows.map(toDomainCategory);
}

/**
 * Cities (with their areas) for the /search filter — the W2 cities boundary
 * (docs/ENHANCEMENT-PLAN.md §3.2). The seed upserts the same CITIES constant
 * the demo adapter returns; here the rows come back from Postgres. Postgres
 * gives no guaranteed order, so re-sort by the demo catalog's canonical
 * display order (riyadh, dubai, …) so the /search dropdown can't drift
 * between modes. isActive mirrors the demo's always-live city list.
 */
export async function prismaGetCities(): Promise<City[]> {
  const prisma = getPrisma();
  const rows = await prisma.city.findMany({
    where: { isActive: true },
    include: { areas: true },
  });
  const demoOrder = new Map(CITIES.map((c, i) => [c.slug, i]));
  return rows
    .map(toDomainCity)
    .sort(
      (a, b) =>
        (demoOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER) -
        (demoOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
    );
}

export async function prismaGetWorkerBySlug(slug: string): Promise<Worker | null> {
  const prisma = getPrisma();
  const row = await prisma.worker.findUnique({
    where: { slug, deletedAt: null },
    include: PROFILE_INCLUDE,
  });
  if (!row) return null;
  return (await stampWorkerSignals([toDomainWorker(row)]))[0] ?? null;
}

export async function prismaGetWorkerById(id: string): Promise<Worker | null> {
  const prisma = getPrisma();
  const row = await prisma.worker.findUnique({
    where: { id, deletedAt: null },
    include: PROFILE_INCLUDE,
  });
  if (!row) return null;
  return (await stampWorkerSignals([toDomainWorker(row)]))[0] ?? null;
}

export async function prismaGetAllWorkers(): Promise<Worker[]> {
  const prisma = getPrisma();
  const rows = await prisma.worker.findMany({
    where: PUBLIC_WORKER_FILTER,
    include: LIST_INCLUDE,
  });
  return stampWorkerSignals(rows.map(toDomainWorker));
}

/**
 * Admin plan correction (the worker-management table's inline plan change) —
 * flip the Subscription row's plan tier directly. An expired subscription is
 * REACTIVATED for one monthly period so the correction takes effect in public
 * search (the expired status hides the worker); an active one keeps its
 * expiry. Upsert handles a worker with no row. No invoice — a correction, not
 * a purchase. Returns the updated (signal-stamped) worker.
 */
export async function prismaChangeWorkerPlan(
  workerId: string,
  plan: SubscriptionPlan,
  opts: { actor: string; actorId?: string } = { actor: "Platform Admin" }
): Promise<Worker | null> {
  const prisma = getPrisma();
  const existing = await prisma.subscription.findUnique({ where: { workerId } });
  const from = existing ? (PLAN_MAP[existing.plan] ?? "basic") : "basic";
  const expired = !existing || existing.expiresAt.getTime() <= Date.now();
  const now = new Date().toISOString();
  const planDb = plan.toUpperCase() as $Enums.SubscriptionPlan;
  await prisma.subscription.upsert({
    where: { workerId },
    create: {
      workerId,
      plan: planDb,
      status: "ACTIVE",
      price: Math.round(planPrice(plan) * 100),
      periodDays: 30,
      startedAt: now,
      expiresAt: addMonths(now, 1),
    },
    update: {
      plan: planDb,
      price: Math.round(planPrice(plan) * 100),
      ...(expired
        ? { status: "ACTIVE" as const, startedAt: now, expiresAt: addMonths(now, 1) }
        : {}),
    },
  });
  const row = await prisma.worker.findUnique({
    where: { id: workerId },
    include: PROFILE_INCLUDE,
  });
  if (!row) return null;
  const worker = toDomainWorker(row);
  // Audit trail — the same ADMIN_PLAN_CHANGED entry the demo seam writes, so
  // both modes leave an identical trace in the feed (admin + worker + from → to).
  await logAdminActivity({
    code: ACTION_CODES.ADMIN_PLAN_CHANGED,
    actionEn: `${opts.actor} changed ${worker.nameEn}'s plan: ${PLANS[from].labelEn} → ${PLANS[plan].labelEn}`,
    actionAr: `${opts.actor} غيّر خطة ${worker.nameAr}: من ${PLANS[from].labelAr} إلى ${PLANS[plan].labelAr}`,
    actor: opts.actor,
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    type: "worker",
  });
  return (await stampWorkerSignals([worker]))[0] ?? null;
}

/** Translate domain SearchFilters into a Prisma where clause (SQL-filterable set). */
export function filtersToWhere(filters: SearchFilters): Prisma.WorkerWhereInput {
  const where: Prisma.WorkerWhereInput = { ...PUBLIC_WORKER_FILTER };

  // Subscription-level filters merge into one relation filter: hidden from
  // public search while expired (mirrors the demo's subscriptionStatus check)
  // and — M5 — narrowed to fee-waived plans (Enterprise). FEE_EXEMPT_PLANS is
  // the same source the demo filter and the card badge use, uppercased for
  // the DB enum, so listing and filter can never disagree.
  const subWhere: Prisma.SubscriptionWhereInput = {};
  if (!filters.includeExpired) subWhere.status = { not: "EXPIRED" };
  if (filters.feeWaivedOnly) {
    subWhere.plan = {
      in: FEE_EXEMPT_PLANS.map((p) => p.toUpperCase()) as $Enums.SubscriptionPlan[],
    };
  }
  if (Object.keys(subWhere).length > 0) where.subscription = { is: subWhere };
  if (filters.category) where.category = { slug: filters.category };
  if (filters.city) where.city = { slug: filters.city };
  if (filters.area) where.area = { slug: filters.area };
  if (filters.minRating) where.rating = { gte: filters.minRating };
  if (filters.priceMin != null) where.priceMax = { gte: filters.priceMin };
  if (filters.priceMax != null) where.priceMin = { lte: filters.priceMax };
  if (filters.minExp) where.yearsExp = { gte: filters.minExp };
  if (filters.verifiedOnly) where.verified = true;
  if (filters.featuredOnly) where.isFeatured = true;
  if (filters.emergencyOnly) where.emergency = true;
  if (filters.availableNow) where.available = true;

  if (filters.query?.trim()) {
    const q = filters.query.trim();
    const ilike = (v: string) => ({ contains: v, mode: "insensitive" as const });
    // Same searchable surface as the demo engine (name, tagline, bio,
    // category/city/area names, service names) — minus the fuzzy scoring.
    where.OR = [
      { nameEn: ilike(q) },
      { nameAr: ilike(q) },
      { taglineEn: ilike(q) },
      { taglineAr: ilike(q) },
      { bioEn: ilike(q) },
      { bioAr: ilike(q) },
      { category: { OR: [{ nameEn: ilike(q) }, { nameAr: ilike(q) }] } },
      { city: { OR: [{ nameEn: ilike(q) }, { nameAr: ilike(q) }] } },
      { area: { OR: [{ nameEn: ilike(q) }, { nameAr: ilike(q) }] } },
      { services: { some: { OR: [{ nameEn: ilike(q) }, { nameAr: ilike(q) }] } } },
    ];
  }
  return where;
}

/** SQL orderBy for sorts the database can express directly. */
export function sqlOrderBy(sort: SearchFilters["sort"]): Prisma.WorkerOrderByWithRelationInput[] {
  switch (sort) {
    case "rating":
      return [{ rating: "desc" }];
    case "reviews":
      return [{ reviewCount: "desc" }];
    case "priceLow":
      return [{ priceMin: "asc" }];
    case "priceHigh":
      return [{ priceMin: "desc" }];
    case "experience":
      return [{ yearsExp: "desc" }];
    case "nearest":
    case "relevance":
    default:
      // Proxy for the demo's weighted score (rating dominates the bonus terms).
      return [{ rating: "desc" }];
  }
}

export async function prismaSearchWorkers(filters: SearchFilters): Promise<SearchResult> {
  const prisma = getPrisma();
  const start = performance.now();
  const page = Math.max(1, filters.page ?? 1);
  const sort = filters.sort ?? "relevance";
  const where = filtersToWhere(filters);

  // open-now is computed from working hours in JS; "nearest" needs the city
  // center + haversine in JS. For those, fetch a capped candidate set and do
  // the work in memory (documented W1 trade-off).
  const nearestCity = sort === "nearest" && filters.city ? cityBySlug(filters.city) : undefined;
  const jsSort = Boolean(nearestCity);
  const jsPostFilter = Boolean(filters.openNowOnly) || jsSort;
  const skip = jsPostFilter ? 0 : (page - 1) * PAGE_SIZE;
  const take = jsPostFilter ? POST_FILTER_FETCH : PAGE_SIZE;

  const rows = await prisma.worker.findMany({
    where,
    include: LIST_INCLUDE,
    orderBy: sqlOrderBy(sort),
    skip,
    take,
  });

  let items = rows.map(toDomainWorker);
  if (filters.openNowOnly) items = items.filter((w) => isOpenNow(w));
  // Honest total before any page slicing: exact via SQL count unless open-now
  // shrank the candidate set in JS (then it's the filtered length, exact up to
  // the POST_FILTER_FETCH cap — see the module header note).
  const filteredTotal = items.length;
  if (jsSort && nearestCity) {
    items = [...items].sort(
      (a, b) =>
        distanceKm(a.lat, a.lng, nearestCity.lat, nearestCity.lng) -
        distanceKm(b.lat, b.lng, nearestCity.lat, nearestCity.lng)
    );
  }
  if (jsPostFilter) items = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // W1 trust signals — stamped after all JS post-filtering/slicing so only the
  // returned page pays for the two batched queries.
  items = await stampWorkerSignals(items);

  const total = jsPostFilter
    ? filters.openNowOnly
      ? filteredTotal
      : await prisma.worker.count({ where })
    : await prisma.worker.count({ where });

  return {
    items,
    total,
    tookMs: Math.round(performance.now() - start),
  };
}

export async function prismaGetFeaturedWorkers(limit = 4): Promise<Worker[]> {
  const prisma = getPrisma();
  const rows = await prisma.worker.findMany({
    where: { ...PUBLIC_WORKER_FILTER, isFeatured: true },
    include: LIST_INCLUDE,
    orderBy: { rating: "desc" },
    take: limit,
  });
  return stampWorkerSignals(rows.map(toDomainWorker));
}

/* ─────────────────────────── Bookings & slots (W2) ───────────────────────────
 * Prisma implementations of the booking seam (docs/booking-scheduling.md §4).
 * The demo adapter in ./bookings.ts enforces the same five service rules;
 * this adapter re-implements them against the DB:
 *   1. No double-booking — createBookingRequest flips the slot with an atomic
 *      updateMany(WHERE status=AVAILABLE) INSIDE $transaction. That is the
 *      Postgres row-lock + re-check in one statement: a concurrent request
 *      that read AVAILABLE earlier matches 0 rows and gets "slot-taken".
 *   2. Overlap guard — half-open [startAt, endAt) check against the same
 *      worker's RESERVED/BOOKED/BLOCKED slots (the unique index only catches
 *      exact starts).
 *   3. Decline frees the slot — back to AVAILABLE, bookingId cleared.
 *   4. Money — quote/deposit are minor units, stored as-is (the actions
 *      convert major→minor ×100 before calling the seam, same as demo).
 *   5. Audit — every transition appends a BookingEvent in the same tx.
 * Notifications (pushNotification) fire AFTER the transaction — the inbox
 * write uses its own connection and must not share the tx's row locks.
 * ────────────────────────────────────────────────────────────────────────── */

const BOOKING_STATUS_DB_TO_APP: Record<string, BookingStatus> = {
  REQUESTED: "requested",
  QUOTING: "quoting", // multi-candidate quotes — invited, bid not submitted
  QUOTED: "quoted", // multi-candidate quotes — bid in, awaiting the pick
  PENDING_PAYMENT: "pendingPayment",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "inProgress",
  COMPLETION_PENDING: "completionPending", // §2.3 staged completion
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DECLINED: "declined",
  NO_SHOW: "noShow",
  RESCHEDULED: "rescheduled",
  MESSAGE: "message", // audit-event only — a chat message was sent (§2.3)
  REFUNDED: "refunded", // audit-event only — admin refunded the paid deposit (§2.4)
};

const BOOKING_STATUS_APP_TO_DB: Record<BookingStatus, $Enums.BookingStatus> = {
  requested: "REQUESTED",
  quoting: "QUOTING", // multi-candidate quotes
  quoted: "QUOTED", // multi-candidate quotes
  pendingPayment: "PENDING_PAYMENT",
  confirmed: "CONFIRMED",
  inProgress: "IN_PROGRESS",
  completionPending: "COMPLETION_PENDING", // §2.3 staged completion
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  declined: "DECLINED",
  noShow: "NO_SHOW",
  rescheduled: "RESCHEDULED",
  message: "MESSAGE", // audit-event only — a chat message was sent (§2.3)
  refunded: "REFUNDED", // audit-event only — admin refunded the paid deposit (§2.4)
};

const QUOTE_STATUS_DB_TO_APP: Record<string, QuoteStatus> = {
  OPEN: "open",
  QUOTING: "quoting",
  SELECTED: "selected",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

const QUOTE_STATUS_APP_TO_DB: Record<QuoteStatus, $Enums.QuoteStatus> = {
  open: "OPEN",
  quoting: "QUOTING",
  selected: "SELECTED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
};

/** Phone separators stripped on BOTH sides of a customer lookup — must match
 * demoGetCustomerBookings' regex exactly or real mode drifts from demo mode. */
const PHONE_SEP_PATTERN = "[\\s\\-()]";

const SLOT_STATUS_DB_TO_APP: Record<string, SlotStatus> = {
  AVAILABLE: "available",
  RESERVED: "reserved",
  BOOKED: "booked",
  BLOCKED: "blocked",
};

const SLOT_STATUS_APP_TO_DB: Record<SlotStatus, $Enums.SlotStatus> = {
  available: "AVAILABLE",
  reserved: "RESERVED",
  booked: "BOOKED",
  blocked: "BLOCKED",
};

const RECURRING_FREQUENCY_DB_TO_APP: Record<string, RecurringFrequency> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
};

const RECURRING_STATUS_DB_TO_APP: Record<string, RecurringStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
};

const RECURRING_STATUS_APP_TO_DB: Record<RecurringStatus, $Enums.RecurringStatus> = {
  active: "ACTIVE",
  paused: "PAUSED",
  cancelled: "CANCELLED",
};

/** How far ahead the generation cron materializes occurrences (W2). */
export const RECURRING_LOOKAHEAD_DAYS = 30;

/** Shape of a BookingSlot row — structural, so mapper tests need no live DB. */
export interface PrismaBookingSlotRow {
  id: string;
  workerId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  note: string | null;
  bookingId: string | null;
}

/** Shape of a Booking row (with optional relations) — structural, no DB needed. */
export interface PrismaBookingRow {
  id: string;
  number: string;
  workerId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  /** The customer's User row — its locale is the customer's preferred
   * notification language (mapped to Booking.customerLocale). Optional: only
   * queries that include `customer: { select: { locale: true } }` carry it. */
  customer?: { locale: string | null } | null;
  jobTitle: string;
  note: string | null;
  /** Null for slot-less multi-candidate quote bids (QUOTING/QUOTED). */
  startAt: Date | null;
  endAt: Date | null;
  status: string;
  quote: number | null;
  deposit: number | null;
  platformFee: number | null;
  platformFeeRateBps: number | null;
  currency: string;
  paymentId: string | null;
  /** Set when this booking is an occurrence of a recurring contract (W2). */
  recurringBookingId: string | null;
  /** Multi-candidate quotes — the QuoteRequest this bid belongs to. */
  quoteRequestId?: string | null;
  /** §2.2 request SLA — the nudge stamp (null/absent = never nudged). */
  lastSlaNudgeAt?: Date | null;
  serviceItem?: {
    nameEn: string;
    nameAr: string;
    price: number;
    unit: string;
  } | null;
  events?: {
    status: string;
    actorType: string;
    reason: string | null;
    createdAt: Date;
  }[];
  /** The booking's deposit Payment row, when one exists (M3) — its receipt. */
  payment?: {
    id: string;
    amount: number;
    status: string;
    method?: string | null;
    providerRef?: string | null;
    refundedAt?: Date | null;
    invoice?: {
      number: string;
      amount: number;
      currency: string;
      status: string;
      paidAt: Date | null;
      createdAt: Date;
    } | null;
  } | null;
}

/** Map a BookingSlot row to the domain type (status enum lowercased). */
export function rowToSlot(row: PrismaBookingSlotRow): BookingSlot {
  return {
    id: row.id,
    workerId: row.workerId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    status: SLOT_STATUS_DB_TO_APP[row.status] ?? "available",
    note: row.note ?? undefined,
    bookingId: row.bookingId ?? undefined,
  };
}

/**
 * Shape of a QuoteRequest row (+ its invited-worker Bookings, oldest first) —
 * structural, so mapper tests need no live DB. The bookings carry the same
 * optional relations toDomainBooking reads (events / serviceItem).
 */
export interface PrismaQuoteRequestRow {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  jobTitle: string;
  note: string | null;
  categorySlug: string;
  citySlug: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  serviceItem?: {
    nameEn: string;
    nameAr: string;
    price: number;
    unit: string;
  } | null;
  bookings?: PrismaBookingRow[];
}

/** Map a QuoteRequest row (+ its bookings) to the domain type. */
export function toDomainQuoteRequest(row: PrismaQuoteRequestRow): QuoteRequest {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail ?? undefined,
    jobTitle: row.jobTitle,
    note: row.note ?? undefined,
    serviceItem: row.serviceItem
      ? {
          nameEn: row.serviceItem.nameEn,
          nameAr: row.serviceItem.nameAr,
          price: row.serviceItem.price,
          unit: row.serviceItem.unit === "hour" ? "hour" : "job",
        }
      : undefined,
    categorySlug: row.categorySlug,
    citySlug: row.citySlug,
    status: QUOTE_STATUS_DB_TO_APP[row.status] ?? "open",
    expiresAt: row.expiresAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    bookings: (row.bookings ?? []).map(toDomainBooking),
  };
}

/** Map a Booking row (+ events + serviceItem) to the domain type. */
export function toDomainBooking(row: PrismaBookingRow): Booking {
  const currency = (row.currency || "USD") as CurrencyCode;
  return {
    id: row.id,
    number: row.number,
    workerId: row.workerId,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail ?? undefined,
    // The customer's preferred notification language — User.locale via the
    // customer relation (absent → "en": the user never chose a language).
    customerLocale: row.customer?.locale === "ar" ? "ar" : "en",
    jobTitle: row.jobTitle,
    note: row.note ?? undefined,
    // quote/deposit are minor units in BOTH the DB and the domain (the action
    // converts major→minor before calling the seam) — mapped as-is, unlike
    // worker prices which divide by 100 (see toDomainWorker).
    quote: row.quote ?? undefined,
    deposit: row.deposit ?? undefined,
    // M5 take rate — the fee snapshot maps as-is (minor units); the audit
    // rate rides alongside (the customer row derives net = quote − fee).
    platformFee: row.platformFee ?? undefined,
    platformFeeRateBps: row.platformFeeRateBps ?? undefined,
    currency,
    paymentId: row.paymentId ?? undefined,
    // M3 receipt — the Invoice row tied to the deposit Payment. Amount is
    // minor units in both stores, mapped as-is; PAID maps to "paid", VOID
    // (flipped when the deposit is refunded) maps to "voided" so the customer
    // row strikes it through; any other DB status renders as the paid pill.
    invoice: row.payment?.invoice
      ? {
          number: row.payment.invoice.number,
          amount: row.payment.invoice.amount,
          currency: row.payment.invoice.currency as CurrencyCode,
          status: row.payment.invoice.status === "VOID" ? "voided" : "paid",
          date: (row.payment.invoice.paidAt ?? row.payment.invoice.createdAt).toISOString(),
        }
      : undefined,
    // §2.4 — the deposit payment state (gates the admin Refund-deposit action).
    paymentStatus: row.payment?.status ? (row.payment.status.toLowerCase() as BookingPayment["status"]) : undefined,
    // §Lebanon — the deposit payment method (set once a checkout was minted);
    // the dispute view gates the manual OMT/Whish Confirm-payment action.
    paymentMethod: row.payment?.method ? toDomainPaymentMethod(row.payment.method) : undefined,
    // Slot-less quote bids map to undefined — the UI hides the time row.
    startAt: row.startAt?.toISOString(),
    endAt: row.endAt?.toISOString(),
    status: BOOKING_STATUS_DB_TO_APP[row.status] ?? "requested",
    recurringId: row.recurringBookingId ?? undefined,
    quoteRequestId: row.quoteRequestId ?? undefined,
    // §2.2 — the request-SLA nudge stamp (true once the cron has nudged the
    // worker about this unanswered request).
    slaNudgeSent: row.lastSlaNudgeAt != null ? true : undefined,
    serviceItem: row.serviceItem
      ? {
          nameEn: row.serviceItem.nameEn,
          nameAr: row.serviceItem.nameAr,
          // Seed stores ServiceItem prices in major units (mirrors the demo
          // dataset — see toDomainWorker's direct mapping).
          price: row.serviceItem.price,
          unit: row.serviceItem.unit === "hour" ? "hour" : "job",
        }
      : undefined,
    events: (row.events ?? []).map((e) => ({
      status: BOOKING_STATUS_DB_TO_APP[e.status] ?? "requested",
      actorType: e.actorType,
      reason: e.reason ?? undefined,
      time: e.createdAt.toISOString(),
    })),
  };
}

/** Shape of a BookingMessage row — structural, so mapper tests need no live
 * DB. Sent by the customer, the worker, or (in real mode) a platform admin. */
export interface PrismaBookingMessageRow {
  id: string;
  bookingId: string;
  senderRole: string;
  senderId: string | null;
  text: string;
  quote: number | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Map a BookingMessage row to the domain type (§2.3 chat thread). */
export function toDomainBookingMessage(row: PrismaBookingMessageRow): BookingMessage {
  return {
    id: row.id,
    bookingId: row.bookingId,
    senderRole: row.senderRole,
    ...(row.senderId ? { senderId: row.senderId } : {}),
    text: row.text,
    ...(row.quote !== null ? { quote: row.quote } : {}),
    ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
    time: row.createdAt.toISOString(),
  };
}

/** Shape of a RecurringBooking row (+ its materialized occurrences, oldest
 * first) — structural, so mapper tests need no live DB. */
export interface PrismaRecurringRow {
  id: string;
  number: string;
  workerId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  serviceItem?: {
    nameEn: string;
    nameAr: string;
    price: number;
    unit: string;
  } | null;
  jobTitle: string;
  note: string | null;
  frequency: string;
  anchorStart: Date;
  anchorEnd: Date;
  status: string;
  createdAt: Date;
  occurrences: PrismaBookingRow[];
}

/** Map a RecurringBooking row (+ occurrences) to the domain type (W2). */
export function toDomainRecurring(row: PrismaRecurringRow): RecurringBooking {
  return {
    id: row.id,
    number: row.number,
    workerId: row.workerId,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail ?? undefined,
    serviceItem: row.serviceItem
      ? {
          nameEn: row.serviceItem.nameEn,
          nameAr: row.serviceItem.nameAr,
          price: row.serviceItem.price,
          unit: row.serviceItem.unit === "hour" ? "hour" : "job",
        }
      : undefined,
    jobTitle: row.jobTitle,
    note: row.note ?? undefined,
    frequency: RECURRING_FREQUENCY_DB_TO_APP[row.frequency] ?? "weekly",
    anchorStart: row.anchorStart.toISOString(),
    anchorEnd: row.anchorEnd.toISOString(),
    status: RECURRING_STATUS_DB_TO_APP[row.status] ?? "active",
    occurrences: (row.occurrences ?? []).map(toDomainBooking),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A worker's slots within a window, oldest first (mirrors demoGetWorkerSlots).
 *
 * BOUND NOTE: `to` is EXCLUSIVE (`startAt <= to`), while prismaGenerateSlots
 * treats its `to` as day-INCLUSIVE (the walk covers the whole `to` day). To
 * read back a full generated day, pass end-of-day (e.g. today+7d−1ms) — the
 * dashboard's availability window and db:smoke both do this.
 */
export async function prismaGetWorkerSlots(
  workerId: string,
  range: { from?: string; to?: string } = {}
): Promise<BookingSlot[]> {
  const prisma = getPrisma();
  const rows = await prisma.bookingSlot.findMany({
    where: {
      workerId,
      ...(range.from ? { endAt: { gte: new Date(range.from) } } : {}),
      ...(range.to ? { startAt: { lte: new Date(range.to) } } : {}),
    },
    orderBy: { startAt: "asc" },
  });
  return rows.map(rowToSlot);
}

/** A worker's bookings, newest first, with optional status filter + limit. */
export async function prismaGetWorkerBookings(
  workerId: string,
  opts: { status?: BookingStatus; limit?: number } = {}
): Promise<Booking[]> {
  const prisma = getPrisma();
  const rows = await prisma.booking.findMany({
    where: {
      workerId,
      ...(opts.status ? { status: BOOKING_STATUS_APP_TO_DB[opts.status] } : {}),
    },
    orderBy: { startAt: "desc" },
    take: opts.limit,
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      // M3 — the deposit Payment's Invoice row feeds Booking.invoice on the
      // customer /bookings page.
      payment: { include: { invoice: true } },
    },
  });
  return rows.map(toDomainBooking);
}

/**
 * A single booking by its human-readable number (BK-…), or null — powers the
 * admin dispute view (/admin/bookings/[number]), which the activity feed's
 * booking entries deep-link to. Loads the full event trail (the dispute
 * timeline), the service item and the M3 receipt — same include set as the
 * worker/customer reads.
 */
export async function prismaGetBookingByNumber(number: string): Promise<Booking | null> {
  const prisma = getPrisma();
  const row = await prisma.booking.findUnique({
    where: { number },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      payment: { include: { invoice: true } },
    },
  });
  return row ? toDomainBooking(row) : null;
}

/** A single booking by its internal id — the §2.3 chat gate's lookup (same
 * include set as the number lookup, so the gate sees the real trail). */
export async function prismaGetBookingById(id: string): Promise<Booking | null> {
  const prisma = getPrisma();
  const row = await prisma.booking.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      payment: { include: { invoice: true } },
    },
  });
  return row ? toDomainBooking(row) : null;
}

/**
 * The negotiation thread for one booking (§2.3) — oldest first, the order the
 * UI renders (mirrors demoGetBookingMessages / the chat component's display).
 */
export async function prismaGetBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  const prisma = getPrisma();
  const rows = await prisma.bookingMessage.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" as const },
  });
  return rows.map(toDomainBookingMessage);
}

/**
 * Append a message to a booking's thread (§2.3). Returns null when the booking
 * is unknown (callers surface "not-found"). The sender is actor-stamped like
 * an audit entry (role + optional real user id), so the negotiation stays
 * inside the booking's record on both adapters. Quote is minor units — the
 * price the worker shares in-thread (the same ×100 convention as Booking.quote).
 */
export async function prismaSendBookingMessage(
  bookingId: string,
  input: BookingMessageInput
): Promise<BookingMessage | null> {
  const prisma = getPrisma();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
  if (!booking) return null;
  // §2.3 — the message and its MESSAGE audit event land atomically, so the
  // dispute timeline can never miss a negotiation step (message body = reason,
  // sender stamped as the actor).
  const [row] = await prisma.$transaction([
    prisma.bookingMessage.create({
      data: {
        bookingId,
        senderRole: input.senderRole,
        ...(input.senderId ? { senderId: input.senderId } : {}),
        text: input.text,
        ...(input.quote !== undefined ? { quote: input.quote } : {}),
      },
    }),
    prisma.bookingEvent.create({
      data: {
        bookingId,
        status: "MESSAGE",
        actorType: input.senderRole,
        ...(input.senderId ? { actorId: input.senderId } : {}),
        reason: input.text,
      },
    }),
  ]);
  return toDomainBookingMessage(row);
}

/**
 * Read receipt — stamp readAt on every message the OTHER party sent (their
 * messages are "seen" when the counterpart opens the thread). Idempotent
 * (updateMany on readAt IS NULL) and the reader's own messages are never
 * stamped. Returns the number of messages newly marked.
 */
export async function prismaMarkChatRead(
  bookingId: string,
  readerRole: "customer" | "worker"
): Promise<number> {
  const prisma = getPrisma();
  const res = await prisma.bookingMessage.updateMany({
    where: { bookingId, senderRole: { not: readerRole }, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

/**
 * Lean read-receipt lookup for the presence poll — only the stamped ids + the
 * readAt timestamp, so a client polling every few seconds doesn't drag the
 * whole thread over the wire.
 */
export async function prismaGetBookingMessageReadAt(
  bookingId: string
): Promise<{ id: string; readAt: Date }[]> {
  const prisma = getPrisma();
  const rows = await prisma.bookingMessage.findMany({
    where: { bookingId, readAt: { not: null } },
    select: { id: true, readAt: true },
  });
  return rows.filter((r): r is { id: string; readAt: Date } => r.readAt !== null);
}

/**
 * Customer side: accept the worker's quoted price straight from the chat
 * thread — the REQUESTED booking converts to CONFIRMED with the message's
 * quote (minor units), the slot is booked, the M5 take-rate fee is stamped
 * from the worker's current plan, and the confirmation lands in the audit
 * trail as a customer action. The message + state re-check happen INSIDE the
 * transaction (the quoted row is fetched under the same tx, so a concurrent
 * respond cannot race the accept). Returns null when the booking is not in a
 * negotiable state or the message isn't a worker quote (callers surface
 * "not-found").
 */
export async function prismaAcceptChatQuote(
  bookingId: string,
  messageId: string
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true, worker: { include: { subscription: true } } },
      });
      if (!row || row.status !== "REQUESTED") return null;
      const message = await tx.bookingMessage.findUnique({
        where: { id: messageId, bookingId, senderRole: "worker" },
      });
      if (!message || message.quote === null) return null;

      // M5 take rate — the fee is a snapshot of the validated quote (minor
      // units) from the worker's CURRENT plan, same compute as respond.
      const exempt = isPlanFeeExempt(row.worker.subscription?.plan);
      const platformFee = computePlatformFee(message.quote, { exempt });
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: "REQUESTED" },
        data: {
          status: "CONFIRMED",
          quote: message.quote,
          platformFee,
          platformFeeRateBps: PLATFORM_FEE_RATE_BPS,
        },
      });
      if (updated.count === 0) return null;
      if (row.slot) await tx.bookingSlot.update({ where: { id: row.slot.id }, data: { status: "BOOKED" } });
      await tx.bookingEvent.create({
        data: {
          bookingId,
          status: "CONFIRMED",
          actorType: "customer",
          reason: "Accepted the worker's chat quote",
        },
      });
      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          worker: true,
        },
      });
    });

    if (!result) return null;
    await pushNotification(
      bookingNotification(toDomainBooking(result), "worker-quote-accepted"),
      result.worker
        ? {
            name: result.worker.nameEn,
            ...(result.worker.email ? { email: result.worker.email } : {}),
            phone: result.worker.phone,
            // The worker's preferred language (first listed) — same rule as
            // every other worker notification, not always EN.
            locale: (result.worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en",
          }
        : undefined
    );
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] acceptChatQuote failed:", err);
    return null;
  }
}

/**
 * A customer's bookings, matched by email or normalized phone — mirrors
 * demoGetCustomerBookings (the /bookings page keyed the same way: session
 * email for signed-in customers, raw phone for guests). Phone parity: BOTH
 * sides strip spaces/dashes/parentheses, so "+966 50 999 9999" stored matches
 * a guest typing "+966509999999". findMany has no regexp string filter, so
 * the candidate ids come from a Postgres regexp_replace query (only `id` is
 * selected — no column-mapping risk), then the rows load through the normal
 * client include and toDomainBooking. Newest first, like the demo.
 */
export async function prismaGetCustomerBookings(
  identifier: { email?: string; phone?: string } = {}
): Promise<Booking[]> {
  const prisma = getPrisma();
  // Trim is deliberate — the /bookings page trims its inputs, and the demo's
  // string compare would miss a stray-space email; keep both sides clean.
  const email = identifier.email?.trim().toLowerCase();
  const phone = identifier.phone?.replace(/[\s\-()]/g, "");

  let ids: string[] = [];
  if (email || phone) {
    // Ordering happens in the findMany below — the raw query only picks ids.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT b."id"
      FROM "Booking" b
      WHERE (${email ?? null}::text IS NOT NULL AND LOWER(b."customerEmail") = ${email ?? null})
         OR (${phone ?? null}::text IS NOT NULL
             AND REGEXP_REPLACE(b."customerPhone", ${PHONE_SEP_PATTERN}, '', 'g') = ${phone ?? null})
    `;
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) return [];

  const rows = await prisma.booking.findMany({
    where: { id: { in: ids } },
    orderBy: { startAt: "desc" },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      payment: { include: { invoice: true } },
    },
  });
  return rows.map(toDomainBooking);
}

/**
 * M4 admin funnel — booking counts by status + REQUESTED→CONFIRMED conversion
 * over the last `days` (mirrors getVerificationFunnel). One grouped query on
 * Booking.createdAt (the window is the creation cutoff, matching the demo's
 * first-event semantics), then the counts map through the shared
 * emptyBookingFunnelCounts so every status key is present and the conversion
 * math stays identical to the demo adapter's tallyBookingFunnel.
 */
/**
 * §2.4 admin export — every booking's full event trail (the CSV/PDF trails
 * export on /admin), same include set as the per-booking read (events,
 * service item, M3 receipt) so the combined document matches the dispute
 * view. Production TODO: paginate for very large stores.
 */
export async function prismaGetAllBookings(): Promise<Booking[]> {
  const prisma = getPrisma();
  const rows = await prisma.booking.findMany({
    orderBy: { startAt: "asc" },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      payment: { include: { invoice: true } },
    },
  });
  return rows.map(toDomainBooking);
}

export async function prismaGetBookingFunnel(days = 30): Promise<BookingFunnel> {
  const prisma = getPrisma();
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const groups = await prisma.booking.groupBy({
    by: ["status"],
    where: { createdAt: { gte: new Date(cutoffMs) } },
    _count: { _all: true },
  });
  const counts = emptyBookingFunnelCounts();
  for (const g of groups) {
    const app = BOOKING_STATUS_DB_TO_APP[g.status] ?? "requested";
    counts[app] = g._count._all;
  }
  const total = groups.reduce((s, g) => s + g._count._all, 0);
  return {
    counts,
    total,
    conversionRate: bookingConversionRate(counts),
  };
}

/**
 * M5 admin revenue — platform take-rate fees over the last `days`, straight
 * from the live Booking rows (the funnel card's money twin). One query on
 * Booking.createdAt with the payment status, then the shared
 * tallyPlatformFeeStats keeps the math identical to the demo adapter: gross =
 * the fee snapshots stamped at quoted accepts, refunded = fees on bookings
 * whose paid deposit was refunded (payment REFUNDED), net = gross − refunded.
 */
export async function prismaGetPlatformFeeStats(days = 30): Promise<PlatformFeeStats> {
  const prisma = getPrisma();
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await prisma.booking.findMany({
    where: { createdAt: { gte: new Date(cutoffMs) }, platformFee: { not: null } },
    select: { platformFee: true, createdAt: true, currency: true, payment: { select: { status: true } } },
  });
  return tallyPlatformFeeStats(
    rows.map((r) => ({
      platformFee: r.platformFee ?? undefined,
      refunded: r.payment?.status === "REFUNDED",
      createdMs: r.createdAt.getTime(),
      currency: (r.currency || "USD") as CurrencyCode,
    })),
    cutoffMs
  );
}

/* ─────────────────────────────── Worker payouts (docs/payouts.md) ─────────────────────────────── */

/** Ledger row → domain (kind/status lowercased, amounts minor as-is). */
function toDomainLedgerEntry(row: {
  id: string;
  workerId: string;
  bookingId: string | null;
  kind: $Enums.LedgerKind;
  status: $Enums.LedgerStatus;
  amount: number;
  balanceAfter: number;
  currency: string;
  reason: string | null;
  createdAt: Date;
}): LedgerEntry {
  return {
    id: row.id,
    workerId: row.workerId,
    bookingId: row.bookingId ?? undefined,
    kind: row.kind.toLowerCase() as LedgerEntry["kind"],
    status: row.status.toLowerCase() as LedgerEntry["status"],
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    currency: (row.currency || "USD") as CurrencyCode,
    reason: row.reason ?? undefined,
    time: row.createdAt.toISOString(),
  };
}

/**
 * Credit a completed booking's net earnings (quote − platform fee) inside the
 * transition tx. Idempotent via @@unique([bookingId]): a concurrent or
 * redelivered completion's insert hits P2002 and is swallowed — the tx still
 * commits, the worker is never double-credited.
 */
async function creditEarningsInTx(
  tx: Prisma.TransactionClient,
  row: { id: string; workerId: string; quote: number | null; platformFee: number | null; currency: string }
): Promise<void> {
  const net = (row.quote ?? 0) - (row.platformFee ?? 0);
  if (net <= 0) return; // quote-less accept or fee-waived 0 — nothing earned
  try {
    const sum = await tx.workerLedgerEntry.aggregate({
      where: { workerId: row.workerId, status: { in: ["POSTED", "PROCESSED"] } },
      _sum: { amount: true },
    });
    const balance = sum._sum.amount ?? 0;
    await tx.workerLedgerEntry.create({
      data: {
        workerId: row.workerId,
        bookingId: row.id,
        kind: "EARNING",
        status: "POSTED",
        amount: net,
        balanceAfter: balance + net,
        currency: row.currency || "USD",
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err; // idempotency: already credited
  }
}

/** The worker's spendable balance from the live ledger (docs/payouts.md). */
export async function prismaGetWorkerBalance(workerId: string): Promise<WorkerBalance> {
  const prisma = getPrisma();
  const [worker, sum, pendingSum] = await Promise.all([
    prisma.worker.findUnique({ where: { id: workerId }, select: { city: { select: { currency: true } } } }),
    prisma.workerLedgerEntry.aggregate({
      where: { workerId, status: { in: ["POSTED", "PROCESSED"] } },
      _sum: { amount: true },
    }),
    prisma.workerLedgerEntry.aggregate({
      where: { workerId, kind: "WITHDRAWAL", status: "PENDING" },
      _sum: { amount: true },
    }),
  ]);
  return {
    availableMinor: sum._sum.amount ?? 0,
    pendingMinor: Math.abs(pendingSum._sum.amount ?? 0),
    currency: (worker?.city?.currency as CurrencyCode) ?? "USD",
  };
}

/**
 * Worker requests a withdrawal of part of the available balance. Inside
 * $transaction: validates amount ≤ available − pending (pending reserves its
 * amount, so a worker can't double-spend while a request is in review), then
 * creates a PENDING WITHDRAWAL — balance unchanged until an admin decides it.
 */
export async function prismaRequestPayout(
  workerId: string,
  amountMinor: number,
  reason?: string
): Promise<LedgerEntry | { error: "invalid" | "insufficient" }> {
  const prisma = getPrisma();
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return { error: "invalid" };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const worker = await tx.worker.findUnique({
        where: { id: workerId },
        select: { city: { select: { currency: true } } },
      });
      if (!worker) return null;
      const [sum, pendingSum] = await Promise.all([
        tx.workerLedgerEntry.aggregate({
          where: { workerId, status: { in: ["POSTED", "PROCESSED"] } },
          _sum: { amount: true },
        }),
        tx.workerLedgerEntry.aggregate({
          where: { workerId, kind: "WITHDRAWAL", status: "PENDING" },
          _sum: { amount: true },
        }),
      ]);
      const available = sum._sum.amount ?? 0;
      const pending = Math.abs(pendingSum._sum.amount ?? 0);
      if (amountMinor > available - pending) return { error: "insufficient" as const };
      return tx.workerLedgerEntry.create({
        data: {
          workerId,
          kind: "WITHDRAWAL",
          status: "PENDING",
          amount: -amountMinor,
          balanceAfter: available, // unchanged while pending
          currency: (worker.city?.currency as CurrencyCode) ?? "USD",
          reason: reason ?? null,
        },
      });
    });
    if (!result) return { error: "invalid" };
    if ("error" in result) return result;
    return toDomainLedgerEntry(result);
  } catch (err) {
    console.error("[prisma-repo] requestPayout failed:", err);
    return { error: "invalid" };
  }
}

/**
 * Admin decides a PENDING payout: approve → PROCESSED (now counts as a debit,
 * balanceAfter recomputed in-tx); reject → REJECTED (dead, never counts). The
 * updateMany WHERE status=PENDING is the CAS — two admins can't both decide.
 */
export async function prismaDecidePayout(
  payoutId: string,
  approve: boolean,
  reason?: string,
  reviewedBy?: string
): Promise<LedgerEntry | null> {
  const prisma = getPrisma();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.workerLedgerEntry.findUnique({ where: { id: payoutId } });
      if (!existing || existing.kind !== "WITHDRAWAL" || existing.status !== "PENDING") return null;
      if (approve) {
        const sum = await tx.workerLedgerEntry.aggregate({
          where: { workerId: existing.workerId, status: { in: ["POSTED", "PROCESSED"] } },
          _sum: { amount: true },
        });
        // PENDING is excluded from the sum above — flipping it to PROCESSED
        // makes it a debit, so balanceAfter reflects the new running balance.
        const updated = await tx.workerLedgerEntry.updateMany({
          where: { id: payoutId, status: "PENDING" },
          data: {
            status: "PROCESSED",
            balanceAfter: (sum._sum.amount ?? 0) + existing.amount,
            reviewedBy: reviewedBy ?? null,
            reviewedAt: new Date(),
            reason: reason ?? existing.reason,
          },
        });
        if (updated.count === 0) return null;
      } else {
        const updated = await tx.workerLedgerEntry.updateMany({
          where: { id: payoutId, status: "PENDING" },
          data: { status: "REJECTED", reviewedBy: reviewedBy ?? null, reviewedAt: new Date(), reason: reason ?? existing.reason },
        });
        if (updated.count === 0) return null;
      }
      return tx.workerLedgerEntry.findUnique({ where: { id: payoutId } });
    });
    return row ? toDomainLedgerEntry(row) : null;
  } catch (err) {
    console.error("[prisma-repo] decidePayout failed:", err);
    return null;
  }
}

/** A worker's payout history — withdrawals newest first. */
export async function prismaGetWorkerPayouts(workerId: string): Promise<LedgerEntry[]> {
  const prisma = getPrisma();
  const rows = await prisma.workerLedgerEntry.findMany({
    where: { workerId, kind: "WITHDRAWAL" },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainLedgerEntry);
}

/** Admin queue — every WITHDRAWAL still in review, oldest first. */
export async function prismaGetPendingPayouts(): Promise<LedgerEntry[]> {
  const prisma = getPrisma();
  const rows = await prisma.workerLedgerEntry.findMany({
    where: { kind: "WITHDRAWAL", status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDomainLedgerEntry);
}

/**
 * Customer side: request a booking on an AVAILABLE slot. Runs inside
 * prisma.$transaction — rule 1's atomic claim and rules 2/5 are indivisible,
 * so a crash mid-flight rolls everything back (slot stays AVAILABLE).
 */
/** Booking row + events + serviceItem, as returned by the create/respond txs. */
type BookingFullRow = Prisma.BookingGetPayload<{
  include: { events: true; serviceItem: true };
}>;

/** Worker fields needed for the post-transaction notification. */
type BookingWorkerInfo = {
  nameEn: string;
  email: string | null;
  phone: string;
  languages: unknown;
};

/**
 * The one-shot slot claim + booking create, shared by prismaCreateBookingRequest
 * and prismaCreateRecurringRequest (the recurring request runs it INSIDE its
 * own tx, then adds the contract row — so a contract-number collision rolls
 * back the slot claim too). Returns the full booking row + the worker's
 * notification fields.
 */
async function createBookingRequestTx(
  tx: Prisma.TransactionClient,
  input: BookingRequestInput
): Promise<{ ok: true; booking: BookingFullRow; worker: BookingWorkerInfo } | { ok: false; error: "slot-taken" | "invalid" }> {
  const worker = await tx.worker.findUnique({
    where: { id: input.workerId },
    select: {
      id: true,
      nameEn: true,
      email: true,
      phone: true,
      languages: true,
      city: { select: { currency: true } },
    },
  });
  if (!worker) return { ok: false, error: "invalid" };

  const slot = await tx.bookingSlot.findUnique({ where: { id: input.slotId } });
  if (!slot || slot.workerId !== input.workerId) return { ok: false, error: "invalid" };

  // Rule 2 FIRST — overlap guard against the same worker's
  // RESERVED/BOOKED/BLOCKED slots (half-open [startAt, endAt)). This
  // must run BEFORE the claim: a rejection here RETURNS (it doesn't
  // throw), and a returning transaction COMMITS — claiming first would
  // leave an orphaned RESERVED slot with no booking (review-caught
  // parity bug vs the demo adapter, which checks overlap first).
  const clash = await tx.bookingSlot.findFirst({
    where: {
      workerId: input.workerId,
      id: { not: slot.id },
      status: { in: ["RESERVED", "BOOKED", "BLOCKED"] },
      startAt: { lt: slot.endAt },
      endAt: { gt: slot.startAt },
    },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "slot-taken" };

  // Rule 1 — atomic claim: WHERE status=AVAILABLE re-checks the slot
  // state at write time while the row is locked (the Postgres row-lock
  // the doc calls for) and stays the backstop for the exact-slot race.
  const claimed = await tx.bookingSlot.updateMany({
    where: { id: slot.id, workerId: input.workerId, status: "AVAILABLE" },
    data: { status: "RESERVED" },
  });
  if (claimed.count === 0) return { ok: false, error: "slot-taken" };

  // Resolve the picked service item to its stable DB row (by nameEn,
  // the identity the customer dialog sends — same as the action).
  const serviceItem = input.serviceItem
    ? await tx.serviceItem.findFirst({
        where: { workerId: input.workerId, nameEn: input.serviceItem.nameEn },
        select: { id: true, nameEn: true, nameAr: true, price: true, unit: true },
      })
    : null;

  // Human-readable number: seed owns BK-1001, so the next one derives
  // from the row count (bookings are never hard-deleted, so count stays
  // stable; concurrent collisions retry above on P2002).
  const count = await tx.booking.count();
  const booking = await tx.booking.create({
    data: {
      number: `BK-${1001 + count}`,
      workerId: input.workerId,
      // Signed-in customer id — null for guest (phone-keyed) requests.
      // The confirm tx uses it to decide whether to mint an Invoice.
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      jobTitle: input.jobTitle,
      note: input.note,
      serviceItemId: serviceItem?.id ?? null,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: "REQUESTED",
      currency: worker.city?.currency ?? "USD",
      isEmergency: input.isEmergency ?? false,
    },
  });
  // Rule 5 — audit event (same tx as the claim + create).
  await tx.bookingEvent.create({
    data: { bookingId: booking.id, status: "REQUESTED", actorType: "customer" },
  });
  // Ordering invariant (mirrors the demo adapter): the slot's bookingId
  // is stamped last, still inside the tx — a RESERVED slot always has
  // a booking.
  await tx.bookingSlot.update({ where: { id: slot.id }, data: { bookingId: booking.id } });

  const full = await tx.booking.findUnique({
    where: { id: booking.id },
    include: { events: { orderBy: { createdAt: "asc" as const } }, serviceItem: true },
  });
  return { ok: true, booking: full!, worker };
}

export async function prismaCreateBookingRequest(
  input: BookingRequestInput
): Promise<Booking | { error: "slot-taken" | "invalid" }> {
  const prisma = getPrisma();

  // The count-derived booking number can collide with a CONCURRENT request
  // (Booking.number is unique): the loser's whole transaction rolls back — the
  // slot claim included — so a bounded retry re-claims with the next number.
  // Prisma reports the unique violation as P2002 (duck-typed — no runtime
  // Prisma import needed in this module).
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";
  // P2028 = Transaction API error. "Unable to start a transaction in the given
  // time" is Prisma's maxWait (5s default) exceeded while the transaction
  // waited on the slot row lock — under N parallel claims on one slot the
  // losers time out waiting. That IS the "someone else claimed it" outcome,
  // not a failure: the whole tx rolled back, so the slot was never theirs.
  const isContentionTimeout = (err: unknown) => (err as { code?: string })?.code === "P2028";

  for (let attempt = 0; attempt < 3; attempt++) {
    let created: { ok: true; booking: BookingFullRow; worker: BookingWorkerInfo } | { ok: false; error: "slot-taken" | "invalid" };
    try {
      created = await prisma.$transaction((tx) => createBookingRequestTx(tx, input));
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue; // whole tx rolled back — retry
      if (isContentionTimeout(err)) return { error: "slot-taken" };
      console.error("[prisma-repo] createBookingRequest failed:", err);
      return { error: "invalid" };
    }

    if (!created.ok) return { error: created.error };

    // Notify the worker AFTER the tx (the inbox write must not share its locks).
    const workerLocale = (created.worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
    await pushNotification(
      bookingNotification(toDomainBooking(created.booking), "worker-request"),
      {
        name: created.worker.nameEn,
        email: created.worker.email ?? undefined,
        phone: created.worker.phone,
        locale: workerLocale,
      }
    );

    // Emergency requests: auto-create masked numbers immediately
    if (input.isEmergency) {
      const { createMaskedNumbers } = await import("@/lib/calling/masked-number-service");
      try {
        await createMaskedNumbers({
          workerId: input.workerId,
          customerPhone: input.customerPhone,
          bookingId: created.booking.id,
          expirationDays: 3,
        });
      } catch {
        // Non-fatal — masked numbers can be created later
      }
    }

    return toDomainBooking(created.booking);
  }
  return { error: "invalid" };
}

/**
 * Worker side: accept (with optional quote/deposit) or decline a REQUESTED
 * booking. Accept → CONFIRMED (or PENDING_PAYMENT when a deposit is set) and
 * the slot becomes BOOKED; decline → DECLINED and the slot returns to
 * AVAILABLE (rule 3). The status flip is a CAS inside $transaction so two
 * responses can't both win. Returns null for unknown/non-REQUESTED bookings.
 */
export async function prismaRespondToBooking(
  bookingId: string,
  input: BookingRespondInput
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true, worker: { include: { subscription: true } } },
      });
      if (!row || row.status !== "REQUESTED") return null;
      const slot = row.slot;

      if (input.accept) {
        // Rule 4 — a deposit flips to PENDING_PAYMENT until paymentId lands.
        const status = input.deposit ? "PENDING_PAYMENT" : "CONFIRMED";
        // M5 take rate (docs/booking-take-rate.md) — the fee is a snapshot of
        // the validated quote (minor units), computed inside the tx from the
        // worker's CURRENT plan so an Enterprise subscription waives it. The
        // same computePlatformFee the RespondDialog previews — no drift.
        const quoteMinor = input.quote ?? null;
        const exempt = isPlanFeeExempt(row.worker.subscription?.plan);
        const platformFee = quoteMinor ? computePlatformFee(quoteMinor, { exempt }) : null;
        const updated = await tx.booking.updateMany({
          where: { id: bookingId, status: "REQUESTED" },
          data: {
            status,
            quote: quoteMinor,
            deposit: input.deposit ?? null,
            platformFee,
            platformFeeRateBps: quoteMinor ? PLATFORM_FEE_RATE_BPS : null,
          },
        });
        if (updated.count === 0) return null;
        // M3 — every deposit gets a Payment row (PENDING) so the checkout can
        // attach to it; userId is null for guest (phone-keyed) customers.
        if (input.deposit) {
          const payment = await tx.payment.create({
            data: {
              userId: row.customerId,
              amount: input.deposit,
              currency: row.currency || "USD",
              method: "STRIPE",
              status: "PENDING",
              metadata: { bookingId },
            },
          });
          await tx.booking.update({ where: { id: bookingId }, data: { paymentId: payment.id } });
        }
        if (slot) await tx.bookingSlot.update({ where: { id: slot.id }, data: { status: "BOOKED" } });
        await tx.bookingEvent.create({ data: { bookingId, status, actorType: "worker" } });
      } else {
        const updated = await tx.booking.updateMany({
          where: { id: bookingId, status: "REQUESTED" },
          data: { status: "DECLINED", declinedReason: input.declineReason ?? null },
        });
        if (updated.count === 0) return null;
        if (slot) {
          // Rule 3 — decline frees the slot and unlinks the booking.
          await tx.bookingSlot.update({
            where: { id: slot.id },
            data: { status: "AVAILABLE", bookingId: null },
          });
        }
        await tx.bookingEvent.create({
          data: { bookingId, status: "DECLINED", actorType: "worker", reason: input.declineReason ?? null },
        });
      }

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          customer: { select: { locale: true } },
        },
      });
    });

    if (!result) return null;
    const accepted = result.status === "CONFIRMED" || result.status === "PENDING_PAYMENT";
    await pushNotification(
      bookingNotification(toDomainBooking(result), accepted ? "customer-confirmed" : "customer-declined"),
      result.customerEmail
        ? {
            name: result.customerName,
            email: result.customerEmail,
            phone: result.customerPhone,
            // The customer's preferred language (User.locale) — not always EN.
            locale: result.customer?.locale === "ar" ? "ar" : "en",
          }
        : undefined
    );
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] respondToBooking failed:", err);
    return null;
  }
}

/* ─────────────── Multi-candidate quotes (docs/multi-candidate-quotes.md) ─────────────── */

const QUOTE_INCLUDE = {
  serviceItem: true,
  bookings: {
    include: { events: { orderBy: { createdAt: "asc" as const } }, serviceItem: true },
  },
} as const;

/**
 * A customer's quote jobs, matched by the signed-in customerId, email or
 * normalized phone — mirrors prismaGetCustomerBookings (same raw-query id
 * pick + include) AND prismaGetQuoteRequest's ownership check: the email is
 * optional on the quote form, so a signed-in customer who skips it must still
 * see their own jobs. Newest first.
 */
export async function prismaGetCustomerQuoteRequests(
  identifier: { email?: string; phone?: string; customerId?: string } = {}
): Promise<QuoteRequest[]> {
  const prisma = getPrisma();
  const email = identifier.email?.trim().toLowerCase();
  const phone = identifier.phone?.replace(/[\s\-()]/g, "");
  const customerId = identifier.customerId;

  let ids: string[] = [];
  if (email || phone || customerId) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT q."id"
      FROM "QuoteRequest" q
      WHERE (${customerId ?? null}::text IS NOT NULL AND q."customerId" = ${customerId ?? null})
         OR (${email ?? null}::text IS NOT NULL AND LOWER(q."customerEmail") = ${email ?? null})
         OR (${phone ?? null}::text IS NOT NULL
             AND REGEXP_REPLACE(q."customerPhone", ${PHONE_SEP_PATTERN}, '', 'g') = ${phone ?? null})
    `;
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) return [];

  const rows = await prisma.quoteRequest.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: QUOTE_INCLUDE,
  });
  return rows.map(toDomainQuoteRequest);
}

/**
 * A quote job by id or number — with ownership enforced when an identifier is
 * given (signed-in customerId or normalized phone), so customer-only reads
 * never leak another customer's job.
 */
export async function prismaGetQuoteRequest(
  idOrNumber: string,
  identifier?: { customerId?: string; phone?: string }
): Promise<QuoteRequest | null> {
  const prisma = getPrisma();
  const row = await prisma.quoteRequest.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    include: QUOTE_INCLUDE,
  });
  if (!row) return null;
  if (identifier) {
    const phone = identifier.phone?.replace(/[\s\-()]/g, "");
    const owned =
      (identifier.customerId && row.customerId === identifier.customerId) ||
      (phone && row.customerPhone.replace(/[\s\-()]/g, "") === phone);
    if (!owned) return null;
  }
  return toDomainQuoteRequest(row);
}

/**
 * Customer side: post a job and invite up to MAX_QUOTE_WORKERS workers to
 * quote it (rule 1 — duplicates and over-limit rejected). One QuoteRequest
 * (OPEN, expiresAt = now + QUOTE_SLA_MS) + one slot-less Booking per invited
 * worker (QUOTING — rule 2: no slot is locked during the auction), all inside
 * one $transaction; the number collision retries on P2002 (whole tx rolls
 * back). Workers are notified AFTER the tx (the inbox write must not share
 * its locks).
 */
export async function prismaCreateQuoteRequest(
  input: QuoteRequestInput,
  workerIds: string[]
): Promise<QuoteRequest | { error: "invalid" | "too-many" | "duplicate" | "unknown-worker" }> {
  if (workerIds.length < 1 || workerIds.length > MAX_QUOTE_WORKERS) return { error: "too-many" };
  if (new Set(workerIds).size !== workerIds.length) return { error: "duplicate" };
  const prisma = getPrisma();
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const workers = await tx.worker.findMany({
          where: { id: { in: workerIds } },
          select: {
            id: true,
            nameEn: true,
            email: true,
            phone: true,
            languages: true,
            city: { select: { currency: true } },
          },
        });
        if (workers.length !== workerIds.length) return { ok: false as const, error: "unknown-worker" as const };

        const serviceItem = input.serviceItem
          ? await tx.serviceItem.findFirst({ where: { nameEn: input.serviceItem.nameEn }, select: { id: true } })
          : null;
        // QR number derives from the row count (like the BK sequence — quote
        // jobs are never hard-deleted, so count stays stable).
        const qrCount = await tx.quoteRequest.count();
        const request = await tx.quoteRequest.create({
          data: {
            number: formatQuoteNumber(new Date().getFullYear(), qrCount + 1),
            customerId: input.customerId ?? null,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerEmail: input.customerEmail,
            jobTitle: input.jobTitle,
            note: input.note,
            serviceItemId: serviceItem?.id ?? null,
            categorySlug: input.categorySlug,
            citySlug: input.citySlug,
            status: "OPEN",
            expiresAt: new Date(Date.now() + QUOTE_SLA_MS),
          },
        });

        // Per-booking BK numbers: base = bookings already in the table, then
        // +1 per booking created in THIS request (uniqueness within the tx).
        const bkBase = await tx.booking.count();
        let n = 0;
        for (const worker of workers) {
          const booking = await tx.booking.create({
            data: {
              number: `BK-${1001 + bkBase + n}`,
              workerId: worker.id,
              customerId: input.customerId ?? null,
              customerName: input.customerName,
              customerPhone: input.customerPhone,
              customerEmail: input.customerEmail,
              jobTitle: input.jobTitle,
              note: input.note,
              serviceItemId: serviceItem?.id ?? null,
              status: "QUOTING",
              currency: worker.city?.currency ?? "USD",
              quoteRequestId: request.id,
            },
          });
          n += 1;
          // Rule 5 — audit event per invite (same tx as the create).
          await tx.bookingEvent.create({
            data: { bookingId: booking.id, status: "QUOTING", actorType: "customer" },
          });
        }

        const full = await tx.quoteRequest.findUnique({
          where: { id: request.id },
          include: QUOTE_INCLUDE,
        });
        return { ok: true as const, request: full!, workers };
      });

      if (!result.ok) return { error: result.error };
      for (const worker of result.workers) {
        const booking = result.request.bookings.find((b) => b.workerId === worker.id);
        if (!booking) continue;
        await pushNotification(
          quoteNotification(toDomainBooking(booking), "quote-invite"),
          {
            name: worker.nameEn,
            email: worker.email ?? undefined,
            phone: worker.phone,
            locale: (worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en",
          }
        );
      }
      return toDomainQuoteRequest(result.request);
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue;
      console.error("[prisma-repo] createQuoteRequest failed:", err);
      return { error: "invalid" };
    }
  }
  return { error: "invalid" };
}

/**
 * Worker side: submit a bid on a quote invite (rule 3 — bids are NOT
 * commitments: no slot is claimed, no slot status flips). QUOTING → QUOTED
 * via a CAS on the source status (two submits can't both win); the job
 * container flips OPEN → QUOTING once the first bid lands. Returns null for
 * unknown or already-bid bookings.
 */
export async function prismaSubmitQuote(bookingId: string, input: QuoteBidInput): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({ where: { id: bookingId }, include: { quoteRequest: true } });
      if (!row || row.status !== "QUOTING") return null;
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: "QUOTING" },
        data: { status: "QUOTED", quote: input.quote, deposit: input.deposit ?? null },
      });
      if (updated.count === 0) return null;
      await tx.bookingEvent.create({ data: { bookingId, status: "QUOTED", actorType: "worker" } });
      if (row.quoteRequest && row.quoteRequest.status === "OPEN") {
        await tx.quoteRequest.update({ where: { id: row.quoteRequest.id }, data: { status: "QUOTING" } });
      }
      return tx.booking.findUnique({
        where: { id: bookingId },
        include: { events: { orderBy: { createdAt: "asc" as const } }, serviceItem: true },
      });
    });
    return result ? toDomainBooking(result) : null;
  } catch (err) {
    console.error("[prisma-repo] submitQuote failed:", err);
    return null;
  }
}

/**
 * Customer side: pick the winner + a slot from the winner's availability.
 * Rule 4 — exactly one winner: the chosen slot is claimed inside the SAME
 * $transaction with the SAME atomic AVAILABLE → RESERVED updateMany CAS + the
 * overlap guard FIRST (mirrors createBookingRequestTx — a rejection must not
 * orphan a RESERVED slot). The winner becomes a normal slot-bound REQUESTED
 * booking, the losers are DECLINED by the system (slot-less — nothing to
 * free), and the job flips to SELECTED once. The winner then flows through
 * the existing respondToBooking pipeline unchanged. Notifications fire after
 * the tx.
 */
export async function prismaSelectQuote(
  quoteRequestId: string,
  winnerBookingId: string,
  slotId: string
): Promise<Booking | { error: "slot-taken" | "invalid" | "not-quoted" | "closed" }> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.quoteRequest.findUnique({
        where: { id: quoteRequestId },
        include: { bookings: true },
      });
      if (!request) return { ok: false as const, error: "invalid" as const };
      if (request.status !== "OPEN" && request.status !== "QUOTING") return { ok: false as const, error: "closed" as const };
      const winner = request.bookings.find((b) => b.id === winnerBookingId);
      if (!winner) return { ok: false as const, error: "invalid" as const };
      if (winner.status !== "QUOTED") return { ok: false as const, error: "not-quoted" as const };

      // Rule 4 — the slot claim (mirrors createBookingRequestTx exactly).
      const slot = await tx.bookingSlot.findUnique({ where: { id: slotId } });
      if (!slot || slot.workerId !== winner.workerId) return { ok: false as const, error: "slot-taken" as const };
      const clash = await tx.bookingSlot.findFirst({
        where: {
          workerId: winner.workerId,
          id: { not: slot.id },
          status: { in: ["RESERVED", "BOOKED", "BLOCKED"] },
          startAt: { lt: slot.endAt },
          endAt: { gt: slot.startAt },
        },
        select: { id: true },
      });
      if (clash) return { ok: false as const, error: "slot-taken" as const };
      const claimed = await tx.bookingSlot.updateMany({
        where: { id: slot.id, workerId: winner.workerId, status: "AVAILABLE" },
        data: { status: "RESERVED", bookingId: winner.id },
      });
      if (claimed.count === 0) return { ok: false as const, error: "slot-taken" as const };

      // Winner — slot-less QUOTED → slot-bound REQUESTED.
      await tx.booking.update({
        where: { id: winner.id },
        data: { status: "REQUESTED", startAt: slot.startAt, endAt: slot.endAt },
      });
      await tx.bookingEvent.create({ data: { bookingId: winner.id, status: "REQUESTED", actorType: "customer" } });

      // Losers — system DECLINED (slot-less rows, nothing to free).
      for (const b of request.bookings) {
        if (b.id === winner.id || (b.status !== "QUOTING" && b.status !== "QUOTED")) continue;
        await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: "DECLINED" } });
        await tx.bookingEvent.create({
          data: { bookingId: b.id, status: "DECLINED", actorType: "system", reason: "The customer chose another quote" },
        });
      }
      await tx.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: "SELECTED" } });

      const full = await tx.booking.findUnique({
        where: { id: winner.id },
        include: { events: { orderBy: { createdAt: "asc" as const } }, serviceItem: true },
      });
      return {
        ok: true as const,
        booking: full!,
        losers: request.bookings.filter((b) => b.id !== winner.id && (b.status === "QUOTING" || b.status === "QUOTED")),
      };
    });
    if (!result.ok) return { error: result.error };

    // Notify after the tx — winner shortlisted, losers → another quote chosen.
    const winner = result.booking;
    for (const b of [winner, ...result.losers]) {
      const worker = await prisma.worker.findUnique({
        where: { id: b.workerId },
        select: { nameEn: true, email: true, phone: true, languages: true },
      });
      if (!worker) continue;
      await pushNotification(
        quoteNotification(toDomainBooking(b), b.id === winner.id ? "quote-winner" : "quote-loser"),
        {
          name: worker.nameEn,
          email: worker.email ?? undefined,
          phone: worker.phone,
          locale: (worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en",
        }
      );
    }
    return toDomainBooking(winner);
  } catch (err) {
    console.error("[prisma-repo] selectQuote failed:", err);
    return { error: "invalid" };
  }
}

/**
 * The SLA cron (docs/multi-candidate-quotes.md §5 — QUOTE_SLA_MS): OPEN/QUOTING
 * jobs past expiresAt flip to EXPIRED and their open bids (QUOTING/QUOTED) are
 * DECLINED by the system (slot-less — nothing to free; the worker gets a
 * "window closed" notification). Idempotent — a re-run finds nothing due.
 * Returns the number of jobs expired.
 */
export async function prismaExpireQuoteRequests(now = new Date()): Promise<number> {
  const prisma = getPrisma();
  const due = await prisma.quoteRequest.findMany({
    where: { status: { in: ["OPEN", "QUOTING"] }, expiresAt: { lte: now } },
    include: { bookings: { where: { status: { in: ["QUOTING", "QUOTED"] } } } },
  });
  for (const q of due) {
    await prisma.$transaction(async (tx) => {
      await tx.quoteRequest.updateMany({ where: { id: q.id, status: q.status }, data: { status: "EXPIRED" } });
      for (const b of q.bookings) {
        await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: "DECLINED" } });
        await tx.bookingEvent.create({
          data: { bookingId: b.id, status: "DECLINED", actorType: "system", reason: "Quote window closed" },
        });
      }
    });
    // Notify after each tx.
    for (const b of q.bookings) {
      const worker = await prisma.worker.findUnique({
        where: { id: b.workerId },
        select: { nameEn: true, email: true, phone: true, languages: true },
      });
      if (!worker) continue;
      await pushNotification(
        quoteNotification(toDomainBooking(b), "quote-expired"),
        {
          name: worker.nameEn,
          email: worker.email ?? undefined,
          phone: worker.phone,
          locale: (worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en",
        }
      );
    }
  }
  return due.length;
}

/**
 * M3 — create the deposit checkout for a PENDING_PAYMENT booking. Inside a
 * short $transaction it re-checks the booking is still awaiting payment (CAS
 * on PENDING_PAYMENT) and that a Payment row exists, then calls the provider
 * seam OUTSIDE the tx (a network call must not hold the db tx) and persists
 * the provider ref. Idempotent — a second call re-uses the same provider ref
 * (no duplicate checkout sessions). Returns the checkout URL or null.
 */
export async function prismaCreateBookingCheckout(
  bookingId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "STRIPE"
): Promise<{ url: string } | null> {
  const prisma = getPrisma();
  let providerRef: string | null = null;
  let amountMinor = 0;
  let currency = "USD";
  let customerEmail: string | undefined;
  let jobTitle = "";
  let number = "";
  let paymentId = "";

  try {
    // Idempotent: an existing checkout (a re-click after abandoning Stripe,
    // or a concurrent Pay click) returns the SAME url instead of minting a
    // duplicate session or erroring.
    const row = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { payment: true },
      });
      // Must still be awaiting payment AND have a PENDING deposit row.
      if (!booking || booking.status !== "PENDING_PAYMENT" || !booking.payment) return null;
      return booking;
    });
    if (!row?.payment) return null;

    const existingUrl =
      (row.payment.metadata as { checkoutUrl?: string } | null)?.checkoutUrl ?? null;
    if (row.payment.providerRef && existingUrl) return { url: existingUrl };

    paymentId = row.payment.id;
    amountMinor = row.payment.amount;
    currency = row.payment.currency;
    customerEmail = row.customerEmail ?? undefined;
    jobTitle = row.jobTitle;
    number = row.number;

    const provider = getPaymentProvider(method);
    const result = await provider.createCheckout({
      paymentId,
      bookingId,
      amountMinor,
      currency,
      customerEmail,
      description: `${number} — ${jobTitle}`,
      successUrl: `${origin()}/bookings?paid=1`,
      cancelUrl: `${origin()}/bookings`,
    });

    // Persist the provider ref + checkout url with a CAS (only if still
    // unset) so two concurrent Pay clicks can't both mint sessions — the
    // loser matches 0 rows, re-reads, and returns the winner's url. The
    // chosen method is stamped on the Payment row so the dispute view can
    // gate the manual OMT/Whish confirm (a re-click keeps the first-chosen
    // method: the claim only fires while providerRef is still null).
    const claimed = await prisma.payment.updateMany({
      where: { id: paymentId, providerRef: null },
      data: { providerRef: result.providerRef, method, metadata: { bookingId, checkoutUrl: result.url } },
    });
    if (claimed.count === 0) {
      const winner = await prisma.payment.findUnique({ where: { id: paymentId } });
      const winnerUrl = (winner?.metadata as { checkoutUrl?: string } | null)?.checkoutUrl;
      return winnerUrl ? { url: winnerUrl } : null;
    }
    return { url: result.url };
  } catch (err) {
    console.error("[prisma-repo] createBookingCheckout failed:", err);
    return null;
  }
}

/**
 * M3 — the provider webhook (or the simulated checkout callback) landed:
 * PENDING_PAYMENT → CONFIRMED, Payment PENDING → PAID. The status flips are
 * CAS updates inside one $transaction (idempotent — a provider delivering the
 * webhook twice can't double-confirm or double-notify). Signed-in customers
 * (Booking.customerId set) additionally get an Invoice row (WA-YYYY-NNNNN)
 * tied to the payment — the receipt shown on the /bookings page; guest
 * (phone-keyed) bookings skip it. The customer is notified AFTER the tx.
 * Returns the confirmed booking or null.
 */
export async function prismaConfirmBookingPayment(
  bookingId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<Booking | null> {
  const prisma = getPrisma();
  // The count-derived invoice number can collide with a concurrent confirm of
  // another signed-in booking (Invoice.number is unique): the loser's whole
  // tx rolls back — booking stays PENDING_PAYMENT — so a bounded retry re-runs
  // it with a fresh count (same pattern as createBookingRequest's number).
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";

  for (let attempt = 0; attempt < 3; attempt++) {
    // True only when THIS call flipped PENDING_PAYMENT → CONFIRMED (an
    // idempotent webhook redelivery early-returns the already-confirmed row
    // with the flag false, so the activity feed logs each transition once).
    let transitioned = false;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            payment: { include: { invoice: true } },
            customer: { select: { locale: true } },
          },
        });
        if (!booking) return null;
        if (booking.status === "CONFIRMED" && booking.payment?.status === "PAID") {
          return booking; // already confirmed by an earlier webhook delivery
        }
        if (booking.status !== "PENDING_PAYMENT" || !booking.payment) return null;

        const updated = await tx.booking.updateMany({
          where: { id: bookingId, status: "PENDING_PAYMENT" },
          data: { status: "CONFIRMED" },
        });
        if (updated.count === 0) return null;
        transitioned = true;
        await tx.payment.updateMany({
          where: { id: booking.payment.id, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date(), providerRef },
        });
        await tx.bookingEvent.create({ data: { bookingId, status: "CONFIRMED", actorType: "system" } });

        // M3 — signed-in customers get a WA-YYYY-NNNNN Invoice row linked to
        // the payment. The per-year sequence derives from the row count (the
        // number is the only uniqueness constraint; subscription renewals
        // don't mint invoices yet). Guest bookings (customerId null) skip it.
        if (booking.customerId) {
          const year = new Date().getFullYear();
          const count = await tx.invoice.count({
            where: { number: { startsWith: `WA-${year}-` } },
          });
          await tx.invoice.create({
            data: {
              number: formatInvoiceNumber(year, count + 1),
              userId: booking.customerId,
              paymentId: booking.payment.id,
              amount: booking.payment.amount,
              currency: booking.payment.currency || "USD",
              status: "PAID",
              paidAt: new Date(),
              items: [
                { description: `${booking.number} — ${booking.jobTitle}`, qty: 1, unitPrice: booking.payment.amount },
              ],
            },
          });
        }

        return tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            events: { orderBy: { createdAt: "asc" as const } },
            serviceItem: true,
            payment: { include: { invoice: true } },
            customer: { select: { locale: true } },
          },
        });
      });
      if (!result) return null;

    // M4 activity feed — log the deposit-path CONFIRMED transition AFTER the
    // tx (logAdminActivity uses its own connection and must not share the
    // tx's row locks, same rule as pushNotification). The flag keeps a
    // webhook redelivery from re-logging.
    if (transitioned) {
      const worker = await txWorkerName(bookingId);
      const name = worker ?? "Worker";
      // The entry copy names the worker whose booking got confirmed; the
      // ACTOR is whoever confirmed receipt — the /admin pending-payments
      // confirm threads the acting admin (opts.by), webhook-simulated
      // confirms keep the worker name (demo/prisma parity).
      await logAdminActivity({
        code: ACTION_CODES.BOOKING_CONFIRMED,
        actionEn: `${name} confirmed ${result.number}`,
        actionAr: `${name} أكّد الحجز ${result.number}`,
        actor: opts.by ?? name,
        ...(opts.byId ? { actorId: opts.byId } : {}),
        type: "booking",
        bookingNo: result.number,
      });
    }

    await pushNotification(
      bookingNotification(toDomainBooking(result), "customer-paid"),
      result.customerEmail
        ? {
            name: result.customerName,
            email: result.customerEmail,
            phone: result.customerPhone,
            // The customer's preferred language (User.locale) — not always EN.
            locale: result.customer?.locale === "ar" ? "ar" : "en",
          }
        : undefined
    );
    return toDomainBooking(result);
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue; // whole tx rolled back — retry
      console.error("[prisma-repo] confirmBookingPayment failed:", err);
      return null;
    }
  }
  return null;
}

/** Resolve the display name of the worker on a booking (activity feed copy). */
async function txWorkerName(bookingId: string): Promise<string | null> {
  const prisma = getPrisma();
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { worker: { select: { nameEn: true } } },
  });
  return row?.worker?.nameEn ?? null;
}

/**
 * Worker side: transition a scheduled booking to inProgress / completed /
 * noShow (M4, docs/booking-scheduling.md §5). Inside $transaction: the
 * transition legality check (BOOKING_TRANSITION_FROM) is re-asserted by the
 * updateMany WHERE (compare-and-swap on the source status — two concurrent
 * transitions can't both win), a BookingEvent is appended, and the slot stays
 * BOOKED (only cancellation frees it — rule 3). Notifications fire after the
 * tx; only `completed` notifies the customer (the doc's recipient list is
 * CONFIRMED/DECLINED/REMINDER/COMPLETED). Returns null for unknown bookings
 * or illegal transitions.
 */
export async function prismaTransitionBooking(
  bookingId: string,
  to: BookingTransitionTarget
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    // §2.3 — a worker "completed" flip is STAGED (COMPLETION_PENDING + the
    // completionPendingAt stamp); the customer confirms (prismaConfirmBookingCompletion)
    // or the grace cron auto-confirms before the job counts as completed, so
    // fake-COMPLETED can't pollute the funnel, ratings, and no-show stats.
    const staged = to === "completed";
    const dbTo = staged ? "COMPLETION_PENDING" : BOOKING_STATUS_APP_TO_DB[to];
    const result = await prisma.$transaction(async (tx) => {
      // Transitions never touch the slot (it stays BOOKED — only cancellation
      // frees it), so no slot include is needed here.
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
      });
      if (!row) return null;
      const from = BOOKING_STATUS_DB_TO_APP[row.status];
      if (!BOOKING_TRANSITION_FROM[to].includes(from)) return null;

      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: row.status },
        data: { status: dbTo, completionPendingAt: staged ? new Date() : null },
      });
      if (updated.count === 0) return null;
      await tx.bookingEvent.create({ data: { bookingId, status: dbTo, actorType: "worker" } });
      // Payouts (docs/payouts.md) — earnings credit on the CONFIRMED flip, not
      // the worker's staged one (prismaConfirmBookingCompletion /
      // prismaAutoConfirmCompletions run creditEarningsInTx in their txs).
      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          customer: { select: { locale: true } },
        },
      });
    });
    if (!result) return null;
    if (staged) {
      await pushNotification(
        bookingNotification(toDomainBooking(result), "customer-completion-pending"),
        result.customerEmail
          ? {
              name: result.customerName,
              email: result.customerEmail,
              phone: result.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: result.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] transitionBooking failed:", err);
    return null;
  }
}

/**
 * §2.3 — the customer confirms a staged completion: COMPLETION_PENDING →
 * COMPLETED inside a $transaction (CAS on the status so a concurrent confirm
 * or the grace cron can't double-flip), net earnings credit the ledger
 * (idempotent via @@unique([bookingId])), a customer-actor audit event is
 * appended, and the WORKER is told the payout is on its way (after the tx).
 * Returns null unless the booking is staged.
 */
export async function prismaConfirmBookingCompletion(bookingId: string): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { worker: { select: { nameEn: true, email: true, phone: true, languages: true } } },
      });
      if (!row || row.status !== "COMPLETION_PENDING") return null;

      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: "COMPLETION_PENDING" },
        data: { status: "COMPLETED", completionPendingAt: null },
      });
      if (updated.count === 0) return null;
      await creditEarningsInTx(tx, row);
      await tx.bookingEvent.create({ data: { bookingId, status: "COMPLETED", actorType: "customer" } });      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          payment: { include: { invoice: true } },
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
          customer: { select: { locale: true } },
        },
      });


    });
    if (!result) return null;
    const workerLocale =
      (result.worker?.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
    await pushNotification(
      bookingNotification(toDomainBooking(result), "worker-completion-confirmed"),
      result.worker?.email
        ? { name: result.worker.nameEn, email: result.worker.email, phone: result.worker.phone, locale: workerLocale }
        : undefined
    );
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] confirmBookingCompletion failed:", err);
    return null;
  }
}

/**
 * §2.3 — the grace cron: COMPLETION_PENDING bookings whose completionPendingAt
 * is past BOOKING_COMPLETION_CONFIRM_GRACE_HOURS auto-confirm (system actor),
 * crediting the ledger and emailing the customer the completion receipt.
 * Idempotent — the CAS on the status means overlapping cron invocations can
 * never double-flip, and a confirmed booking is never rescanned.
 */
export async function prismaAutoConfirmCompletions(now = new Date()): Promise<number> {
  const prisma = getPrisma();
  const cutoff = new Date(now.getTime() - BOOKING_COMPLETION_CONFIRM_GRACE_HOURS * 60 * 60 * 1000);
  const due = await prisma.booking.findMany({
    where: { status: "COMPLETION_PENDING", completionPendingAt: { lt: cutoff } },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      payment: { include: { invoice: true } },
      worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
    },
  });
  let autoConfirmed = 0;
  for (const row of due) {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: row.id, status: "COMPLETION_PENDING" },
        data: { status: "COMPLETED", completionPendingAt: null },
      });
      if (updated.count === 0) return null;
      await creditEarningsInTx(tx, row);
      await tx.bookingEvent.create({ data: { bookingId: row.id, status: "COMPLETED", actorType: "system" } });
      return tx.booking.findUnique({
        where: { id: row.id },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          customer: { select: { locale: true } },
        },
      });
    });
    if (!result) continue;
    autoConfirmed += 1;
    await pushNotification(
      bookingNotification(toDomainBooking(result), "customer-completed"),
      result.customerEmail
        ? {
            name: result.customerName,
            email: result.customerEmail,
            phone: result.customerPhone,
            // The customer's preferred language (User.locale) — not always EN.
            locale: result.customer?.locale === "ar" ? "ar" : "en",
          }
        : undefined
    );
  }
  return autoConfirmed;
}

/**
 * M4 — move a scheduled booking to another AVAILABLE slot of the same worker
 * (the doc's "new slot swap"). Inside $transaction: the booking must still be
 * confirmed/inProgress (re-asserted by the updateMany WHERE on the booking
 * row), the target slot is claimed with an atomic AVAILABLE→BOOKED
 * updateMany (concurrent reschedules or requests matching 0 rows get null),
 * the old slot returns to AVAILABLE (bookingId cleared), the booking's times
 * follow the target, and a RESCHEDULED audit event is appended. Notifications
 * fire after the tx (worker when the customer reschedules, customer when the
 * worker reschedules). Returns null for unknown bookings, wrong-status
 * bookings, or an invalid/claimed target slot.
 */
export async function prismaRescheduleBooking(
  bookingId: string,
  targetSlotId: string,
  input: BookingRescheduleInput
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });
      if (!booking) return null;
      const from = BOOKING_STATUS_DB_TO_APP[booking.status];
      if (!BOOKING_RESCHEDULABLE_FROM.includes(from)) return null;

      const target = await tx.bookingSlot.findUnique({ where: { id: targetSlotId } });
      // The target must belong to the same worker and still be AVAILABLE.
      if (!target || target.workerId !== booking.workerId || target.status !== "AVAILABLE") return null;

      // Overlap guard — the target window must not overlap another
      // RESERVED/BOOKED/BLOCKED slot of the worker (mirrors the request guard).
      const clash = await tx.bookingSlot.count({
        where: {
          workerId: booking.workerId,
          id: { not: targetSlotId },
          status: { in: ["RESERVED", "BOOKED", "BLOCKED"] },
          OR: [
            { startAt: { lt: target.endAt }, endAt: { gt: target.startAt } },
            // a longer existing slot fully containing the target window
            { startAt: { lte: target.startAt }, endAt: { gte: target.endAt } },
          ],
        },
      });
      if (clash > 0) return null;

      // Free the old slot FIRST (rule 3 — the slot the booking vacated). The
      // unique index on BookingSlot.bookingId means two slots can never
      // reference the same booking at once, so the vacated slot's bookingId
      // must be cleared BEFORE the target claims it (a P2002 otherwise).
      if (booking.slot && booking.slot.id !== targetSlotId) {
        await tx.bookingSlot.updateMany({
          where: { id: booking.slot.id, bookingId },
          data: { status: "AVAILABLE", bookingId: null },
        });
      }

      // Atomic claim of the target slot (CAS on AVAILABLE).
      const claimed = await tx.bookingSlot.updateMany({
        where: { id: targetSlotId, status: "AVAILABLE" },
        data: { status: "BOOKED", bookingId },
      });
      // THROW (not return) on a lost claim: a returning transaction COMMITS
      // in this codebase's convention, which would persist the old-slot free
      // above and leave a CONFIRMED booking with no claimed slot. Rolling
      // back keeps the swap atomic — nothing changes when the target is lost.
      if (claimed.count === 0) throw new Error("reschedule target taken");

      // Move the booking's times to the new slot and append the audit event.
      await tx.booking.update({
        where: { id: bookingId },
        data: { startAt: target.startAt, endAt: target.endAt },
      });
      await tx.bookingEvent.create({
        data: { bookingId, status: "RESCHEDULED", actorType: input.by, reason: input.reason ?? null },
      });

      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
          customer: { select: { locale: true } },
        },
      });
    });
    if (!result) return null;

    if (input.by === "customer") {
      const workerLocale =
        (result.worker?.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
      await pushNotification(
        bookingNotification(toDomainBooking(result), "worker-rescheduled"),
        result.worker?.email
          ? { name: result.worker.nameEn, email: result.worker.email, phone: result.worker.phone, locale: workerLocale }
          : undefined
      );
    } else {
      await pushNotification(
        bookingNotification(toDomainBooking(result), "customer-rescheduled"),
        result.customerEmail
          ? {
              name: result.customerName,
              email: result.customerEmail,
              phone: result.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: result.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
    return toDomainBooking(result);
  } catch (err) {
    // A lost target claim (concurrent request/block won the slot) is a normal
    // race, not an error — the tx rolled back, so nothing changed. Log other
    // failures (e.g. DB errors) as before.
    if ((err as { message?: string })?.message === "reschedule target taken") return null;
    console.error("[prisma-repo] rescheduleBooking failed:", err);
    return null;
  }
}

/**
 * Worker/customer side: cancel a booking (M4). Allowed from any non-terminal
 * status (the updateMany WHERE re-asserts it as a CAS). Rule 3 — the slot
 * returns to AVAILABLE with bookingId cleared (a no-show voids without
 * freeing, but cancellation always frees). cancelReason + cancelledBy land on
 * the row AND ride the audit event (rule 5). The OTHER party is notified
 * after the tx (worker when the customer cancels, customer when the worker
 * cancels). Returns null for unknown or terminal bookings.
 */
export async function prismaCancelBooking(
  bookingId: string,
  input: BookingCancelInput
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          slot: true,
          payment: { include: { invoice: true } },
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
        },
      });
      if (!row) return null;
      const from = BOOKING_STATUS_DB_TO_APP[row.status];
      if (BOOKING_TERMINAL_STATUSES.includes(from)) return null;

      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: row.status },
        data: { status: "CANCELLED", cancelReason: input.reason ?? null, cancelledBy: input.by },
      });
      if (updated.count === 0) return null;
      if (row.slot) {
        await tx.bookingSlot.updateMany({
          where: { id: row.slot.id, bookingId },
          data: { status: "AVAILABLE", bookingId: null },
        });
      }
      // An unpaid deposit row (PENDING) is voided on cancel — no orphaned
      // payments. A PAID one is refunded after the tx (below).
      if (row.payment?.status === "PENDING") {
        await tx.payment.updateMany({
          where: { id: row.payment.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
      }
      await tx.bookingEvent.create({
        data: { bookingId, status: "CANCELLED", actorType: input.by, reason: input.reason ?? null },
      });      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          payment: { include: { invoice: true } },
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
          customer: { select: { locale: true } },
        },
      });


    });
    if (!result) return null;

    // M3 + M4 policy — a paid deposit is refunded only when the policy says so
    // (bookingCancelRefundDue: worker cancels > BOOKING_CANCEL_REFUND_WINDOW_MS
    // before start refund; customer/system always refund; a worker cancel within
    // the window KEEPS the deposit — the payment row stays PAID). The provider
    // call is async and runs AFTER the tx; the payment row flips to REFUNDED.
    let refunded = false;
    if (
      result.payment?.status === "PAID" &&
      bookingCancelRefundDue({ startAt: result.startAt?.toISOString() ?? "" }, new Date(), input.by)
    ) {
      try {
        // Refunds route through the provider that took the money — an OMT-paid
        // deposit refunds via the OMT provider (omt_refund_*), not the default.
        const refundMethod =
          result.payment.method === "OMT" ? "OMT" : result.payment.method === "WHISH" ? "WHISH" : "STRIPE";
        const refundRef = await getPaymentProvider(refundMethod).refund(
          result.payment.providerRef ?? result.payment.id,
          result.payment.amount
        );
        await prisma.payment.update({
          where: { id: result.payment.id },
          data: { status: "REFUNDED", refundRef, refundedAt: new Date() },
        });
        // M3 receipt voids with the refund (parity with prismaRefundBookingDeposit).
        if (result.payment.invoice) {
          await prisma.invoice.updateMany({
            where: { id: result.payment.invoice.id, status: "PAID" },
            data: { status: "VOID" },
          });
        }
        refunded = true;
      } catch (err) {
        console.error("[prisma-repo] cancelBooking refund failed:", err);
      }
    }

    if (input.by === "customer") {
      const workerLocale =
        (result.worker?.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
      await pushNotification(
        bookingNotification(toDomainBooking(result), "worker-cancelled"),
        result.worker?.email
          ? { name: result.worker.nameEn, email: result.worker.email, phone: result.worker.phone, locale: workerLocale }
          : undefined
      );
    } else if (input.by === "admin") {
      // §2.4 — an admin cancellation is a platform action: BOTH parties are
      // told (customer: booking cancelled; worker: slot freed), unlike a
      // party-initiated cancel which notifies only the other side.
      await pushNotification(
        bookingNotification(toDomainBooking(result), "customer-cancelled"),
        result.customerEmail
          ? {
              name: result.customerName,
              email: result.customerEmail,
              phone: result.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: result.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
      const workerLocale =
        (result.worker?.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
      await pushNotification(
        bookingNotification(toDomainBooking(result), "worker-cancelled"),
        result.worker?.email
          ? { name: result.worker.nameEn, email: result.worker.email, phone: result.worker.phone, locale: workerLocale }
          : undefined
      );
    } else {
      await pushNotification(
        bookingNotification(toDomainBooking(result), "customer-cancelled"),
        result.customerEmail
          ? {
              name: result.customerName,
              email: result.customerEmail,
              phone: result.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: result.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
    // M4 refund email — whenever a deposit actually landed back, the customer
    // is told the amount + reason (worker cancel outside the window, or a
    // customer/system cancel which always refunds).
    if (refunded && result.payment) {
      await pushNotification(
        bookingNotification(toDomainBooking(result), "customer-refund", {
          refund: { amount: result.payment.amount, reason: input.reason },
        }),
        result.customerEmail
          ? {
              name: result.customerName,
              email: result.customerEmail,
              phone: result.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: result.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] cancelBooking failed:", err);
    return null;
  }
}

/**
 * §2.4 admin dispute view — refund the booking's PAID deposit WITHOUT
 * cancelling the booking (a money-only correction: the job and slot stay as
 * they are). Unlike a party cancellation, the deposit policy's window logic
 * does NOT apply — an admin refund is a platform decision, so a paid deposit
 * is always refundable. The payment must be PAID (a PENDING checkout or an
 * already-REFUNDED payment returns null — idempotent; a double-click can't
 * re-refund). The provider refund + the payment flip to REFUNDED happen after
 * a short read tx; the REFUNDED audit event rides the same tx as the state
 * check, and the customer gets the M4 refund email. Returns null for unknown
 * bookings or when there is no refundable paid deposit.
 */
export async function prismaRefundBookingDeposit(
  bookingId: string,
  input: { reason?: string }
): Promise<Booking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          payment: true,
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
        },
      });
      if (!row) return null;
      // Only a PAID deposit is refundable — PENDING (unpaid checkout) and
      // already-REFUNDED are no-ops. The REFUNDED event lands in the SAME tx
      // as the state re-check, so a concurrent refund can't double-fire.
      if (row.payment?.status !== "PAID") return null;
      await tx.bookingEvent.create({
        data: { bookingId, status: "REFUNDED", actorType: "admin", reason: input.reason ?? null },
      });      return tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          events: { orderBy: { createdAt: "asc" as const } },
          serviceItem: true,
          payment: { include: { invoice: true } },
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
          customer: { select: { locale: true } },
        },
      });


    });
    if (!result) return null;

    // The actual money move + the payment flip run AFTER the read tx (same
    // pattern as prismaCancelBooking's refund): the provider call is async
    // and must not hold the tx's locks. The refund goes through the provider
    // that took the money (OMT/Whish for manual deposits).
    const refundMethod =
      result.payment?.method === "OMT" ? "OMT" : result.payment?.method === "WHISH" ? "WHISH" : "STRIPE";
    const refundRef = await getPaymentProvider(refundMethod).refund(
      result.payment?.providerRef ?? result.payment?.id ?? bookingId,
      result.payment?.amount ?? 0
    );
    await prisma.payment.updateMany({
      where: { id: result.payment!.id, status: "PAID" },
      data: { status: "REFUNDED", refundRef, refundedAt: new Date() },
    });
    // M3 receipt voids with the refund — the Invoice row stops representing
    // money the platform holds, so the customer row strikes it through (the
    // campaign refund path does the same via its credit-note flip).
    if (result.payment?.invoice) {
      await prisma.invoice.updateMany({
        where: { id: result.payment.invoice.id, status: "PAID" },
        data: { status: "VOID" },
      });
    }

    await pushNotification(
      bookingNotification(toDomainBooking(result), "customer-refund", {
        refund: { amount: result.payment!.amount, reason: input.reason },
      }),
      result.customerEmail
        ? {
            name: result.customerName,
            email: result.customerEmail,
            phone: result.customerPhone,
            // The customer's preferred language (User.locale) — not always EN.
            locale: result.customer?.locale === "ar" ? "ar" : "en",
          }
        : undefined
    );
    return toDomainBooking(result);
  } catch (err) {
    console.error("[prisma-repo] refundBookingDeposit failed:", err);
    return null;
  }
}

/**
 * M4 — booking reminder cron support. CONFIRMED bookings whose start is within
 * the next 24h and whose lastReminderSent is still null. The engine (src/lib/
 * notifications/reminders.ts) pushes the "job starts tomorrow" notification,
 * then marks each row via prismaMarkBookingReminderSent — a CAS on the null
 * column, so two overlapping cron invocations can never both send.
 */
export async function prismaGetBookingsDueForReminder(now = new Date()): Promise<Booking[]> {
  const prisma = getPrisma();
  const rows = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gt: now, lte: new Date(now.getTime() + BOOKING_REMINDER_WINDOW_MS) },
      lastReminderSent: null,
    },
    orderBy: { startAt: "asc" },
    include: {
      events: { orderBy: { createdAt: "asc" as const } },
      serviceItem: true,
      // The customer's User row — its locale is the preferred language the
      // reminder email renders in (guest bookings → "en").
      customer: { select: { locale: true } },
    },
  });
  return rows.map(toDomainBooking);
}

/**
 * Atomically mark a booking's reminder as sent — only flips rows whose
 * lastReminderSent is still null (compare-and-swap), so a concurrent cron run
 * loses with count 0 and the winner sends exactly once. Returns whether this
 * call claimed the stamp.
 */
export async function prismaMarkBookingReminderSent(bookingId: string, sentAt = new Date()): Promise<boolean> {
  const prisma = getPrisma();
  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, lastReminderSent: null },
    data: { lastReminderSent: sentAt },
  });
  return updated.count === 1;
}

/**
 * M2 — availability editor (docs/booking-scheduling.md §6). Generate AVAILABLE
 * slots for a worker from their weekly WorkingHour template: every non-closed
 * day in [from, to] gets 1-hour slots across open→close. Idempotent — any
 * hour that already overlaps an existing slot (of any status) is skipped, and
 * the (workerId, startAt) unique index is the final backstop: createMany with
 * skipDuplicates turns a concurrent double-generation into a silent no-op
 * instead of a hard error. Past-hour guard — a slot whose start has already
 * passed is never created (a customer must not be able to request a time that
 * is gone). The "00:00"–"00:00" closed:false entry is the 24/7 emergency
 * marker (see isOpenNow) and generates the full day. Returns the number of
 * slots actually created. `now` is injectable for deterministic tests.
 */
export async function prismaGenerateSlots(
  workerId: string,
  range: { from?: string; to?: string } = {},
  now = new Date()
): Promise<number> {
  const prisma = getPrisma();
  const worker = await prisma.worker.findUnique({
    where: { id: workerId },
    select: { hours: true },
  });
  if (!worker) return 0;

  const from = range.from ? new Date(range.from) : new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = range.to ? new Date(range.to) : new Date(from.getTime() + 13 * 24 * 60 * 60 * 1000);

  // Existing slots in the window (any status) — the idempotency set. Rows
  // created in this run accumulate in `running`, so re-generation within the
  // same call can't double-book either.
  const existing = await prisma.bookingSlot.findMany({
    where: { workerId, startAt: { lt: to }, endAt: { gt: from } },
    select: { startAt: true, endAt: true },
  });
  const running = existing.map((s) => ({ start: s.startAt.getTime(), end: s.endAt.getTime() }));

  const candidates: Prisma.BookingSlotCreateManyInput[] = [];
  const walk = new Date(from);
  while (walk.getTime() <= to.getTime()) {
    const wh = worker.hours.find((h) => h.day === walk.getDay());
    if (wh && !wh.closed) {
      const [oh, om] = wh.open.split(":").map(Number);
      const [ch, cm] = wh.close.split(":").map(Number);
      // "00:00"–"00:00" with closed:false is the 24/7 emergency marker — the
      // full day, so emergency workers stay bookable round the clock.
      const fullDay = oh === 0 && om === 0 && ch === 0 && cm === 0;
      const startMin = fullDay ? 0 : oh * 60 + om;
      const endMin = fullDay ? 24 * 60 : ch * 60 + cm;

      for (let m = startMin; m + 60 <= endMin; m += 60) {
        const start = new Date(walk);
        start.setHours(Math.floor(m / 60), m % 60, 0, 0);
        // Past-hour guard (generation starts at midnight, so later hours of
        // today are skipped once their start is in the past).
        if (start.getTime() < now.getTime()) continue;
        const end = start.getTime() + 60 * 60 * 1000;
        // Idempotency: half-open overlap against existing + this-run slots.
        const overlap = running.some((s) => s.start < end && start.getTime() < s.end);
        if (overlap) continue;
        running.push({ start: start.getTime(), end });
        candidates.push({ workerId, startAt: start, endAt: new Date(end), status: "AVAILABLE" });
      }
    }
    walk.setDate(walk.getDate() + 1);
  }

  if (candidates.length === 0) return 0;
  const res = await prisma.bookingSlot.createMany({ data: candidates, skipDuplicates: true });
  return res.count;
}

/**
 * Block/unblock an AVAILABLE or BLOCKED slot (availability editor). A slot
 * claimed by a booking (RESERVED/BOOKED) cannot be blocked — it belongs to a
 * customer's pending/confirmed booking. The status precondition rides inside
 * the updateMany WHERE (compare-and-swap): a customer grabbing the slot
 * between our read and write loses with count 0 → null. Unblocking clears the
 * note and returns the slot to AVAILABLE. Returns null for unknown slots,
 * wrong-owner slots, or refusals.
 */
export async function prismaSetSlotBlocked(
  workerId: string,
  slotId: string,
  blocked: boolean,
  note?: string
): Promise<BookingSlot | null> {
  const prisma = getPrisma();
  const updated = await prisma.bookingSlot.updateMany({
    where: { id: slotId, workerId, status: { in: ["AVAILABLE", "BLOCKED"] } },
    data: { status: blocked ? "BLOCKED" : "AVAILABLE", note: blocked ? (note ?? null) : null },
  });
  if (updated.count === 0) return null;
  const row = await prisma.bookingSlot.findUnique({ where: { id: slotId } });
  return row ? rowToSlot(row) : null;
}

/** Same scoring as the demo: category 100 + city 50 + rating × 5. */
export async function prismaGetRelated(worker: Worker, limit = 4): Promise<Worker[]> {
  const prisma = getPrisma();
  const rows = await prisma.worker.findMany({
    where: {
      ...PUBLIC_WORKER_FILTER,
      id: { not: worker.id },
      OR: [
        { category: { slug: worker.categorySlug } },
        { city: { slug: worker.citySlug } },
      ],
    },
    include: LIST_INCLUDE,
  });
  const list = rows
    .map((r) => {
      const w = toDomainWorker(r);
      return {
        w,
        score:
          (w.categorySlug === worker.categorySlug ? 100 : 0) +
          (w.citySlug === worker.citySlug ? 50 : 0) +
          w.rating * 5,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.w);
  return stampWorkerSignals(list);
}

/* ──────────────────────── Campaigns & ad payments ────────────────────────
 * Prisma implementations of the campaign seam for real mode. Reads and the
 * admin refund run against the AdCampaign / Payment rows; the self-serve
 * purchase path (createCampaign → checkout → webhook confirm, ad rotation)
 * remains demo-only until its wave lands.
 *
 * Money: the DB stores minor units (schema convention); the domain Campaign
 * works in major units (×100), so budget/spent divide by 100 here — same as
 * toDomainWorker. The purchase Payment.amount is minor in BOTH stores and is
 * mapped as-is (mirrors toDomainBooking's quote/deposit).
 *
 * The refund mirrors the demo adapter's contract exactly — only a PAID
 * payment is refundable, the provider charge is refunded, the payment flips
 * to REFUNDED (refundRef + refundedAt + metadata.refundReason), the campaign
 * stops serving (ENDED), the refund is audited to the activity feed
 * (CAMPAIGN_REFUNDED), and the company receives the SAME campaignRefunded
 * notification payload the demo dispatches (amount + reason, /company deep
 * link) — so both adapters tell one story. Idempotent: a second refund of
 * the same payment no-ops.
 * ──────────────────────────────────────────────────────────────────────── */

const AD_STATUS_DB_TO_APP: Record<string, Campaign["status"]> = {
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
  REJECTED: "ended", // not serving — terminal, read like ended
};

const AD_TYPE_DB_TO_APP: Record<string, Campaign["adType"]> = {
  BANNER: "banner",
  SLIDER: "slider",
  FEATURED_CARD: "featuredCard",
  SPONSORED_SEARCH: "sponsoredSearch",
  SPONSORED_CATEGORY: "sponsoredCategory",
  POPUP: "popup",
  NATIVE: "native",
  VIDEO: "video",
};

/** Domain adType → DB enum (the purchase path writes the primary creative). */
const AD_TYPE_APP_TO_DB: Record<Campaign["adType"], $Enums.AdType> = {
  banner: "BANNER",
  slider: "SLIDER",
  featuredCard: "FEATURED_CARD",
  sponsoredSearch: "SPONSORED_SEARCH",
  sponsoredCategory: "SPONSORED_CATEGORY",
  popup: "POPUP",
  native: "NATIVE",
  video: "VIDEO",
};

const PAYMENT_STATUS_DB_TO_APP: Record<string, CampaignPayment["status"]> = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
};

/** Shape of an AdCampaign row (with its ads) — structural, no live DB needed. */
export interface PrismaCampaignRow {
  id: string;
  nameEn: string;
  nameAr: string;
  budget: number;
  spent: number;
  status: string;
  createdAt: Date;
  ads: {
    type: string;
    placement: string;
    impressions: number;
    clicks: number;
  }[];
}

/** Shape of a Payment row for a campaign purchase — structural, no DB needed. */
export interface PrismaPaymentRow {
  id: string;
  advertisementId: string | null;
  amount: number;
  currency: string;
  status: string;
  providerRef: string | null;
  metadata: unknown;
  paidAt: Date | null;
  refundedAt: Date | null;
}

/**
 * Map an AdCampaign row (+ ads) to the domain Campaign type. placement and
 * adType come from the campaign's first ad (a campaign's primary creative);
 * impressions/clicks/ctr are summed across its ads. The demo's display
 * placement strings ("Homepage · Banner") have no DB equivalent — the prisma
 * ad placement ("homepage") is surfaced as-is.
 */
export function toDomainCampaign(row: PrismaCampaignRow): Campaign {
  const ad = row.ads[0];
  const impressions = row.ads.reduce((s, a) => s + a.impressions, 0);
  const clicks = row.ads.reduce((s, a) => s + a.clicks, 0);
  return {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    placement: ad?.placement ?? "homepage",
    adType: AD_TYPE_DB_TO_APP[ad?.type ?? ""] ?? "banner",
    impressions,
    clicks,
    // Same CTR formula as the demo adapter (rounded to 2dp).
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    // DB minor → domain major (×100).
    budget: row.budget / 100,
    spent: row.spent / 100,
    status: AD_STATUS_DB_TO_APP[row.status] ?? "pending",
    created: row.createdAt.toISOString(),
  };
}

/** Map a campaign purchase Payment row to the domain CampaignPayment type. */
export function toDomainCampaignPayment(row: PrismaPaymentRow): CampaignPayment {
  const meta = (row.metadata ?? {}) as { checkoutUrl?: string; refundReason?: string };
  return {
    id: row.id,
    campaignId: row.advertisementId ?? "",
    // Minor units in both stores — mapped as-is (unlike budget/spent above).
    amount: row.amount,
    currency: row.currency,
    status: PAYMENT_STATUS_DB_TO_APP[row.status] ?? "pending",
    providerRef: row.providerRef ?? undefined,
    checkoutUrl: meta.checkoutUrl,
    paidAt: row.paidAt?.toISOString(),
    refundedAt: row.refundedAt?.toISOString(),
    // ?? undefined — the metadata may carry JSON null when a seam-level refund
    // had no reason; the domain type promises `refundReason?: string`.
    refundReason: meta.refundReason ?? undefined,
  };
}

/** All campaigns, newest first (mirrors demoGetCampaigns). */
export async function prismaGetCampaigns(): Promise<Campaign[]> {
  const prisma = getPrisma();
  const rows = await prisma.adCampaign.findMany({
    include: { ads: { orderBy: { createdAt: "asc" as const } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainCampaign);
}

/** A campaign's purchase Payment row, if one exists (mirrors demoCampaignPayment).
 * The demo store guarantees one payment per campaign; newest-first keeps the
 * pick deterministic if a retried purchase ever produced a second row. */
export async function prismaGetCampaignPayment(campaignId: string): Promise<CampaignPayment | null> {
  const prisma = getPrisma();
  const row = await prisma.payment.findFirst({
    where: { advertisementId: campaignId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toDomainCampaignPayment(row) : null;
}

/**
 * The company a campaign's refund notification is addressed to (real mode):
 * the campaign's Company row + its user's email — mirrors how the demo
 * adapter resolves the demo company constant. Used by the admin refund-email
 * preview to show the recipient line exactly as dispatched.
 */
export async function prismaGetCampaignRecipient(
  campaignId: string
): Promise<{ name: string; email: string; locale: "en" | "ar" } | null> {
  const prisma = getPrisma();
  const row = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    include: { company: { include: { user: { select: { email: true } } } } },
  });
  if (!row?.company?.user?.email) return null;
  // The company's preferred language — the email they received is rendered
  // in it (the preview leads with it as the primary block).
  return {
    name: row.company.nameEn,
    email: row.company.user.email,
    locale: row.company.locale === "ar" ? "ar" : "en",
  };
}

/**
 * Admin side: refund a campaign purchase against the live DB. Only a PAID
 * payment is refundable. Two phases: the DB state flips (campaign → ENDED) run
 * inside $transaction with the refundability re-checked by the payment row's
 * status; the provider refund + payment → REFUNDED + audit + notification run
 * AFTER the tx (a network call must not hold the db tx, and the inbox/activity
 * writes use their own connections — the same rules as the booking adapters).
 * A provider failure leaves the payment PAID (null returned, caller can
 * retry). Returns the updated payment, or null when nothing was refundable.
 */
export async function prismaRefundCampaignPayment(
  campaignId: string,
  opts: { by?: string; reason?: string } = {}
): Promise<CampaignPayment | null> {
  const prisma = getPrisma();
  const reason = opts.reason?.trim();
  try {
    // Phase 1 — end the campaign inside the tx, re-checking the payment is
    // still PAID (CAS on its status; a concurrent refund matches 0 rows).
    const locked = await prisma.$transaction(async (tx) => {
      const campaign = await tx.adCampaign.findUnique({
        where: { id: campaignId },
        include: { company: { include: { user: { select: { email: true, phone: true } } } } },
      });
      if (!campaign) return null;
      const payment = await tx.payment.findFirst({
        where: { advertisementId: campaignId },
        include: { invoice: true },
      });
      if (!payment || payment.status !== "PAID") return null;
      if (campaign.status === "ACTIVE") {
        await tx.adCampaign.update({ where: { id: campaignId }, data: { status: "ENDED" } });
        // The creatives stop serving with the campaign (rotation matches
        // ACTIVE ads; the campaign gate already excludes ENDED, but the rows
        // should stay honest — no ACTIVE ad of an ended campaign).
        await tx.advertisement.updateMany({
          where: { campaignId, status: "ACTIVE" },
          data: { status: "ENDED" },
        });
      }
      // Credit note — the purchase's Invoice row flips to VOID (InvoiceStatus
      // has no REFUNDED; VOID is the terminal marker), mirroring the demo's
      // paid → refunded invoice flip. Purchase invoices are minted by the
      // booking/campaign confirm paths; when none exists nothing to void.
      // NOTE: the flip rides the tx (like the campaign ENDED), so a PROVIDER
      // FAILURE leaves the invoice VOID + campaign ENDED with the payment
      // still PAID (retryable) — the demo flips the invoice only after the
      // refund lands; the divergence is documented in docs/PAYMENTS.md.
      if (payment.invoice?.status === "PAID") {
        await tx.invoice.update({ where: { id: payment.invoice.id }, data: { status: "VOID" } });
      }
      return { campaign, payment };
    });
    if (!locked) return null;
    const { campaign, payment } = locked;

    // Phase 2 — the provider charge is refunded after the tx. A failure is
    // logged and surfaced as null (the campaign is already ended but nothing
    // was refunded — the payment stays PAID so a retry re-enters the path).
    let refundRef: string;
    try {
      // Method-aware like the booking refunds: an OMT/Whish-paid campaign
      // refunds via the provider that took the money (omt_refund_* / whish_*).
      const refundMethod = payment.method === "OMT" ? "OMT" : payment.method === "WHISH" ? "WHISH" : "STRIPE";
      refundRef = await getPaymentProvider(refundMethod).refund(payment.providerRef ?? payment.id, payment.amount);
    } catch (err) {
      console.error("[prisma-repo] refundCampaignPayment provider refund failed:", err);
      return null;
    }
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REFUNDED",
        refundRef,
        refundedAt: new Date(),
        metadata: {
          ...((payment.metadata as Record<string, unknown> | null) ?? {}),
          refundReason: reason ?? null,
        },
      },
    });

    const actor = opts.by ?? "Platform Admin";
    const reasonSuffix = reason ? ` — ${reason}` : "";
    // Audit — the refund lands in the admin activity feed with the reason
    // riding the entry text (same story as the /admin campaign-payments card).
    await logAdminActivity({
      code: ACTION_CODES.CAMPAIGN_REFUNDED,
      actionEn: `${actor} refunded ${campaign.nameEn} (${payment.id})${reasonSuffix}`,
      actionAr: `${actor} استردّ مبلغ حملة ${campaign.nameAr} (${payment.id})${reasonSuffix}`,
      actor,
      type: "payment",
    });

    // Notify the company — the SAME campaignRefunded payload the demo adapter
    // dispatches (shared campaignRefundNotification builder), so the /admin
    // preview renders exactly what the company received. Recipient is the
    // company's user row.
    await pushNotification(
      campaignRefundNotification(campaign, toDomainCampaignPayment(updated)),
      {
        name: campaign.company.nameEn,
        email: campaign.company.user.email ?? undefined,
        // The company's phone rides the recipient so real-mode SMS/WhatsApp
        // dispatch renders copy (mirrors the demo COMPANY recipient) — the
        // seed sets it on the BuildCo Ltd user row.
        phone: campaign.company.user.phone ?? undefined,
        // Dispatch the email in the COMPANY's preferred language.
        locale: campaign.company.locale === "ar" ? "ar" : "en",
      }
    );
    return toDomainCampaignPayment(updated);
  } catch (err) {
    console.error("[prisma-repo] refundCampaignPayment failed:", err);
    return null;
  }
}

/**
 * Self-serve purchase — create a PENDING campaign (+ its primary creative +
 * PENDING purchase row) and mint the hosted checkout (docs/PAYMENTS.md → ad
 * purchases). The campaign does NOT serve ads until prismaConfirmCampaignPayment
 * flips it to ACTIVE (getActiveAdsFor only matches ACTIVE). Mirrors
 * demoCreateCampaign: the DB keeps budget/spent in minor units (×100), the
 * primary Advertisement carries the placement + adType the domain Campaign
 * reads back (toDomainCampaign → ads[0]), and the purchase Payment is keyed by
 * advertisementId → campaign. `input.companyId` is the acting company's USER
 * id (Company.userId is unique) — real mode resolves the Company row from it
 * (the demo adapter ignores the field). Returns null when the company row is
 * missing or the checkout could not be minted; on a checkout failure the
 * PENDING rows stay behind so the idempotent Pay-now button (re-mint) can
 * recover once the provider is back — the same recovery story as the demo.
 */
export async function prismaCreateCampaign(
  input: CampaignCreateInput
): Promise<{ campaign: Campaign; checkoutUrl: string } | null> {
  const prisma = getPrisma();
  try {
    // Resolve the owning Company by the acting company's USER id. When it
    // doesn't resolve (e.g. an admin creating on behalf of the platform's
    // single company — the demo company in real mode), fall back to the
    // seeded company account, mirroring how prismaOwnerId falls back to the
    // seeded admin for notifications. The demo adapter always uses its fixed
    // company, so this keeps the company AND admin roles working in real mode
    // exactly as they do in demo mode.
    let company = await prisma.company.findUnique({
      where: { userId: input.companyId ?? "" },
      include: { user: { select: { email: true } } },
    });
    if (!company) {
      const fallback = await prisma.user.findUnique({
        where: { email: "ads@buildco.sa" },
        select: { id: true },
      });
      if (fallback) {
        company = await prisma.company.findUnique({
          where: { userId: fallback.id },
          include: { user: { select: { email: true } } },
        });
      }
    }
    if (!company?.user?.email) {
      console.error(
        `[prisma-repo] createCampaign: no Company row for user ${input.companyId} (the seed creates one for ads@buildco.sa)`
      );
      return null;
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const budgetMinor = Math.round(input.budget * 100);

    const campaign = await prisma.adCampaign.create({
      data: {
        companyId: company.id,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        budget: budgetMinor,
        currency: "USD",
        startsAt: now,
        endsAt,
        status: "PENDING",
      },
    });

    // The primary creative — placement + adType live on the Advertisement row
    // (toDomainCampaign reads ads[0]); status follows the campaign so ads
    // don't serve before the payment lands.
    await prisma.advertisement.create({
      data: {
        campaignId: campaign.id,
        companyId: company.id,
        type: AD_TYPE_APP_TO_DB[input.adType],
        status: "PENDING",
        titleEn: input.nameEn,
        titleAr: input.nameAr,
        // The self-serve form doesn't collect a destination URL yet — the
        // schema requires the column, so the click-through target is a
        // placeholder until the form grows the field.
        targetUrl: "https://example.com",
        placement: input.placement,
        price: budgetMinor,
        currency: "USD",
        startsAt: now,
        endsAt,
      },
    });

    // The purchase row — amount in minor units (the provider seam's contract:
    // Stripe unit_amount etc.), keyed by advertisementId → campaign so
    // prismaGetCampaignPayment / the webhook resolve it.
    await prisma.payment.create({
      data: {
        companyId: company.id,
        advertisementId: campaign.id,
        amount: budgetMinor,
        currency: "USD",
        method: "STRIPE",
        status: "PENDING",
        metadata: { campaignId: campaign.id },
      },
    });

    // Mint the hosted checkout. A provider failure surfaces as null — the
    // PENDING campaign + payment + creative rows stay (the Pay-now button's
    // idempotent re-mint recovers them), mirroring the demo.
    const checkout = await prismaCreateCampaignCheckout(campaign.id);
    if (!checkout) return null;

    const row = await prisma.adCampaign.findUnique({
      where: { id: campaign.id },
      include: { ads: { orderBy: { createdAt: "asc" as const } } },
    });
    if (!row) return null;
    return { campaign: toDomainCampaign(row), checkoutUrl: checkout.url };
  } catch (err) {
    console.error("[prisma-repo] createCampaign failed:", err);
    return null;
  }
}

/**
 * Mint (or re-mint) the hosted checkout for a PENDING campaign — the "Pay
 * now" path. Mirrors prismaCreateBookingCheckout: a short tx re-checks the
 * campaign is still awaiting payment AND a PENDING purchase row exists, then
 * the provider seam runs OUTSIDE the tx (a network call must not hold the db
 * tx) and the provider ref + checkout url persist with a CAS (two concurrent
 * Pay clicks can't both mint sessions — the loser matches 0 rows, re-reads,
 * and returns the winner's url). Idempotent per campaign. Returns null for
 * unknown campaigns, ones not awaiting payment, or a provider failure.
 */
export async function prismaCreateCampaignCheckout(
  campaignId: string,
  method: "STRIPE" | "OMT" | "WHISH" = "STRIPE"
): Promise<{ url: string } | null> {
  const prisma = getPrisma();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const campaign = await tx.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          ads: { orderBy: { createdAt: "asc" as const }, take: 1 },
          company: { include: { user: { select: { email: true } } } },
        },
      });
      // Must still be PENDING AND have a PENDING purchase row.
      if (!campaign || campaign.status !== "PENDING") return null;
      // One purchase row per campaign today; newest-first keeps the pick
      // deterministic if a retried purchase ever produced a second row
      // (same convention as prismaGetCampaignPayment).
      const payment = await tx.payment.findFirst({
        where: { advertisementId: campaignId },
        orderBy: { createdAt: "desc" },
      });
      if (!payment || payment.status !== "PENDING") return null;
      return { campaign, payment };
    });
    if (!row) return null;

    const existingUrl = (row.payment.metadata as { checkoutUrl?: string } | null)?.checkoutUrl ?? null;
    if (row.payment.providerRef && existingUrl) return { url: existingUrl };

    const provider = getPaymentProvider(method);
    const result = await provider.createCheckout({
      paymentId: row.payment.id,
      campaignId,
      amountMinor: row.payment.amount,
      currency: row.payment.currency,
      customerEmail: row.campaign.company.user.email ?? undefined,
      description: `${row.campaign.nameEn} — ${row.campaign.ads[0]?.placement ?? "ad purchase"}`,
      successUrl: `${origin()}/company?paid=1`,
      cancelUrl: `${origin()}/company`,
    });

    // Persist the provider ref + checkout url with a CAS (only if still
    // unset) so two concurrent Pay clicks can't both mint sessions. The
    // chosen method rides the same claim (a re-click keeps the first pick).
    const claimed = await prisma.payment.updateMany({
      where: { id: row.payment.id, providerRef: null },
      data: { providerRef: result.providerRef, method, metadata: { campaignId, checkoutUrl: result.url } },
    });
    if (claimed.count === 0) {
      const winner = await prisma.payment.findUnique({ where: { id: row.payment.id } });
      const winnerUrl = (winner?.metadata as { checkoutUrl?: string } | null)?.checkoutUrl;
      return winnerUrl ? { url: winnerUrl } : null;
    }
    return { url: result.url };
  } catch (err) {
    console.error("[prisma-repo] createCampaignCheckout failed:", err);
    return null;
  }
}

/**
 * The provider webhook (or the simulated checkout callback) landed for an ad
 * purchase: PENDING → ACTIVE (the campaign starts serving), Payment PENDING →
 * PAID, and a PAID Invoice row (WA-YYYY-NNNNN — the same sequence as booking
 * receipts) is minted in the same tx: the receipt the /admin credit-note flip
 * voids on refund (a refund with no invoice had nothing to void — this is
 * what makes the flip meaningful in production). The status flips are CAS
 * updates (idempotent — a webhook redelivery can't double-confirm, re-mint an
 * invoice, or re-notify), and the company is notified AFTER the tx with the
 * SAME "Campaign is live" payload the demo adapter dispatches. Returns the
 * ACTIVE campaign, or null. Note: a CONCURRENT delivery whose tx reads the
 * campaign before the first commits loses the CAS and returns null (not the
 * campaign) — the webhook treats null as ok, matching the booking-confirm
 * convention; the sequential redelivery case early-returns the ACTIVE row.
 */
export async function prismaConfirmCampaignPayment(
  campaignId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<Campaign | null> {
  const prisma = getPrisma();
  // The count-derived invoice number can collide with a concurrent confirm of
  // another purchase (Invoice.number is unique): the loser's whole tx rolls
  // back — campaign stays PENDING — so a bounded retry re-runs it with a
  // fresh count (same pattern as prismaConfirmBookingPayment).
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";

  for (let attempt = 0; attempt < 3; attempt++) {
    // True only when THIS call flipped PENDING → ACTIVE (an idempotent
    // webhook redelivery early-returns with the flag false, so the invoice
    // mints and the notification fire exactly once).
    let transitioned = false;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const campaign = await tx.adCampaign.findUnique({
          where: { id: campaignId },
          include: {
            ads: { orderBy: { createdAt: "asc" as const }, take: 1 },
            company: { include: { user: { select: { email: true, phone: true } } } },
          },
        });
        if (!campaign) return null;
        const payment = await tx.payment.findFirst({ where: { advertisementId: campaignId } });
        if (!payment) return null;
        // Already confirmed by an earlier webhook delivery — no-op success.
        if (campaign.status === "ACTIVE" && payment.status === "PAID") return campaign;
        if (campaign.status !== "PENDING" || payment.status !== "PENDING") return null;

        const flipped = await tx.adCampaign.updateMany({
          where: { id: campaignId, status: "PENDING" },
          data: { status: "ACTIVE" },
        });
        if (flipped.count === 0) return null;
        transitioned = true;
        await tx.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "PAID", paidAt: new Date(), providerRef },
        });
        // The campaign's creatives go live with it — rotation only serves
        // ACTIVE ads, so a confirmed purchase must have ACTIVE creatives or
        // it would never serve (the demo adapter has no ad rows to flip; the
        // W2 boundary makes this the real-mode equivalent of "starts serving").
        await tx.advertisement.updateMany({
          where: { campaignId, status: "PENDING" },
          data: { status: "ACTIVE" },
        });

        // The purchase's PAID invoice — what the credit-note flip voids on
        // refund. Same WA-YYYY-NNNNN per-year sequence as booking receipts
        // (the count shares the namespace; the P2002 retry above handles a
        // concurrent mint colliding on the number). The invoice's owner is
        // the company's user row (Invoice.userId is a required FK).
        const year = new Date().getFullYear();
        const count = await tx.invoice.count({ where: { number: { startsWith: `WA-${year}-` } } });
        await tx.invoice.create({
          data: {
            number: formatInvoiceNumber(year, count + 1),
            userId: campaign.company.userId,
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency || "USD",
            status: "PAID",
            paidAt: new Date(),
            items: [
              { description: `${campaign.nameEn} — ${campaign.ads[0]?.placement ?? "ad purchase"}`, qty: 1, unitPrice: payment.amount },
            ],
          },
        });
        return campaign;
      });
      if (!result) return null;

      // Notify the company AFTER the tx (the inbox write uses its own
      // connection and must not share the tx's row locks), only when THIS
      // call did the flip — a redelivery never re-notifies.
      if (transitioned) {
        await pushNotification(
          campaignActiveNotification(result),
          {
            name: result.company.nameEn,
            email: result.company.user.email ?? undefined,
            // The company's phone rides the recipient so real-mode SMS/WhatsApp
            // dispatch renders copy (mirrors the demo COMPANY recipient).
            phone: result.company.user.phone ?? undefined,
            // Dispatch the campaign-live email in the COMPANY's preferred
            // language — the same rule the refund path uses, so confirm and
            // refund never disagree on the recipient locale.
            locale: result.company.locale === "ar" ? "ar" : "en",
          }
        );
        // §Lebanon — audit the manual (OMT/Whish) campaign confirm with the
        // ACTING ADMIN as actor (threaded via opts.by), the real-mode twin of
        // the demo CAMPAIGN_PAID entry so all three manual scopes appear in
        // the feed (demo/prisma parity).
        const actor = opts.by ?? "Platform Admin";
        await logAdminActivity({
          code: ACTION_CODES.CAMPAIGN_PAID,
          actionEn: `${actor} confirmed campaign ${result.nameEn} (${campaignId})`,
          actionAr: `${actor} أكّد دفع حملة ${result.nameAr} (${campaignId})`,
          actor,
          ...(opts.byId ? { actorId: opts.byId } : {}),
          type: "payment",
        });
      }
      const row = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: { ads: { orderBy: { createdAt: "asc" as const } } },
      });
      return row ? toDomainCampaign(row) : null;
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue; // whole tx rolled back — retry
      console.error("[prisma-repo] confirmCampaignPayment failed:", err);
      return null;
    }
  }
  return null;
}

/* ──────────────────── W2 boundary close — rotation + invoices ──────────────────
 * Ad rotation and the company invoices list in real mode (the W2 revenue-rail
 * boundary, docs/ENHANCEMENT-PLAN.md §3.2). Mirrors the demo adapter in
 * src/lib/data/campaigns.ts exactly:
 *   • prismaGetActiveAdsFor serves ACTIVE campaigns whose ACTIVE primary
 *     creative matches the placement request (the demo's "a|b" token split,
 *     case-folded substring), narrowed to the requested category/city ONLY
 *     for TARGETED ads (untargeted buys always serve — the demo's
 *     targetCategories gate, so a rotation request never hides an untargeted
 *     purchase). The campaign — not the ad — is the domain unit, exactly like
 *     the demo, so the returned id round-trips into recordImpression/Click.
 *   • prismaRecordImpression / prismaRecordClick bump the served creative's
 *     counters (same CTR formula as the demo) and the campaign's spent
 *     (impression +1 minor / click +100 minor, capped at budget — the demo's
 *     $0.01 / $1.00 major increments) inside one tx.
 *   • prismaGetInvoices lists the seeded company's Invoice rows (the purchase
 *     path mints WA-YYYY-NNNNN receipts; the refund's VOID flip reads back as
 *     the credit note), newest first, mapped to the domain Invoice (minor →
 *     major, PAID/VOID → paid/refunded, EN + AR descriptions from the items
 *     + the campaign's Arabic name). Production TODO: scope by the acting
 *     company's user id once real auth lands — the demo seam is single-company,
 *     so the seeded company (ads@buildco.sa) is the anchor.
 * ──────────────────────────────────────────────────────────────────────────── */

const INVOICE_STATUS_DB_TO_APP: Record<string, Invoice["status"]> = {
  PAID: "paid",
  VOID: "refunded", // the credit note — a refunded purchase reads back here
  DRAFT: "pending",
  SENT: "pending",
  OVERDUE: "pending",
};

/** Shape of an Invoice row (+ its purchase's campaign, when advertising) —
 * structural, so mapper tests need no live DB. */
export interface PrismaInvoiceRow {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  items?: { description: string }[] | null;
  payment?: { advertisementId: string | null } | null;
  campaign?: { nameAr: string; placement: string } | null;
}

/** Map an Invoice row (+ its campaign) to the domain Invoice type. */
export function toDomainInvoice(row: PrismaInvoiceRow): Invoice {
  const fallback = row.items?.[0]?.description ?? row.number;
  return {
    id: row.id,
    number: row.number,
    // Advertising purchases carry payment.advertisementId (→ the campaign);
    // everything else (subscription renewals, customer receipts) reads as
    // subscription — the demo's two scopes, and /company filters advertising.
    scope: row.payment?.advertisementId ? "advertising" : "subscription",
    // The purchase path writes ONE language-neutral item description
    // (`${nameEn} — ${placement}`); the Arabic line resolves from the
    // campaign's nameAr when known, else falls back to the same string.
    descriptionEn: fallback,
    descriptionAr: row.campaign ? `${row.campaign.nameAr} — ${row.campaign.placement}` : fallback,
    // DB minor → domain major (×100) — the same convention as toDomainWorker.
    amount: row.amount / 100,
    currency: (row.currency || "USD") as CurrencyCode,
    date: (row.paidAt ?? row.createdAt).toISOString(),
    status: INVOICE_STATUS_DB_TO_APP[row.status] ?? "pending",
    // Populated so shared consumers can resolve the purchase without a second
    // lookup — the demo store keys invoices by campaignId; prisma keeps the
    // real link in Payment.advertisementId (read through here).
    campaignId: row.payment?.advertisementId ?? undefined,
  };
}

/**
 * The company's invoices (advertising + subscription), newest first — mirrors
 * demoGetInvoices (the /company invoices card + the worker dashboard read
 * this seam). Real mode anchors on the seeded company (ads@buildco.sa — the
 * same fallback prismaCreateCampaign resolves), so self-serve ad purchases
 * show up end-to-end: the WA-YYYY-NNNNN receipt the webhook mints reads back
 * as a paid advertising invoice, and a refund's VOID flip as the credit note.
 * One extra query batches the campaigns behind advertising invoices for the
 * Arabic description line.
 */
export async function prismaGetInvoices(): Promise<Invoice[]> {
  const prisma = getPrisma();
  const companyUser = await prisma.user.findUnique({
    where: { email: "ads@buildco.sa" },
    select: { id: true },
  });
  if (!companyUser) return [];
  const rows = await prisma.invoice.findMany({
    where: { userId: companyUser.id },
    orderBy: { createdAt: "desc" },
    include: { payment: { select: { advertisementId: true } } },
  });
  const campaignIds = rows
    .map((r) => r.payment?.advertisementId)
    .filter((id): id is string => Boolean(id));
  const campaigns = campaignIds.length
    ? await prisma.adCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: {
          id: true,
          nameAr: true,
          ads: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "asc" as const },
            take: 1,
            select: { placement: true },
          },
        },
      })
    : [];
  const campaignByAd = new Map(campaigns.map((c) => [c.id, c]));
  return rows.map((r) =>
    toDomainInvoice({
      id: r.id,
      number: r.number,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
      items: (r.items as { description: string }[] | null) ?? undefined,
      payment: r.payment ? { advertisementId: r.payment.advertisementId } : null,
      campaign: (() => {
        const c = r.payment?.advertisementId ? campaignByAd.get(r.payment.advertisementId) : undefined;
        return c ? { nameAr: c.nameAr, placement: c.ads[0]?.placement ?? "" } : null;
      })(),
    })
  );
}

/** Case-folded placement match — the demo's one-way substring (the campaign's
 * placement contains the requested token) plus the reverse, so BOTH the exact
 * lowercase placements the purchase path writes ("homepage") AND human
 * display strings ("Homepage · Banner") match a "homepage" request. */
export function matchesAdPlacement(adPlacement: string, tokens: string[]): boolean {
  const p = adPlacement.trim().toLowerCase();
  if (!p) return false;
  return tokens.some((token) => p.includes(token) || token.includes(p));
}

/** Targeted-ad gate — mirrors demoGetActiveAdsFor's `targetCategories?.length`
 * rule: an UNTARGETED ad (no category/city) always serves; a targeted ad only
 * serves a request naming its category/city. */
export function matchesAdTargeting(
  ad: { categorySlug?: string | null; citySlug?: string | null },
  opts: { category?: string; city?: string }
): boolean {
  if (opts.category && ad.categorySlug && ad.categorySlug !== opts.category) return false;
  if (opts.city && ad.citySlug && ad.citySlug !== opts.city) return false;
  return true;
}

/**
 * Ad rotation, real mode: ACTIVE campaigns whose ACTIVE primary creative's
 * placement matches the request, newest-first — mirrors demoGetActiveAdsFor
 * (which only serves ACTIVE campaigns). Category/city narrow the set only
 * for TARGETED ads. The campaign (not the ad) is the domain unit the API
 * rotates, exactly like the demo, so the returned Campaign's id round-trips
 * into prismaRecordImpression / prismaRecordClick.
 */
export async function prismaGetActiveAdsFor(
  placement: string,
  opts: { category?: string; city?: string } = {}
): Promise<Campaign[]> {
  const prisma = getPrisma();
  const tokens = placement
    .split("|")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const rows = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE" },
    include: {
      // Only ACTIVE creatives rotate; toDomainCampaign reads ads[0], so a
      // campaign whose primary creative is PENDING/PAUSED maps its first
      // ACTIVE ad's placement/type — one with none drops out below.
      ads: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" as const },
        include: {
          category: { select: { slug: true } },
          city: { select: { slug: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .filter((c) =>
      c.ads.some(
        (ad) =>
          matchesAdPlacement(ad.placement, tokens) &&
          matchesAdTargeting(
            { categorySlug: ad.category?.slug ?? null, citySlug: ad.city?.slug ?? null },
            opts
          )
      )
    )
    .map(toDomainCampaign);
}

/**
 * Bump a served ad's counters + the campaign's spent inside one tx — the real
 * mode of recordImpression / recordClick (the /api/ads rotation seam).
 * Mirrors the demo: an impression adds $0.01 of spend, a click $1.00 (1 / 100
 * minor), capped at budget, with the same CTR formula (rounded to 2dp). The
 * primary ACTIVE creative is the served one (getActiveAdsFor matched it); a
 * read-modify-write inside the tx keeps impressions/ctr/spent consistent.
 * Returns the updated campaign, or null when the campaign (or its creative)
 * is gone.
 */
async function prismaTrackAd(
  campaignId: string,
  kind: "impression" | "click"
): Promise<Campaign | null> {
  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const ad = await tx.advertisement.findFirst({
        where: { campaignId, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        include: { campaign: true },
      });
      if (!ad?.campaign) return;
      // A click does NOT add an impression — the /api/ads impression and
      // click routes are independent, and the demo's recordClick only bumps
      // clicks (parity: impressions stay put, ctr = clicks/impressions).
      const impressions = ad.impressions + (kind === "click" ? 0 : 1);
      const clicks = ad.clicks + (kind === "click" ? 1 : 0);
      await tx.advertisement.update({
        where: { id: ad.id },
        data: {
          impressions,
          clicks,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
        },
      });
      const spend = kind === "click" ? 100 : 1; // demo: click $1.00, impression $0.01 (minor)
      const spent = Math.min(ad.campaign.budget, ad.campaign.spent + spend);
      await tx.adCampaign.update({ where: { id: campaignId }, data: { spent } });
    });
    const row = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      include: { ads: { orderBy: { createdAt: "asc" as const } } },
    });
    return row ? toDomainCampaign(row) : null;
  } catch (err) {
    console.error(`[prisma-repo] trackAd (${kind}) failed:`, err);
    return null;
  }
}

/** Track a served impression (ad rotation). Returns the updated campaign. */
export function prismaRecordImpression(campaignId: string): Promise<Campaign | null> {
  return prismaTrackAd(campaignId, "impression");
}

/** Track a click. Returns the updated campaign. */
export function prismaRecordClick(campaignId: string): Promise<Campaign | null> {
  return prismaTrackAd(campaignId, "click");
}

// ─────────────────────────────────────────────────────────────────────────────
// W2 RECURRING BOOKINGS — maintenance contracts (docs/ENHANCEMENT-PLAN.md §7 #1)
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the demo adapter: the first occurrence is a normal REQUESTED booking
// claimed through the exact same CAS path as a one-shot request (shared
// createBookingRequestTx); the worker accepts the CONTRACT once and the future
// occurrences are materialized at the cadence by claiming real AVAILABLE slots
// (any occurrence whose cadence time has no covering slot is skipped — the
// generation cron retries it as the worker's availability rolls forward).
// Decline cancels the contract and frees the first occurrence's slot (rule 3).
// Occurrence identity is (recurringBookingId, startAt) — a unique index — so
// overlapping accept + cron runs can never double-materialize.

const RECURRING_OCCURRENCES = {
  orderBy: { startAt: "asc" as const },
  include: {
    events: { orderBy: { createdAt: "asc" as const } },
    serviceItem: true,
    // The customer's User row — its locale is the preferred language the
    // occurrence notifications render in (guest occurrences → "en").
    customer: { select: { locale: true } },
  },
} as const;

/** Worker-side: create a recurring request. The first occurrence claims the
 * slot through the one-shot path, then the contract row wraps it (same tx — a
 * contract-number collision rolls the slot claim back too). */
export async function prismaCreateRecurringRequest(
  input: RecurringRequestInput
): Promise<{ recurring: RecurringBooking; booking: Booking } | { error: "slot-taken" | "invalid" }> {
  const prisma = getPrisma();
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";

  for (let attempt = 0; attempt < 3; attempt++) {
    let created:
      | { ok: true; recurring: PrismaRecurringRow; booking: BookingFullRow; worker: BookingWorkerInfo }
      | { ok: false; error: "slot-taken" | "invalid" };
    try {
      created = await prisma.$transaction(async (tx) => {
        const res = await createBookingRequestTx(tx, input);
        if (!res.ok) return res;

        const count = await tx.recurringBooking.count();
        const recurring = await tx.recurringBooking.create({
          data: {
            number: `RC-${1001 + count}`,
            workerId: input.workerId,
            customerId: input.customerId ?? null,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerEmail: input.customerEmail,
            serviceItemId: res.booking.serviceItemId ?? null,
            jobTitle: input.jobTitle,
            note: input.note,
            frequency: input.frequency.toUpperCase() as $Enums.RecurringFrequency,
            anchorStart: res.booking.startAt!, // the first occurrence claimed a slot
            anchorEnd: res.booking.endAt!,
            status: "ACTIVE",
          },
        });
        await tx.booking.update({
          where: { id: res.booking.id },
          data: { recurringBookingId: recurring.id },
        });

        const full = await tx.booking.findUnique({
          where: { id: res.booking.id },
          include: { events: { orderBy: { createdAt: "asc" as const } }, serviceItem: true },
        });
        const rec = await tx.recurringBooking.findUnique({
          where: { id: recurring.id },
          include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
        });
        return {
          ok: true,
          recurring: rec as unknown as PrismaRecurringRow,
          booking: full!,
          worker: res.worker,
        };
      });
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue; // whole tx rolled back — retry
      console.error("[prisma-repo] createRecurringRequest failed:", err);
      return { error: "invalid" };
    }

    if (!created.ok) return { error: created.error };

    // Notify the worker AFTER the tx (same as the one-shot request).
    const workerLocale = (created.worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
    await pushNotification(
      bookingNotification(toDomainBooking(created.booking), "worker-request"),
      {
        name: created.worker.nameEn,
        email: created.worker.email ?? undefined,
        phone: created.worker.phone,
        locale: workerLocale,
      }
    );
    return { recurring: toDomainRecurring(created.recurring), booking: toDomainBooking(created.booking) };
  }
  return { error: "invalid" };
}

/**
 * Worker side: accept (quote/deposit) or decline the whole contract. Accept
 * confirms the first occurrence through the one-shot respond path (slot →
 * BOOKED, take-rate stamp, Payment row on deposit) and materializes the next
 * RECURRING_OCCURRENCE_COUNT occurrences as CONFIRMED bookings claiming real
 * AVAILABLE slots that cover each cadence time (skipped ones stay pending for
 * the generation cron). Decline cancels the contract and frees the first slot.
 */
export async function prismaRespondToRecurring(
  recurringId: string,
  input: RecurringRespondInput
): Promise<RecurringBooking | null> {
  const prisma = getPrisma();
  const isNumberCollision = (err: unknown) => (err as { code?: string })?.code === "P2002";

  for (let attempt = 0; attempt < 3; attempt++) {
    let result: PrismaRecurringRow | null = null;
    try {
      result = await prisma.$transaction(async (tx): Promise<PrismaRecurringRow | null> => {
        const recurring = await tx.recurringBooking.findUnique({
          where: { id: recurringId },
          include: {
            serviceItem: true,
            occurrences: {
              orderBy: { startAt: "asc" as const },
              include: { slot: true, worker: { include: { subscription: true } } },
            },
          },
        });
        if (!recurring || recurring.status !== "ACTIVE") return null;
        const first = recurring.occurrences[0];
        if (!first || first.status !== "REQUESTED") return null;
        const slot = first.slot;

        if (input.accept) {
          // Rule 4 — a deposit flips to PENDING_PAYMENT until paymentId lands.
          const status = input.deposit ? "PENDING_PAYMENT" : "CONFIRMED";
          // M5 take rate — same snapshot the one-shot accept takes.
          const quoteMinor = input.quote ?? null;
          const exempt = isPlanFeeExempt(first.worker.subscription?.plan);
          const platformFee = quoteMinor ? computePlatformFee(quoteMinor, { exempt }) : null;
          const updated = await tx.booking.updateMany({
            where: { id: first.id, status: "REQUESTED" },
            data: {
              status,
              quote: quoteMinor,
              deposit: input.deposit ?? null,
              platformFee,
              platformFeeRateBps: quoteMinor ? PLATFORM_FEE_RATE_BPS : null,
            },
          });
          if (updated.count === 0) return null;
          if (input.deposit) {
            const payment = await tx.payment.create({
              data: {
                userId: first.customerId,
                amount: input.deposit,
                currency: first.currency || "USD",
                method: "STRIPE",
                status: "PENDING",
                metadata: { bookingId: first.id },
              },
            });
            await tx.booking.update({ where: { id: first.id }, data: { paymentId: payment.id } });
          }
          if (slot) await tx.bookingSlot.update({ where: { id: slot.id }, data: { status: "BOOKED" } });
          await tx.bookingEvent.create({ data: { bookingId: first.id, status, actorType: "worker" } });

          // Materialize the cadence — same terms as the first occurrence, each
          // claiming a real AVAILABLE slot that covers its window (CAS, so a
          // concurrent one-shot grab loses the slot and the occurrence stays
          // pending for the cron). No covering slot → skip, not fail.
          const frequency = RECURRING_FREQUENCY_DB_TO_APP[recurring.frequency] ?? "weekly";
          const nextStarts = generateRecurringOccurrences(
            recurring.anchorStart.toISOString(),
            frequency,
            RECURRING_OCCURRENCE_COUNT
          );
          const duration = recurring.anchorEnd.getTime() - recurring.anchorStart.getTime();
          for (const startIso of nextStarts) {
            const occStart = new Date(startIso);
            const occEnd = new Date(occStart.getTime() + duration);
            const cover = await tx.bookingSlot.findFirst({
              where: {
                workerId: recurring.workerId,
                status: "AVAILABLE",
                startAt: { lte: occStart },
                endAt: { gte: occEnd },
              },
              orderBy: { startAt: "asc" },
            });
            if (!cover) continue;
            const claimed = await tx.bookingSlot.updateMany({
              where: { id: cover.id, workerId: recurring.workerId, status: "AVAILABLE" },
              data: { status: "BOOKED" },
            });
            if (claimed.count === 0) continue;
            const count = await tx.booking.count();
            const occ = await tx.booking.create({
              data: {
                number: `BK-${1001 + count}`,
                workerId: recurring.workerId,
                customerId: recurring.customerId,
                customerName: recurring.customerName,
                customerPhone: recurring.customerPhone,
                customerEmail: recurring.customerEmail,
                jobTitle: recurring.jobTitle,
                note: recurring.note,
                serviceItemId: recurring.serviceItemId,
                startAt: occStart,
                endAt: occEnd,
                status: "CONFIRMED",
                quote: quoteMinor,
                deposit: input.deposit ?? null,
                platformFee,
                platformFeeRateBps: quoteMinor ? PLATFORM_FEE_RATE_BPS : null,
                currency: first.currency || "USD",
                recurringBookingId: recurring.id,
              },
            });
            await tx.bookingEvent.create({
              data: { bookingId: occ.id, status: "CONFIRMED", actorType: "system", reason: `recurring ${frequency}` },
            });
            await tx.bookingSlot.update({ where: { id: cover.id }, data: { bookingId: occ.id } });
          }
        } else {
          // Decline the contract = decline the first occurrence (frees its slot,
          // rule 3) and cancel the whole cadence.
          const updated = await tx.booking.updateMany({
            where: { id: first.id, status: "REQUESTED" },
            data: { status: "DECLINED", declinedReason: input.declineReason ?? null },
          });
          if (updated.count === 0) return null;
          if (slot) {
            await tx.bookingSlot.update({
              where: { id: slot.id },
              data: { status: "AVAILABLE", bookingId: null },
            });
          }
          await tx.bookingEvent.create({
            data: { bookingId: first.id, status: "DECLINED", actorType: "worker", reason: input.declineReason ?? null },
          });
          await tx.recurringBooking.update({ where: { id: recurringId }, data: { status: "CANCELLED" } });
        }

        const full = await tx.recurringBooking.findUnique({
          where: { id: recurringId },
          include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
        });
        return full as unknown as PrismaRecurringRow;
      });
    } catch (err) {
      if (attempt < 2 && isNumberCollision(err)) continue; // materialized occurrence number collided — retry
      console.error("[prisma-repo] respondToRecurring failed:", err);
      return null;
    }

    if (!result) return null;
    const first = result.occurrences[0];
    if (first) {
      const accepted = first.status === "CONFIRMED" || first.status === "PENDING_PAYMENT";
      await pushNotification(
        bookingNotification(toDomainBooking(first), accepted ? "customer-confirmed" : "customer-declined"),
        first.customerEmail
          ? {
              name: first.customerName,
              email: first.customerEmail,
              phone: first.customerPhone,
              // The customer's preferred language (User.locale) — not always EN.
              locale: first.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
    return toDomainRecurring(result);
  }
  return null;
}

/**
 * The recurring generation cron (W2): for every ACTIVE contract whose first
 * occurrence has been accepted (CONFIRMED / PENDING_PAYMENT), materialize the
 * cadence occurrences that fall within the lookahead window (now,
 * now + RECURRING_LOOKAHEAD_DAYS] and are not yet materialized — each claiming
 * a real AVAILABLE slot that covers its window (CAS). Idempotent: the
 * (recurringBookingId, startAt) unique index is the backstop, and the slot CAS
 * means two overlapping runs can't both claim the same occurrence. Returns
 * { contracts, materialized } for the cron response.
 */
export async function prismaGenerateRecurringOccurrences(
  now = new Date()
): Promise<{ contracts: number; materialized: number }> {
  const prisma = getPrisma();
  const to = new Date(now.getTime() + RECURRING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const contracts = await prisma.recurringBooking.findMany({
    where: { status: "ACTIVE" },
    include: {
      serviceItem: true,
      // The customer's User row — its locale is the preferred language the
      // recurring-visit notification renders in (guest contracts → "en").
      customer: { select: { locale: true } },
      occurrences: { orderBy: { startAt: "asc" as const }, select: { startAt: true, status: true, quote: true, deposit: true, platformFee: true, platformFeeRateBps: true, currency: true } },
    },
  });

  let contractsTouched = 0;
  let materialized = 0;
  for (const contract of contracts) {
    const first = contract.occurrences[0];
    if (!first) continue;
    if (first.status !== "CONFIRMED" && first.status !== "PENDING_PAYMENT") continue; // not accepted yet
    const frequency = RECURRING_FREQUENCY_DB_TO_APP[contract.frequency] ?? "weekly";
    // Occurrences are always slot-bound (a contract's requests claim a slot),
    // but the column is nullable — guard so a null can never crash the cron.
    const existing = new Set(contract.occurrences.map((o) => o.startAt?.getTime() ?? 0));
    const due = occurrencesInWindow(contract.anchorStart.toISOString(), frequency, now, to)
      .map((iso) => new Date(iso))
      .filter((d) => !existing.has(d.getTime()));
    if (due.length === 0) continue;

    // The occurrences materialized this run (ascending — `due` comes from
    // occurrencesInWindow) — the earliest is the "next visit" the customer
    // gets notified about after the tx.
    const createdRows: PrismaBookingRow[] = [];
    await prisma.$transaction(async (tx) => {
      for (const occStart of due) {
        const occEnd = new Date(occStart.getTime() + (contract.anchorEnd.getTime() - contract.anchorStart.getTime()));
        // Re-check inside the tx (a concurrent run may have materialized since
        // the outer read) — the unique index would reject the create anyway.
        const dup = await tx.booking.findFirst({
          where: { recurringBookingId: contract.id, startAt: occStart },
          select: { id: true },
        });
        if (dup) continue;
        const cover = await tx.bookingSlot.findFirst({
          where: {
            workerId: contract.workerId,
            status: "AVAILABLE",
            startAt: { lte: occStart },
            endAt: { gte: occEnd },
          },
          orderBy: { startAt: "asc" },
        });
        if (!cover) continue;
        const claimed = await tx.bookingSlot.updateMany({
          where: { id: cover.id, workerId: contract.workerId, status: "AVAILABLE" },
          data: { status: "BOOKED" },
        });
        if (claimed.count === 0) continue;
        const count = await tx.booking.count();
        const occ = await tx.booking.create({
          data: {
            number: `BK-${1001 + count}`,
            workerId: contract.workerId,
            customerId: contract.customerId,
            customerName: contract.customerName,
            customerPhone: contract.customerPhone,
            customerEmail: contract.customerEmail,
            jobTitle: contract.jobTitle,
            note: contract.note,
            serviceItemId: contract.serviceItemId,
            startAt: occStart,
            endAt: occEnd,
            status: "CONFIRMED",
            quote: first.quote,
            deposit: first.deposit,
            platformFee: first.platformFee,
            platformFeeRateBps: first.platformFeeRateBps,
            currency: first.currency || "USD",
            recurringBookingId: contract.id,
          },
        });
        await tx.bookingEvent.create({
          data: { bookingId: occ.id, status: "CONFIRMED", actorType: "system", reason: `recurring ${frequency}` },
        });
        await tx.bookingSlot.update({ where: { id: cover.id }, data: { bookingId: occ.id } });
        createdRows.push(occ as unknown as PrismaBookingRow);
        materialized += 1;
      }
    });
    contractsTouched += 1;

    // Notify the customer about the next scheduled visit AFTER the tx (the
    // inbox write must not share the tx's row locks — same rule as every other
    // booking notification). One notification per contract per run, about the
    // earliest materialized occurrence — its date rides both the body and the
    // email's receipt card (BookingEmailContext.startAt).
    if (createdRows.length > 0) {
      const next = createdRows[0];
      await pushNotification(
        bookingNotification(toDomainBooking(next), "customer-recurring-visit"),
        next.customerEmail
          ? {
              name: next.customerName,
              email: next.customerEmail,
              phone: next.customerPhone,
              // The contract's customer locale — the occurrence was created
              // from it, so its User.locale is the recipient's preference.
              locale: contract.customer?.locale === "ar" ? "ar" : "en",
            }
          : undefined
      );
    }
  }
  return { contracts: contractsTouched, materialized };
}

/** A worker's recurring contracts, newest first (mirrors demoGetWorkerRecurrings). */
export async function prismaGetWorkerRecurrings(workerId: string): Promise<RecurringBooking[]> {
  const prisma = getPrisma();
  const rows = await prisma.recurringBooking.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
    include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
  });
  return rows.map((r) => toDomainRecurring(r as unknown as PrismaRecurringRow));
}

/** A customer's contracts, matched by email or normalized phone (mirrors
 * prismaGetCustomerBookings' lookup — same regexp_replace on both sides). */
export async function prismaGetCustomerRecurrings(
  identifier: { email?: string; phone?: string } = {}
): Promise<RecurringBooking[]> {
  const prisma = getPrisma();
  const email = identifier.email?.trim().toLowerCase();
  const phone = identifier.phone?.replace(/[\s\-()]/g, "");

  let ids: string[] = [];
  if (email || phone) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT r."id"
      FROM "RecurringBooking" r
      WHERE (${email ?? null}::text IS NOT NULL AND LOWER(r."customerEmail") = ${email ?? null})
         OR (${phone ?? null}::text IS NOT NULL
             AND REGEXP_REPLACE(r."customerPhone", ${PHONE_SEP_PATTERN}, '', 'g') = ${phone ?? null})
    `;
    ids = rows.map((r) => r.id);
  }
  if (ids.length === 0) return [];

  const rows = await prisma.recurringBooking.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
  });
  return rows.map((r) => toDomainRecurring(r as unknown as PrismaRecurringRow));
}

/** A contract by id — the admin dispute view resolves an occurrence's
 * recurringId to the full contract (number, cadence, occurrences). */
export async function prismaGetRecurringById(id: string): Promise<RecurringBooking | null> {
  const prisma = getPrisma();
  const row = await prisma.recurringBooking.findUnique({
    where: { id },
    include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
  });
  return row ? toDomainRecurring(row as unknown as PrismaRecurringRow) : null;
}

/**
 * Customer cancels an active contract (W2): every non-terminal occurrence is
 * cancelled in place (slot freed, rule 3, audit event), the contract flips to
 * CANCELLED, and the worker is notified after the tx. Returns the contract or
 * null for unknown/already-cancelled contracts.
 */
export async function prismaCancelRecurringContract(
  recurringId: string,
  reason?: string
): Promise<RecurringBooking | null> {
  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const recurring = await tx.recurringBooking.findUnique({
        where: { id: recurringId },
        include: {
          worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
          occurrences: { orderBy: { startAt: "asc" as const }, include: { slot: true } },
        },
      });
      if (!recurring || recurring.status !== "ACTIVE") return null;

      for (const occ of recurring.occurrences) {
        if (BOOKING_TERMINAL_STATUSES.includes(BOOKING_STATUS_DB_TO_APP[occ.status] ?? "requested")) continue;
        await tx.booking.update({
          where: { id: occ.id },
          data: { status: "CANCELLED", cancelReason: reason ?? null, cancelledBy: "customer" },
        });
        if (occ.slot) {
          await tx.bookingSlot.update({
            where: { id: occ.slot.id },
            data: { status: "AVAILABLE", bookingId: null },
          });
        }
        await tx.bookingEvent.create({
          data: { bookingId: occ.id, status: "CANCELLED", actorType: "customer", reason: reason ?? null },
        });
      }
      await tx.recurringBooking.update({ where: { id: recurringId }, data: { status: "CANCELLED" } });

      const full = await tx.recurringBooking.findUnique({
        where: { id: recurringId },
        include: { occurrences: RECURRING_OCCURRENCES, serviceItem: true },
      });
      return { row: full as unknown as PrismaRecurringRow, worker: recurring.worker };
    });

    if (!result) return null;
    const first = result.row.occurrences[0];
    if (first) {
      const workerLocale = (result.worker.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
      await pushNotification(
        bookingNotification(toDomainBooking(first), "customer-cancelled"),
        {
          name: result.worker.nameEn,
          email: result.worker.email ?? undefined,
          phone: result.worker.phone,
          locale: workerLocale,
        }
      );
    }
    return toDomainRecurring(result.row);
  } catch (err) {
    console.error("[prisma-repo] cancelRecurringContract failed:", err);
    return null;
  }
}

/**
 * Request SLA (ENHANCEMENT-PLAN §2.2) — the real-mode cron scan: REQUESTED
 * bookings are NUDGED (worker) once past BOOKING_SLA_NUDGE_HOURS and
 * AUTO-EXPIRED past BOOKING_SLA_EXPIRE_HOURS. The nudge stamps
 * Booking.lastSlaNudgeAt with a CAS (the lastReminderSent pattern) so
 * overlapping cron invocations can never double-nudge. Each expiry runs in
 * its own $transaction: CAS status REQUESTED→CANCELLED, the slot frees back
 * to AVAILABLE (rule 3), a SYSTEM audit event is appended, and the customer
 * is told the request expired — dispatched AFTER the tx, per the repo's
 * row-lock rule. Returns the same RequestSlaRun shape as the demo adapter.
 */
export async function prismaRunRequestSla(now = new Date()): Promise<RequestSlaRun> {
  const prisma = getPrisma();
  const nudgeCutoff = new Date(now.getTime() - BOOKING_SLA_NUDGE_HOURS * 60 * 60 * 1000);
  const expireCutoff = new Date(now.getTime() - BOOKING_SLA_EXPIRE_HOURS * 60 * 60 * 1000);
  let nudged = 0;
  let expired = 0;
  const expiredNumbers: string[] = [];

  // Same shape as prismaCancelBooking's post-tx read (events for the domain
  // mapper, serviceItem + payment for the email context, worker for addressing,
  // customer for the recipient's preferred language).
  const include = {
    events: { orderBy: { createdAt: "asc" as const } },
    serviceItem: true,
    payment: { include: { invoice: true } },
    worker: { select: { nameEn: true, email: true, phone: true, languages: true } },
    customer: { select: { locale: true } },
  } as const;

  // Nudge — CAS on the null lastSlaNudgeAt column: a concurrent cron run
  // loses the claim and is counted as skipped.
  const nudgeRows = await prisma.booking.findMany({
    where: { status: "REQUESTED", createdAt: { lt: nudgeCutoff }, lastSlaNudgeAt: null },
    include,
  });
  for (const row of nudgeRows) {
    const claimed = await prisma.booking.updateMany({
      where: { id: row.id, lastSlaNudgeAt: null },
      data: { lastSlaNudgeAt: now },
    });
    if (claimed.count === 0) continue;
    nudged += 1;
    const workerLocale =
      (row.worker?.languages as { code?: string }[] | null)?.[0]?.code === "ar" ? "ar" : "en";
    await pushNotification(
      bookingNotification(toDomainBooking(row), "worker-request-nudge"),
      row.worker?.email
        ? { name: row.worker.nameEn, email: row.worker.email, phone: row.worker.phone, locale: workerLocale }
        : undefined
    );
  }

  // Expire — each stale request flips to CANCELLED inside its own tx. The
  // scan adds slot so the tx can free it (rule 3); the post-tx read below
  // stays on the base include.
  const expireRows = await prisma.booking.findMany({
    where: { status: "REQUESTED", createdAt: { lt: expireCutoff } },
    include: { ...include, slot: true },
  });
  for (const row of expireRows) {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: row.id, status: "REQUESTED" },
        data: {
          status: "CANCELLED",
          cancelReason: "Request auto-expired — no worker response within the SLA window",
          cancelledBy: "system",
        },
      });
      if (updated.count === 0) return null;
      if (row.slot) {
        await tx.bookingSlot.updateMany({
          where: { id: row.slot.id, bookingId: row.id },
          data: { status: "AVAILABLE", bookingId: null },
        });
      }
      await tx.bookingEvent.create({
        data: {
          bookingId: row.id,
          status: "CANCELLED",
          actorType: "system",
          reason: "Request auto-expired — no worker response within the SLA window",
        },
      });
      return tx.booking.findUnique({ where: { id: row.id }, include });
    });
    if (!result) continue;
    expired += 1;
    expiredNumbers.push(result.number);
    await pushNotification(
      bookingNotification(toDomainBooking(result), "customer-request-expired"),
      result.customerEmail
        ? {
            name: result.customerName,
            email: result.customerEmail,
            phone: result.customerPhone,
            // The customer's preferred language (User.locale) — not always EN.
            locale: result.customer?.locale === "ar" ? "ar" : "en",
          }
        : undefined
    );
  }

  return { nudged, expired, scanned: nudgeRows.length + expireRows.length, expiredNumbers };
}

/* ────────────────────────────────────────────────────────────────────────────
 * §LEBANON — MANUAL (OMT/WHISH) PAYMENTS + PAID UPGRADES (real mode)
 * docs/PAYMENTS.md §manual methods · docs/BUSINESS-MODEL.md §5.1
 * ────────────────────────────────────────────────────────────────────────────
 * OMT/Whish are MANUAL methods: the customer pays offline with the reference
 * the instructions page shows, and the ADMIN confirms receipt from the /admin
 * pending-payments card. The confirm runs the SAME paths a provider webhook
 * would have (confirmBookingPayment / confirmCampaignPayment) or the purchase
 * confirm below — flipping the capability the worker bought. Everything rides
 * Payment rows: method OMT/WHISH + status PENDING + providerRef (the minted
 * reference) + metadata.scope for the paid-upgrade kinds.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every PENDING manual (OMT/Whish) payment with a minted reference — the rows
 * the /admin pending-payments card lists (booking deposits, campaign
 * purchases, and the paid upgrades: subscription renewal / verification /
 * featured / emergency). Oldest first.
 */
export async function prismaGetPendingManualPayments(): Promise<PendingManualPayment[]> {
  const prisma = getPrisma();
  const rows = await prisma.payment.findMany({
    where: { method: { in: ["OMT", "WHISH"] }, status: "PENDING", providerRef: { not: null } },
    include: { booking: { include: { serviceItem: true } } },
    orderBy: { createdAt: "asc" },
  });
  const out: PendingManualPayment[] = [];
  for (const row of rows) {
    const method = row.method === "OMT" ? "omt" : "whish";
    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    // Booking deposit (M3) — the booking's own row carries the label.
    if (row.booking) {
      out.push({
        id: row.id,
        scope: "booking",
        entityId: row.booking.id,
        // The label localizes via the booking's bilingual catalog serviceItem
        // (nameAr in the Arabic card row — the free-text jobTitle is a
        // single-locale fallback, same rule as the email Service row).
        labelEn: `${row.booking.number} — ${row.booking.serviceItem?.nameEn ?? row.booking.jobTitle}`,
        labelAr: `${row.booking.number} — ${row.booking.serviceItem?.nameAr ?? row.booking.jobTitle}`,
        amount: row.amount,
        currency: row.currency,
        method,
        reference: row.providerRef!,
        createdAt: row.createdAt.toISOString(),
      });
      continue;
    }

    // Campaign purchase (self-serve ads) — keyed by advertisementId → campaign
    // (the same key prismaGetCampaignPayment resolves; metadata.campaignId is
    // the fallback for rows minted before the key convention settled).
    const campaignId =
      typeof meta.campaignId === "string" ? meta.campaignId : row.advertisementId;
    if (campaignId) {
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: { ads: { take: 1, orderBy: { createdAt: "asc" as const } } },
      });
      if (campaign) {
        out.push({
          id: row.id,
          scope: "campaign",
          entityId: campaign.id,
          labelEn: `${campaign.nameEn} — ${campaign.ads[0]?.placement ?? "ad purchase"}`,
          labelAr: `${campaign.nameAr} — ${campaign.ads[0]?.placement ?? "ad purchase"}`,
          amount: row.amount,
          currency: row.currency,
          method,
          reference: row.providerRef!,
          createdAt: row.createdAt.toISOString(),
        });
        continue;
      }
    }

    // Paid upgrade (subscription renewal / verification / featured / emergency)
    // — the Payment carries the worker link + metadata.scope.
    if (row.workerId) {
      const scope = typeof meta.scope === "string" ? meta.scope : "subscription";
      if (!["subscription", "verification", "featured", "emergency"].includes(scope)) continue;
      const worker = await prisma.worker.findUnique({
        where: { id: row.workerId },
        select: { nameEn: true, nameAr: true },
      });
      if (!worker) continue;
      const label = purchaseLabel(scope as PurchaseScope, worker.nameEn, worker.nameAr, meta);
      out.push({
        id: row.id,
        scope: scope as PurchaseScope,
        entityId: row.id,
        labelEn: label.en,
        labelAr: label.ar,
        amount: row.amount,
        currency: row.currency,
        method,
        reference: row.providerRef!,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }
  return out;
}

/** Localized label for a paid-upgrade payment (mirrors the demo's
 * purchaseDescription, prisma-side: the metadata is the only context). */
function purchaseLabel(
  scope: PurchaseScope,
  nameEn: string,
  nameAr: string,
  meta: Record<string, unknown>
): { en: string; ar: string } {
  switch (scope) {
    case "subscription":
      return {
        en: `${nameEn} — ${String(meta.plan ?? "professional")} subscription renewal (${String(meta.period ?? "monthly")})`,
        ar: `${nameAr} — تجديد اشتراك ${String(meta.plan ?? "professional")} (${String(meta.period ?? "monthly")})`,
      };
    case "verification":
      return {
        en: `${nameEn} — ${meta.tier === "professional" ? "Professional" : "Basic"} verification`,
        ar: `${nameAr} — توثيق ${meta.tier === "professional" ? "احترافي" : "أساسي"}`,
      };
    case "featured":
      return { en: `${nameEn} — Featured slot`, ar: `${nameAr} — بطاقة مميزة` };
    case "emergency":
      return { en: `${nameEn} — Emergency marker`, ar: `${nameAr} — علامة طوارئ` };
  }
}

/**
 * Mint a manual (OMT/Whish) checkout for a paid upgrade — the prisma twin of
 * demoCreatePurchaseCheckout: a PENDING Payment row (userId = the worker's
 * user, workerId set, metadata.scope + option stamps) + the signed
 * instructions URL. The capability flips only when the admin confirms
 * (prismaConfirmPurchase). Returns null on an unknown worker / invalid option
 * / provider failure (the PENDING row stays for the admin card to see).
 */
export async function prismaCreatePurchaseCheckout(input: {
  workerSlug: string;
  scope: PurchaseScope;
  plan?: SubscriptionPlan;
  period?: BillingPeriod;
  tier?: VerificationTier;
  method: "OMT" | "WHISH";
}): Promise<{ url: string } | null> {
  const prisma = getPrisma();
  const amount = purchaseAmountMinor(input.scope, input.plan, input.period, input.tier);
  if (amount === null) return null;
  const worker = await prisma.worker.findUnique({
    where: { slug: input.workerSlug },
    include: { user: { select: { email: true } } },
  });
  if (!worker) return null;

  // No undefined values — Prisma's InputJsonValue rejects them, and the JSON
  // column should only carry the options the purchase actually has.
  const meta = {
    scope: input.scope,
    workerSlug: input.workerSlug,
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.period ? { period: input.period } : {}),
    ...(input.tier ? { tier: input.tier } : {}),
  };
  try {
    const payment = await prisma.payment.create({
      data: {
        userId: worker.userId,
        workerId: worker.id,
        amount,
        currency: "USD",
        method: input.method,
        status: "PENDING",
        metadata: meta,
      },
    });
    const provider = getPaymentProvider(input.method);
    const result = await provider.createCheckout({
      paymentId: payment.id,
      amountMinor: amount,
      currency: "USD",
      customerEmail: worker.user?.email ?? undefined,
      description: `${worker.nameEn} — ${input.scope} upgrade`,
      successUrl: `${origin()}/dashboard?purchased=1`,
      cancelUrl: `${origin()}/dashboard`,
    });
    const claimed = await prisma.payment.updateMany({
      where: { id: payment.id, providerRef: null },
      data: { providerRef: result.providerRef, metadata: { ...meta, checkoutUrl: result.url } },
    });
    if (claimed.count === 0) return null;
    return { url: result.url };
  } catch (err) {
    console.error("[prisma-repo] createPurchaseCheckout failed:", err);
    return null;
  }
}

function purchaseAmountMinor(
  scope: PurchaseScope,
  plan?: SubscriptionPlan,
  period?: BillingPeriod,
  tier?: VerificationTier
): number | null {
  if (scope === "subscription") return plan ? planPrice(plan, period ?? "monthly") * 100 : null;
  if (scope === "verification") return tier ? PURCHASE_PRICES.verification[tier] : null;
  if (scope === "featured") return PURCHASE_PRICES.featured;
  if (scope === "emergency") return PURCHASE_PRICES.emergency;
  return null;
}

/**
 * Admin confirm — the manual twin of a provider webhook for a paid upgrade:
 * the customer paid offline with the reference, the admin's confirm flips the
 * payment PAID (CAS, idempotent) and activates the purchased capability on
 * the worker's row (subscription renewal / verified badge / featured slot /
 * emergency marker), minting the renewal invoice for subscriptions. Notifies
 * the worker after the flip. Returns false when the payment is unknown or
 * the flip lost the CAS and the payment isn't already PAID.
 */
export async function prismaConfirmPurchase(
  paymentId: string,
  providerRef: string,
  opts: { by?: string; byId?: string } = {}
): Promise<boolean> {
  const prisma = getPrisma();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { subscription: { include: { worker: { include: { user: true } } } } },
  });
  if (!payment) return false;
  if (payment.status === "PAID") return true; // idempotent
  if (payment.status !== "PENDING") return false;

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const scope = (typeof meta.scope === "string" ? meta.scope : "subscription") as PurchaseScope;
  const plan = meta.plan as SubscriptionPlan | undefined;
  const period = (meta.period as BillingPeriod | undefined) ?? "monthly";

  const flipped = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "PAID", providerRef, paidAt: new Date() },
  });
  if (flipped.count === 0) {
    const fresh = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    return fresh?.status === "PAID";
  }

  if (!payment.workerId) return true;
  const worker = await prisma.worker.findUnique({
    where: { id: payment.workerId },
    include: { subscription: true, user: { select: { email: true, locale: true } } },
  });

  // §Lebanon — audit the manual (OMT/Whish) upgrade confirm with the ACTING
  // ADMIN as actor (threaded via opts.by), the real-mode twin of the demo
  // PURCHASE_CONFIRMED entry so verification / featured / emergency purchases
  // appear in the feed (demo/prisma parity).
  const actor = opts.by ?? "Platform Admin";
  await logAdminActivity({
    code: ACTION_CODES.PURCHASE_CONFIRMED,
    actionEn: `${actor} confirmed ${scope} purchase for ${worker?.nameEn ?? "Worker"} (${payment.id})`,
    actionAr: `${actor} أكّد شراء ${scope} للعامل ${worker?.nameAr ?? "العامل"} (${payment.id})`,
    actor,
    ...(opts.byId ? { actorId: opts.byId } : {}),
    type: "payment",
  });

  const notify = (type: "subscription" | "verification" | "system", titleEn: string, titleAr: string, bodyEn: string, bodyAr: string) =>
    pushNotification(
      { type, titleEn, titleAr, bodyEn, bodyAr, href: "/dashboard" },
      worker?.user?.email
        ? { name: worker.nameEn, email: worker.user.email, locale: worker.user.locale === "ar" ? "ar" : "en" }
        : undefined
    );

  switch (scope) {
    case "subscription": {
      if (!worker?.subscription) break;
      const p: SubscriptionPlan = plan ?? (PLAN_MAP[worker.subscription.plan] ?? "professional");
      const planDb = p.toUpperCase() as $Enums.SubscriptionPlan;
      const now = new Date();
      const base = worker.subscription.expiresAt > now ? worker.subscription.expiresAt : now;
      const expiresAt = addMonths(base.toISOString(), period === "annual" ? 12 : 1);
      await prisma.subscription.update({
        where: { id: worker.subscription.id },
        data: { plan: planDb, status: "ACTIVE", price: planPrice(p, period) * 100, periodDays: period === "annual" ? 365 : 30, expiresAt: new Date(expiresAt) },
      });
      // Mint the renewal invoice (WA-YYYY-NNNNN — the same sequence as booking
      // receipts: per-year count + formatInvoiceNumber) so the purchase has a
      // receipt row.
      if (worker.userId) {
        const year = new Date().getFullYear();
        const count = await prisma.invoice.count({
          where: { number: { startsWith: `WA-${year}-` } },
        });
        await prisma.invoice.create({
          data: {
            number: formatInvoiceNumber(year, count + 1),
            userId: worker.userId,
            paymentId: payment.id,
            amount: payment.amount,
            currency: "USD",
            status: "PAID",
            paidAt: new Date(),
          },
        });
      }
      await notify(
        "subscription",
        `Subscription renewed — ${p}`,
        `تم تجديد الاشتراك — ${p}`,
        `${worker.nameEn}: your ${p} plan is active until ${expiresAt.slice(0, 10)}.`,
        `${worker.nameAr}: خطتك ${p} نشطة حتى ${expiresAt.slice(0, 10)}.`
      );
      break;
    }
    case "verification": {
      if (worker) {
        await prisma.worker.update({ where: { id: worker.id }, data: { verified: true, verifiedAt: new Date() } });
      }
      await notify(
        "verification",
        "Profile verified ✓",
        "تم توثيق الملف ✓",
        `${worker?.nameEn ?? "Your profile"} now shows the Verified badge.`,
        `${worker?.nameAr ?? "ملفك"} يعرض الآن شارة التوثيق.`
      );
      break;
    }
    case "featured": {
      if (worker) await prisma.worker.update({ where: { id: worker.id }, data: { isFeatured: true } });
      await notify(
        "system",
        "Featured slot active",
        "البطاقة المميزة نشطة",
        `${worker?.nameEn ?? "Your profile"} is featured on the homepage for 30 days.`,
        `${worker?.nameAr ?? "ملفك"} مميز في الصفحة الرئيسية لمدة 30 يومًا.`
      );
      break;
    }
    case "emergency": {
      if (worker) await prisma.worker.update({ where: { id: worker.id }, data: { emergency: true } });
      await notify(
        "system",
        "Emergency marker active",
        "علامة الطوارئ نشطة",
        `${worker?.nameEn ?? "Your profile"} can now be booked for urgent 24/7 jobs.`,
        `${worker?.nameAr ?? "ملفك"} متاح الآن لحجوزات الطوارئ على مدار الساعة.`
      );
      break;
    }
  }
  return true;
}
