import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  filtersToWhere,
  matchesAdPlacement,
  matchesAdTargeting,
  PROFILE_INCLUDE,
  rowToSlot,
  sqlOrderBy,
  toDomainBooking,
  toDomainBookingMessage,
  toDomainCategory,
  toDomainCity,
  toDomainInvoice,
  toDomainQuoteRequest,
  toDomainRecurring,
  toDomainWorker,
  type PrismaBookingRow,
  type PrismaBookingSlotRow,
  type PrismaBookingMessageRow,
  type PrismaInvoiceRow,
  type PrismaQuoteRequestRow,
  type PrismaRecurringRow,
} from "../src/lib/data/prisma-repo";
import {
  BOOKING_CANCEL_REFUND_WINDOW_MS,
  bookingCancelRefundDue,
  emptyBookingFunnelCounts,
  formatInvoiceNumber,
  formatQuoteNumber,
  tallyBookingFunnel,
  type BookingStatus,
} from "../src/lib/data/types";

/**
 * Mapper + filter-builder unit tests for the production data layer
 * (src/lib/data/prisma-repo.ts). Fixture rows only — no database needed.
 * Exercises the row→domain mapping and SQL filter translation the repo seam
 * uses when realDataEnabled() (DEMO_MODE=false + DATABASE_URL).
 */
type WorkerRow = Prisma.WorkerGetPayload<{ include: typeof PROFILE_INCLUDE }>;
type CategoryRow = Prisma.CategoryGetPayload<{ include: { _count: { select: { workers: true } } } }>;
type CityRow = Prisma.CityGetPayload<{ include: { areas: true } }>;

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

function makeWorkerRow(overrides: Partial<WorkerRow> = {}): WorkerRow {
  const base: WorkerRow = {
    id: "w1",
    userId: null,
    slug: "khaled-al-harbi-plumbing",
    nameEn: "Khaled Al-Harbi",
    nameAr: "خالد الحربي",
    taglineEn: "Plumbing expert",
    taglineAr: "خبير سباكة",
    bioEn: "Bio",
    bioAr: "نبذة",
    categoryId: "cat1",
    cityId: "city1",
    areaId: "area1",
    lat: 24.7,
    lng: 46.7,
    phone: "+966 55 123 4871",
    whatsapp: "+966 55 123 4871",
    email: "khaled@plumbfix.sa",
    website: "plumbfix.sa",
    socials: null,
    priceMin: 8000, // minor units (×100) — mapper divides back to 80
    priceMax: 95000,
    hourlyRate: null,
    yearsExp: 12,
    languages: [{ code: "ar", nameEn: "Arabic", nameAr: "العربية" }],
    rating: 4.9,
    reviewCount: 132,
    viewCount: 1200,
    leadCount: 34,
    verified: true,
    premium: true,
    emergency: true,
    available: true,
    hue: 25,
    completion: 100,
    status: "ACTIVE",
    isFeatured: true,
    verifiedAt: new Date("2026-01-01"),
    joinedAt: new Date("2019-01-15"),
    deletedAt: null,
    createdAt: new Date("2019-01-15"),
    updatedAt: new Date("2026-01-01"),
    category: {
      id: "cat1",
      slug: "plumbing",
      nameEn: "Plumbing",
      nameAr: "سباكة",
      icon: "Wrench",
      taglineEn: "Leaks, pipes, water heaters",
      taglineAr: "تسريبات، مواسير، سخانات",
      hue: 205,
      parentId: null,
      sortOrder: 0,
      isFeatured: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    city: {
      id: "city1",
      slug: "riyadh",
      nameEn: "Riyadh",
      nameAr: "الرياض",
      countryEn: "Saudi Arabia",
      countryAr: "السعودية",
      currency: "SAR",
      lat: 24.7136,
      lng: 46.6753,
      isActive: true,
    },
    area: { id: "area1", slug: "al-olaya", nameEn: "Al Olaya", nameAr: "العليا", cityId: "city1" },
    subscription: {
      id: "sub1",
      workerId: "w1",
      plan: "PREMIUM",
      status: "ACTIVE",
      price: 11900,
      currency: "USD",
      periodDays: 30,
      autoRenew: true,
      startedAt: new Date("2026-01-01"),
      expiresAt: inDays(30),
      canceledAt: null,
      lastReminderSent: 0,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
    services: [
      {
        id: "s1",
        workerId: "w1",
        nameEn: "Leak repair",
        nameAr: "إصلاح تسرب",
        descriptionEn: null,
        descriptionAr: null,
        price: 150,
        unit: "job",
        durationMin: null,
        sortOrder: 0,
      },
    ],
    certifications: [
      {
        id: "c1",
        workerId: "w1",
        nameEn: "Plumbing license",
        nameAr: "رخصة سباكة",
        issuerEn: "City",
        issuerAr: "البلدية",
        year: 2015,
        fileUrl: null,
        verified: true,
      },
    ],
    hours: [{ id: "h1", workerId: "w1", day: 1, open: "08:00", close: "18:00", closed: false }],
    portfolio: [
      {
        id: "p1",
        workerId: "w1",
        titleEn: "Villa plumbing",
        titleAr: "سباكة فيلا",
        descriptionEn: null,
        descriptionAr: null,
        imageUrl: "x.jpg",
        category: null,
        tags: [],
        sortOrder: 0,
      },
    ],
    reviews: [
      {
        id: "r1",
        workerId: "w1",
        authorId: "u1",
        author: { name: "Sara Customer" },
        rating: 5,
        title: null,
        textEn: "Great work",
        textAr: "عمل رائع",
        status: "APPROVED",
        verifiedPurchase: true,
        helpfulCount: 2,
        aiFlags: null,
        moderatedById: null,
        moderatedAt: null,
        createdAt: new Date("2026-06-01"),
      },
    ],
  };
  return { ...base, ...overrides };
}

function makeCategoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  const base: CategoryRow = {
    id: "cat1",
    slug: "plumbing",
    nameEn: "Plumbing",
    nameAr: "سباكة",
    icon: "Wrench",
    taglineEn: "Leaks, pipes, water heaters",
    taglineAr: "تسريبات، مواسير، سخانات",
    hue: 205,
    parentId: null,
    sortOrder: 0,
    isFeatured: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { workers: 12 },
  };
  return { ...base, ...overrides };
}

function makeCityRow(overrides: Partial<CityRow> = {}): CityRow {
  const base: CityRow = {
    id: "city1",
    slug: "riyadh",
    nameEn: "Riyadh",
    nameAr: "الرياض",
    countryEn: "Saudi Arabia",
    countryAr: "السعودية",
    currency: "SAR",
    lat: 24.7136,
    lng: 46.6753,
    isActive: true,
    areas: [
      { id: "area1", slug: "al-olaya", nameEn: "Al Olaya", nameAr: "العليا", cityId: "city1" },
      { id: "area2", slug: "al-malqa", nameEn: "Al Malqa", nameAr: "الملقا", cityId: "city1" },
    ],
  };
  return { ...base, ...overrides };
}

describe("toDomainWorker (Prisma row → domain)", () => {
  it("maps a fully verified worker with an active subscription", () => {
    const w = toDomainWorker(makeWorkerRow());

    expect(w.id).toBe("w1");
    expect(w.slug).toBe("khaled-al-harbi-plumbing");
    expect(w.categorySlug).toBe("plumbing");
    expect(w.citySlug).toBe("riyadh");
    expect(w.areaSlug).toBe("al-olaya");
    expect(w.verification).toBe("verified");
    expect(w.featured).toBe(true);
    expect(w.premium).toBe(true);
    expect(w.emergency).toBe(true);

    // Subscription: minor units (×100) back to major, status derived from expiry.
    expect(w.subscription.plan).toBe("premium");
    expect(w.subscription.price).toBe(119);
    expect(w.subscription.status).toBe("active");
    expect(w.subscription.invoiceNo).toBe("sub1");

    expect(w.currency).toBe("SAR");

    // All money is minor units in the DB — divided back to major for the UI.
    expect(w.priceMin).toBe(80);
    expect(w.priceMax).toBe(950);

    expect(w.joinedYear).toBe(2019);
    expect(w.views).toBe(1200);
    expect(w.leads).toBe(34);
    expect(w.hue).toBe(25);
    expect(w.completion).toBe(100);

    // Relations.
    expect(w.services[0].nameEn).toBe("Leak repair");
    expect(w.services[0].unit).toBe("job");
    expect(w.certifications[0].year).toBe(2015);
    expect(w.hours[0].open).toBe("08:00");
    expect(w.gallery[0].titleEn).toBe("Villa plumbing");
    expect(w.gallery[0].hue).toBe(25);
    expect(w.reviews[0].author).toBe("Sara Customer");
    expect(w.reviews[0].verifiedPurchase).toBe(true);
    expect(w.languages[0].code).toBe("ar");
    expect(w.socials).toEqual([]);
  });

  it("maps verification from status: PENDING_VERIFICATION → pending, ACTIVE unverified → rejected", () => {
    const pending = toDomainWorker(
      makeWorkerRow({ verified: false, status: "PENDING_VERIFICATION", verifiedAt: null })
    );
    expect(pending.verification).toBe("pending");

    const rejected = toDomainWorker(makeWorkerRow({ verified: false, status: "ACTIVE", verifiedAt: null }));
    expect(rejected.verification).toBe("rejected");
  });

  it("derives subscription status from the expiry date (not the stored enum)", () => {
    const expired = toDomainWorker(
      makeWorkerRow({
        subscription: {
          ...makeWorkerRow().subscription!,
          status: "ACTIVE",
          expiresAt: inDays(-3), // stored as ACTIVE but actually past due
        },
      })
    );
    expect(expired.subscription.status).toBe("expired");
  });

  it("falls back to an expired subscription when the worker has none", () => {
    const w = toDomainWorker(makeWorkerRow({ subscription: null }));
    expect(w.subscription.status).toBe("expired");
    expect(w.subscription.price).toBe(0);
  });

  it("falls back to city coordinates when lat/lng are null", () => {
    const w = toDomainWorker(makeWorkerRow({ lat: null, lng: null }));
    expect(w.lat).toBe(24.7136);
    expect(w.lng).toBe(46.6753);
  });

  it("handles null-ish optional JSON and text columns gracefully", () => {
    const w = toDomainWorker(
      makeWorkerRow({ socials: null, taglineEn: null, taglineAr: null, email: null, website: null })
    );
    expect(w.taglineEn).toBe("");
    expect(w.email).toBe("");
    expect(w.website).toBe("");
    expect(w.socials).toEqual([]);
  });
});

describe("filtersToWhere (SearchFilters → Prisma where)", () => {
  it("excludes expired subscriptions unless includeExpired is set", () => {
    expect(filtersToWhere({}).subscription).toEqual({ is: { status: { not: "EXPIRED" } } });
    expect(filtersToWhere({ includeExpired: true }).subscription).toBeUndefined();
  });

  it("narrows the subscription filter to fee-waived (Enterprise) plans", () => {
    // Both guards merge into one relation filter when active together.
    expect(filtersToWhere({ feeWaivedOnly: true }).subscription).toEqual({
      is: { status: { not: "EXPIRED" }, plan: { in: ["ENTERPRISE"] } },
    });
    // includeExpired drops the status guard but keeps the plan narrow.
    expect(filtersToWhere({ includeExpired: true, feeWaivedOnly: true }).subscription).toEqual({
      is: { plan: { in: ["ENTERPRISE"] } },
    });
    expect(filtersToWhere({}).subscription).not.toHaveProperty("is.plan");
  });

  it("translates the SQL-filterable filters", () => {
    const where = filtersToWhere({
      category: "plumbing",
      city: "riyadh",
      area: "al-olaya",
      minRating: 4.5,
      priceMin: 100,
      priceMax: 500,
      minExp: 5,
      verifiedOnly: true,
      featuredOnly: true,
      emergencyOnly: true,
      availableNow: true,
    });
    expect(where.category).toEqual({ slug: "plumbing" });
    expect(where.city).toEqual({ slug: "riyadh" });
    expect(where.area).toEqual({ slug: "al-olaya" });
    expect(where.rating).toEqual({ gte: 4.5 });
    expect(where.priceMax).toEqual({ gte: 100 });
    expect(where.priceMin).toEqual({ lte: 500 });
    expect(where.yearsExp).toEqual({ gte: 5 });
    expect(where.verified).toBe(true);
    expect(where.isFeatured).toBe(true);
    expect(where.emergency).toBe(true);
    expect(where.available).toBe(true);
  });

  it("builds an OR search across names, category, city and services", () => {
    const where = filtersToWhere({ query: "  سباك  " });
    expect(Array.isArray(where.OR)).toBe(true);
    const or = where.OR as object[];
    expect(or).toContainEqual({ nameAr: { contains: "سباك", mode: "insensitive" } });
    expect(or).toContainEqual({
      services: { some: { OR: [{ nameEn: { contains: "سباك", mode: "insensitive" } }, { nameAr: { contains: "سباك", mode: "insensitive" } }] } },
    });
    // Whitespace-trimmed query, and no OR when empty.
    expect(filtersToWhere({ query: "   " }).OR).toBeUndefined();
  });

  it("always scopes to non-deleted, non-blocked workers", () => {
    const where = filtersToWhere({});
    expect(where.deletedAt).toBeNull();
    expect(where.status).toEqual({ not: "BLOCKED" });
  });
});

describe("sqlOrderBy (sort → Prisma orderBy)", () => {
  it("maps each sort to its column", () => {
    expect(sqlOrderBy("rating")).toEqual([{ rating: "desc" }]);
    expect(sqlOrderBy("reviews")).toEqual([{ reviewCount: "desc" }]);
    expect(sqlOrderBy("priceLow")).toEqual([{ priceMin: "asc" }]);
    expect(sqlOrderBy("priceHigh")).toEqual([{ priceMin: "desc" }]);
    expect(sqlOrderBy("experience")).toEqual([{ yearsExp: "desc" }]);
    // relevance + nearest (no city) fall back to the rating proxy.
    expect(sqlOrderBy("relevance")).toEqual([{ rating: "desc" }]);
    expect(sqlOrderBy("nearest")).toEqual([{ rating: "desc" }]);
  });
});

describe("toDomainCategory (Prisma row → domain)", () => {
  it("maps a seeded category and resolves the profession from the demo catalog", () => {
    const c = toDomainCategory(makeCategoryRow());
    expect(c.slug).toBe("plumbing");
    expect(c.professionEn).toBe("plumber");
    expect(c.professionAr).toBe("سباك");
    expect(c.workerCount).toBe(12);
    expect(c.icon).toBe("Wrench");
  });

  it("falls back to the name when the slug is unknown to the demo catalog", () => {
    const c = toDomainCategory(makeCategoryRow({ slug: "ai-ml-services", nameEn: "AI & ML", nameAr: "ذكاء اصطناعي" }));
    expect(c.professionEn).toBe("ai & ml");
    expect(c.professionAr).toBe("ذكاء اصطناعي");
  });
});

describe("toDomainCity (Prisma row → domain)", () => {
  it("maps a seeded city with its areas", () => {
    const c = toDomainCity(makeCityRow());
    expect(c.slug).toBe("riyadh");
    expect(c.nameEn).toBe("Riyadh");
    expect(c.nameAr).toBe("الرياض");
    expect(c.countryEn).toBe("Saudi Arabia");
    expect(c.currency).toBe("SAR");
    expect(c.lat).toBe(24.7136);
    expect(c.lng).toBe(46.6753);
    expect(c.areas).toEqual([
      { slug: "al-olaya", nameEn: "Al Olaya", nameAr: "العليا" },
      { slug: "al-malqa", nameEn: "Al Malqa", nameAr: "الملقا" },
    ]);
  });

  it("casts the currency to a domain CurrencyCode and defaults missing values", () => {
    const c = toDomainCity(makeCityRow({ currency: "AED", nameEn: "Dubai", slug: "dubai" }));
    expect(c.currency).toBe("AED");
    const noCurr = toDomainCity(makeCityRow({ currency: "" }));
    expect(noCurr.currency).toBe("SAR");
    expect(noCurr.areas.length).toBe(2);
  });
});

describe("booking mappers (W2 — Prisma row → domain)", () => {
  const iso = "2026-08-10T09:00:00.000Z";

  function makeSlotRow(overrides: Partial<PrismaBookingSlotRow> = {}): PrismaBookingSlotRow {
    return {
      id: "slot-1",
      workerId: "w1",
      startAt: new Date(iso),
      endAt: new Date("2026-08-10T10:00:00.000Z"),
      status: "AVAILABLE",
      note: null,
      bookingId: null,
      ...overrides,
    };
  }

  function makeBookingRow(overrides: Partial<PrismaBookingRow> = {}): PrismaBookingRow {
    return {
      id: "bk-2",
      number: "BK-1002",
      workerId: "w1",
      customerId: null,
      customerName: "Noor E.",
      customerPhone: "+966 55 000 0000",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe",
      note: "Under the kitchen sink",
      startAt: new Date(iso),
      endAt: new Date("2026-08-10T10:00:00.000Z"),
      status: "CONFIRMED",
      quote: 8000, // minor units
      deposit: null,
      platformFee: 560, // M5 take rate — minor units, mapped as-is
      platformFeeRateBps: 700,
      currency: "SAR",
      paymentId: null,
      recurringBookingId: null,
      events: [
        { status: "REQUESTED", actorType: "customer", reason: null, createdAt: new Date(iso) },
        { status: "CONFIRMED", actorType: "worker", reason: null, createdAt: new Date("2026-08-10T09:05:00.000Z") },
      ],
      ...overrides,
    };
  }

  it("maps a slot row: status enum lowercased, ISO datetimes, optionals", () => {
    const s = rowToSlot(
      makeSlotRow({ status: "RESERVED", bookingId: "bk-2", note: "Site visit" })
    );
    expect(s.id).toBe("slot-1");
    expect(s.workerId).toBe("w1");
    expect(s.startAt).toBe(iso);
    expect(s.status).toBe("reserved");
    expect(s.note).toBe("Site visit");
    expect(s.bookingId).toBe("bk-2");
  });

  it("maps every slot status", () => {
    for (const [db, app] of [
      ["AVAILABLE", "available"],
      ["RESERVED", "reserved"],
      ["BOOKED", "booked"],
      ["BLOCKED", "blocked"],
    ] as const) {
      expect(rowToSlot(makeSlotRow({ status: db })).status).toBe(app);
    }
  });

  it("maps a booking row: status, minor-unit money as-is, events in order", () => {
    const b = toDomainBooking(makeBookingRow());
    expect(b.id).toBe("bk-2");
    expect(b.number).toBe("BK-1002");
    expect(b.status).toBe("confirmed");
    // quote/deposit are minor units in the DB AND the domain — no /100 here
    // (unlike worker prices, which divide back to major units).
    expect(b.quote).toBe(8000);
    expect(b.deposit).toBeUndefined();
    // M5 — the platform-fee snapshot + audit rate map as-is (the customer row
    // derives net = quote − fee from these).
    expect(b.platformFee).toBe(560);
    expect(b.platformFeeRateBps).toBe(700);
    expect(b.currency).toBe("SAR");
    expect(b.events.map((e) => e.status)).toEqual(["requested", "confirmed"]);
    expect(b.events[0]?.actorType).toBe("customer");
    expect(b.events[1]?.time).toBe("2026-08-10T09:05:00.000Z");
    expect(b.serviceItem).toBeUndefined();
  });

  it("maps the service item when present (major-unit price, like toDomainWorker)", () => {
    const b = toDomainBooking(
      makeBookingRow({
        serviceItem: { nameEn: "Leak repair", nameAr: "إصلاح تسرب", price: 150, unit: "hour" },
      })
    );
    expect(b.serviceItem).toEqual({ nameEn: "Leak repair", nameAr: "إصلاح تسرب", price: 150, unit: "hour" });
  });

  it("handles null customerEmail / note / events", () => {
    const b = toDomainBooking(makeBookingRow({ customerEmail: null, note: null, events: [] }));
    expect(b.customerEmail).toBeUndefined();
    expect(b.note).toBeUndefined();
    expect(b.events).toEqual([]);
  });

  it("maps the §2.2 request-SLA nudge stamp (lastSlaNudgeAt → slaNudgeSent)", () => {
    // Never nudged → undefined (the UI shows the plain countdown).
    const fresh = toDomainBooking(makeBookingRow({ lastSlaNudgeAt: null }));
    expect(fresh.slaNudgeSent).toBeUndefined();
    // Nudged → true (the worker dashboard shows the "nudge sent" chip).
    const nudged = toDomainBooking(makeBookingRow({ lastSlaNudgeAt: new Date("2026-08-10T08:00:00.000Z") }));
    expect(nudged.slaNudgeSent).toBe(true);
  });

  it("maps customerId + the M3 invoice from the payment relation", () => {
    const b = toDomainBooking(
      makeBookingRow({
        customerId: "u-customer",
        payment: {
          id: "pay-1",
          amount: 5000,
          status: "PAID",
          invoice: {
            number: "WA-2026-00001",
            amount: 5000,
            currency: "SAR",
            status: "PAID",
            paidAt: new Date("2026-08-10T09:30:00.000Z"),
            createdAt: new Date("2026-08-10T09:30:00.000Z"),
          },
        },
      })
    );
    expect(b.customerId).toBe("u-customer");
    expect(b.invoice).toEqual({
      number: "WA-2026-00001",
      amount: 5000, // minor units, as-is
      currency: "SAR",
      status: "paid",
      date: "2026-08-10T09:30:00.000Z",
    });
    expect(b.paymentStatus).toBe("paid"); // §2.4 — gates the admin Refund-deposit action
  });

  it("maps a VOIDed invoice (refunded deposit) as voided so the row strikes it through", () => {
    const b = toDomainBooking(
      makeBookingRow({
        customerId: "u-customer",
        payment: {
          id: "pay-3",
          amount: 4000,
          status: "REFUNDED",
          invoice: {
            number: "WA-2026-00002",
            amount: 4000,
            currency: "SAR",
            status: "VOID",
            paidAt: new Date("2026-08-10T10:00:00.000Z"),
            createdAt: new Date("2026-08-10T10:00:00.000Z"),
          },
        },
      })
    );
    expect(b.invoice).toMatchObject({ number: "WA-2026-00002", status: "voided" });
    expect(b.paymentStatus).toBe("refunded"); // §2.4 — the refund-deposit button hides
  });

  it("leaves customerId + invoice undefined for guests or unpaid payments", () => {
    const guest = toDomainBooking(makeBookingRow({ customerId: null }));
    expect(guest.customerId).toBeUndefined();
    expect(guest.invoice).toBeUndefined();
    const noInvoice = toDomainBooking(
      makeBookingRow({ customerId: "u-customer", payment: { id: "pay-2", amount: 0, status: "PENDING", invoice: null } })
    );
    expect(noInvoice.invoice).toBeUndefined();
    expect(noInvoice.paymentStatus).toBe("pending");
  });
});

describe("formatInvoiceNumber (M3 invoice numbering)", () => {
  it("formats WA-YYYY-NNNNN with a zero-padded 5-digit sequence", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("WA-2026-00001");
    expect(formatInvoiceNumber(2026, 999)).toBe("WA-2026-00999");
    expect(formatInvoiceNumber(2027, 1)).toBe("WA-2027-00001");
  });
});

describe("formatQuoteNumber (multi-candidate quote numbering)", () => {
  it("formats QR-YYYY-NNNNN with a zero-padded 5-digit sequence", () => {
    expect(formatQuoteNumber(2026, 1)).toBe("QR-2026-00001");
    expect(formatQuoteNumber(2026, 999)).toBe("QR-2026-00999");
    expect(formatQuoteNumber(2027, 1)).toBe("QR-2027-00001");
  });
});

describe("toDomainQuoteRequest (multi-candidate quote mapper)", () => {
  const CREATED = new Date("2026-08-14T06:00:00.000Z");

  function makeQuoteRow(overrides: Partial<PrismaQuoteRequestRow> = {}): PrismaQuoteRequestRow {
    return {
      id: "qr-1",
      number: "QR-2026-00001",
      customerId: "u1",
      customerName: "Noor E.",
      customerPhone: "+966 55 000 0000",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe under the kitchen sink",
      note: null,
      categorySlug: "plumbing",
      citySlug: "riyadh",
      status: "OPEN",
      expiresAt: new Date(CREATED.getTime() + 48 * 60 * 60 * 1000),
      createdAt: CREATED,
      bookings: [],
      ...overrides,
    };
  }

  function makeBidRow(overrides: Partial<PrismaBookingRow> = {}): PrismaBookingRow {
    return {
      id: "bk-q1",
      number: "BK-1002",
      workerId: "w1",
      customerId: "u1",
      customerName: "Noor E.",
      customerPhone: "+966 55 000 0000",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe under the kitchen sink",
      note: null,
      startAt: null, // slot-less bid
      endAt: null,
      status: "QUOTED",
      quote: 25000,
      deposit: null,
      platformFee: null,
      platformFeeRateBps: null,
      currency: "SAR",
      paymentId: null,
      recurringBookingId: null,
      quoteRequestId: "qr-1",
      ...overrides,
    };
  }

  it("maps the job: status/expiry/created, optionals, and its bookings through toDomainBooking", () => {
    const r = toDomainQuoteRequest(
      makeQuoteRow({
        serviceItem: { nameEn: "Leak repair", nameAr: "إصلاح تسرب", price: 150, unit: "job" },
        bookings: [makeBidRow({ status: "QUOTING" }), makeBidRow({ id: "bk-q2", number: "BK-1003", workerId: "w2", quoteRequestId: "qr-1" })],
      })
    );
    expect(r.id).toBe("qr-1");
    expect(r.number).toBe("QR-2026-00001");
    expect(r.status).toBe("open");
    expect(r.customerId).toBe("u1");
    expect(r.serviceItem?.nameEn).toBe("Leak repair");
    expect(r.expiresAt).toBe("2026-08-16T06:00:00.000Z");
    expect(r.bookings.length).toBe(2);
    // Bids map through toDomainBooking: status lowercased, slot-less times →
    // undefined, quoteRequestId stamped.
    expect(r.bookings[0]!.status).toBe("quoting");
    expect(r.bookings[0]!.startAt).toBeUndefined();
    expect(r.bookings[0]!.endAt).toBeUndefined();
    expect(r.bookings[0]!.quoteRequestId).toBe("qr-1");
    expect(r.bookings[1]!.status).toBe("quoted");
  });

  it("maps every QuoteStatus enum", () => {
    for (const [db, app] of [
      ["OPEN", "open"],
      ["QUOTING", "quoting"],
      ["SELECTED", "selected"],
      ["EXPIRED", "expired"],
      ["CANCELLED", "cancelled"],
    ] as const) {
      expect(toDomainQuoteRequest(makeQuoteRow({ status: db })).status).toBe(app);
    }
  });

  it("maps every BookingStatus enum incl. the two new quote statuses", () => {
    for (const [db, app] of [
      ["QUOTING", "quoting"],
      ["QUOTED", "quoted"],
    ] as const) {
      const r = toDomainBooking(makeBidRow({ status: db }));
      expect(r.status).toBe(app);
    }
  });

  it("maps the audit-only MESSAGE status (§2.3 chat audit events)", () => {
    const r = toDomainBooking(makeBidRow({ status: "MESSAGE" }));
    expect(r.status).toBe("message");
    expect(r.events).toEqual([]);
  });

  it("maps a slot-bound winner back to real times", () => {
    const startAt = new Date("2026-08-16T07:00:00.000Z");
    const r = toDomainBooking(
      makeBidRow({ status: "REQUESTED", startAt, endAt: new Date("2026-08-16T08:00:00.000Z") })
    );
    expect(r.status).toBe("requested");
    expect(r.startAt).toBe(startAt.toISOString());
  });
});

describe("tallyBookingFunnel (M4 admin funnel — shared pure tally)", () => {
  const NOW = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  // Creation time = the booking's FIRST event. Window = last 30 days.
  const event = (time: Date) => ({ status: "requested" as const, actorType: "customer", time: time.toISOString() });
  const recent = (status: BookingStatus) => ({ status, events: [event(new Date(NOW - 1000))] });
  const old = (status: BookingStatus) => ({ status, events: [event(new Date(NOW - 31 * DAY))] });

  it("zeroes every status key and returns conversion 0 for an empty input", () => {
    const f = tallyBookingFunnel([], NOW - 30 * DAY);
    expect(f.counts).toEqual(emptyBookingFunnelCounts());
    expect(f.total).toBe(0);
    expect(f.conversionRate).toBe(0);
  });

  it("counts bookings by current status and sums to total", () => {
    const f = tallyBookingFunnel(
      [recent("requested"), recent("confirmed"), recent("cancelled"), recent("completed")],
      NOW - 30 * DAY
    );
    expect(f.counts.requested).toBe(1);
    expect(f.counts.confirmed).toBe(1);
    expect(f.counts.cancelled).toBe(1);
    expect(f.counts.completed).toBe(1);
    expect(f.total).toBe(4);
  });

  it("derives REQUESTED→CONFIRMED conversion from confirmed/inProgress/completed over total", () => {
    const f = tallyBookingFunnel(
      [recent("requested"), recent("confirmed"), recent("inProgress"), recent("declined")],
      NOW - 30 * DAY
    );
    expect(f.conversionRate).toBe(50); // 2 of 4
    const allAccepted = tallyBookingFunnel([recent("completed"), recent("inProgress")], NOW - 30 * DAY);
    expect(allAccepted.conversionRate).toBe(100);
    const none = tallyBookingFunnel([recent("requested"), recent("pendingPayment")], NOW - 30 * DAY);
    expect(none.conversionRate).toBe(0);
  });

  it("respects the window — bookings created before the cutoff are excluded", () => {
    const f = tallyBookingFunnel([old("confirmed"), recent("requested")], NOW - 30 * DAY);
    expect(f.total).toBe(1);
    expect(f.counts.requested).toBe(1);
    expect(f.counts.confirmed).toBe(0);
  });

  it("excludes bookings without a parseable first-event time (NaN-safe)", () => {
    const noEvents = { status: "confirmed" as const, events: [] };
    const badTime = { status: "confirmed" as const, events: [{ ...event(new Date()), time: "not-a-date" }] };
    const f = tallyBookingFunnel([noEvents, badTime, recent("requested")], NOW - 30 * DAY);
    expect(f.total).toBe(1);
    expect(f.counts.confirmed).toBe(0);
    expect(f.counts.requested).toBe(1);
  });
});

describe("bookingCancelRefundDue (M4 cancellation policy — prisma cancel branch)", () => {
  const START = "2026-08-10T12:00:00.000Z";
  const at = (offsetMs: number) => new Date(new Date(START).getTime() - offsetMs);

  it("refunds a worker cancel MORE than the window before start", () => {
    expect(bookingCancelRefundDue({ startAt: START }, at(BOOKING_CANCEL_REFUND_WINDOW_MS + 1000), "worker")).toBe(true);
  });

  it("keeps the deposit for a worker cancel within the window", () => {
    expect(bookingCancelRefundDue({ startAt: START }, at(BOOKING_CANCEL_REFUND_WINDOW_MS - 1000), "worker")).toBe(false);
  });

  it("keeps the deposit exactly at the window edge (strict >)", () => {
    expect(bookingCancelRefundDue({ startAt: START }, at(BOOKING_CANCEL_REFUND_WINDOW_MS), "worker")).toBe(false);
  });

  it("always refunds a customer cancel, regardless of timing", () => {
    expect(bookingCancelRefundDue({ startAt: START }, at(0), "customer")).toBe(true);
    expect(bookingCancelRefundDue({ startAt: START }, at(60 * 60 * 1000), "customer")).toBe(true);
  });

  it("always refunds a system cancel", () => {
    expect(bookingCancelRefundDue({ startAt: START }, at(0), "system")).toBe(true);
  });
});

describe("toDomainInvoice (W2 boundary — company invoices mapper)", () => {
  const DATE = new Date("2026-07-12T10:00:00.000Z");

  function makeInvoiceRow(overrides: Partial<PrismaInvoiceRow> = {}): PrismaInvoiceRow {
    return {
      id: "inv-1",
      number: "INV-1046",
      amount: 400000, // minor units — mapper divides back to 4000
      currency: "USD",
      status: "PAID",
      paidAt: DATE,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      items: [{ description: "AC maintenance — Jeddah & Riyadh — Sponsored search" }],
      payment: { advertisementId: "seed-c2" },
      campaign: { nameAr: "صيانة مكيفات — جدة والرياض", placement: "Sponsored search" },
      ...overrides,
    };
  }

  it("maps an advertising purchase: minor → major, paid, EN + AR descriptions, campaign link", () => {
    const inv = toDomainInvoice(makeInvoiceRow());
    expect(inv.id).toBe("inv-1");
    expect(inv.number).toBe("INV-1046");
    expect(inv.scope).toBe("advertising");
    expect(inv.amount).toBe(4000); // 400000 minor → 4000 major
    expect(inv.currency).toBe("USD");
    expect(inv.status).toBe("paid");
    expect(inv.date).toBe(DATE.toISOString()); // paidAt wins over createdAt
    expect(inv.descriptionEn).toBe("AC maintenance — Jeddah & Riyadh — Sponsored search");
    expect(inv.descriptionAr).toBe("صيانة مكيفات — جدة والرياض — Sponsored search");
    expect(inv.campaignId).toBe("seed-c2");
  });

  it("maps every InvoiceStatus", () => {
    for (const [db, app] of [
      ["PAID", "paid"],
      ["VOID", "refunded"], // the credit note — a refunded purchase reads back here
      ["DRAFT", "pending"],
      ["SENT", "pending"],
      ["OVERDUE", "pending"],
    ] as const) {
      expect(toDomainInvoice(makeInvoiceRow({ status: db })).status).toBe(app);
    }
  });

  it("falls back for non-advertising rows: subscription scope, no campaign link, item/date fallbacks", () => {
    const inv = toDomainInvoice(
      makeInvoiceRow({
        payment: { advertisementId: null },
        campaign: null,
        items: null,
        paidAt: null, // createdAt becomes the date
      })
    );
    expect(inv.scope).toBe("subscription");
    expect(inv.campaignId).toBeUndefined();
    expect(inv.descriptionEn).toBe("INV-1046"); // items missing → number
    expect(inv.descriptionAr).toBe("INV-1046"); // no campaign → same fallback
    expect(inv.date).toBe("2026-07-01T00:00:00.000Z"); // createdAt
  });
});

describe("ad rotation matching (W2 boundary — pure helpers)", () => {
  it("matches placement both ways: exact lowercase, display strings, and a|b tokens", () => {
    // The purchase path writes "homepage"; a homepage request matches exactly.
    expect(matchesAdPlacement("homepage", ["homepage"])).toBe(true);
    // Human display strings stored by the form match too (case-folded substring).
    expect(matchesAdPlacement("Homepage · Banner", ["homepage"])).toBe(true);
    expect(matchesAdPlacement("Popup · Homepage", ["homepage"])).toBe(true);
    // The reverse direction — a token the placement contains also matches.
    expect(matchesAdPlacement("homepage", ["homepage | category"])).toBe(true);
    // No overlap → no match; empty placement never serves.
    expect(matchesAdPlacement("Sponsored search", ["homepage"])).toBe(false);
    expect(matchesAdPlacement("  ", ["homepage"])).toBe(false);
    expect(matchesAdPlacement("homepage", [])).toBe(false);
  });

  it("applies the targeting gate like the demo: untargeted always serves, targeted narrows", () => {
    const untargeted = { categorySlug: null, citySlug: null };
    expect(matchesAdTargeting(untargeted, { category: "plumbing" })).toBe(true);
    expect(matchesAdTargeting(untargeted, { category: "plumbing", city: "riyadh" })).toBe(true);
    expect(matchesAdTargeting(untargeted, {})).toBe(true);

    const targeted = { categorySlug: "cleaning", citySlug: "dubai" };
    expect(matchesAdTargeting(targeted, { category: "cleaning", city: "dubai" })).toBe(true);
    expect(matchesAdTargeting(targeted, { category: "plumbing" })).toBe(false);
    expect(matchesAdTargeting(targeted, { city: "jeddah" })).toBe(false);
    // No filters at all — every ad serves (the API always passes placement,
    // but category/city are optional).
    expect(matchesAdTargeting(targeted, {})).toBe(true);
  });
});

describe("toDomainRecurring (W2 recurring mapper)", () => {
  const ANCHOR = new Date("2026-08-14T07:00:00.000Z");

  function makeOccRow(overrides: Partial<PrismaBookingRow> = {}): PrismaBookingRow {
    return {
      id: "bk-rec-1",
      number: "BK-1002",
      workerId: "w1",
      customerId: null,
      customerName: "Noor E.",
      customerPhone: "+966 55 000 0000",
      customerEmail: "noor@example.com",
      jobTitle: "Weekly AC maintenance",
      note: null,
      startAt: ANCHOR,
      endAt: new Date("2026-08-14T08:00:00.000Z"),
      status: "CONFIRMED",
      quote: 8000,
      deposit: null,
      platformFee: 560,
      platformFeeRateBps: 700,
      currency: "SAR",
      paymentId: null,
      recurringBookingId: "rc-1",
      ...overrides,
    };
  }

  function makeRecurringRow(overrides: Partial<PrismaRecurringRow> = {}): PrismaRecurringRow {
    return {
      id: "rc-1",
      number: "RC-1001",
      workerId: "w1",
      customerId: "u1",
      customerName: "Noor E.",
      customerPhone: "+966 55 000 0000",
      customerEmail: "noor@example.com",
      serviceItem: { nameEn: "AC maintenance", nameAr: "صيانة مكيف", price: 150, unit: "job" },
      jobTitle: "Weekly AC maintenance",
      note: "Filter clean + pressure check.",
      frequency: "WEEKLY",
      anchorStart: ANCHOR,
      anchorEnd: new Date("2026-08-14T08:00:00.000Z"),
      status: "ACTIVE",
      createdAt: new Date("2026-08-14T06:00:00.000Z"),
      occurrences: [makeOccRow()],
      ...overrides,
    };
  }

  it("maps the contract: enums lowercased, occurrences mapped, optionals", () => {
    const r = toDomainRecurring(makeRecurringRow());
    expect(r.id).toBe("rc-1");
    expect(r.number).toBe("RC-1001");
    expect(r.frequency).toBe("weekly");
    expect(r.status).toBe("active");
    expect(r.anchorStart).toBe("2026-08-14T07:00:00.000Z");
    expect(r.customerId).toBe("u1");
    expect(r.serviceItem?.nameEn).toBe("AC maintenance");
    expect(r.occurrences.length).toBe(1);
    // The anchor occurrence maps through toDomainBooking — status lowercased,
    // recurringId stamped from the DB column.
    expect(r.occurrences[0]!.status).toBe("confirmed");
    expect(r.occurrences[0]!.recurringId).toBe("rc-1");
  });

  it("maps every frequency and status enum", () => {
    for (const [db, app] of [
      ["WEEKLY", "weekly"],
      ["BIWEEKLY", "biweekly"],
      ["MONTHLY", "monthly"],
    ] as const) {
      expect(toDomainRecurring(makeRecurringRow({ frequency: db })).frequency).toBe(app);
    }
    for (const [db, app] of [
      ["ACTIVE", "active"],
      ["PAUSED", "paused"],
      ["CANCELLED", "cancelled"],
    ] as const) {
      expect(toDomainRecurring(makeRecurringRow({ status: db })).status).toBe(app);
    }
  });

  it("maps occurrences oldest first with their own statuses", () => {
    const r = toDomainRecurring(
      makeRecurringRow({
        occurrences: [
          makeOccRow({ id: "bk-rec-1", status: "REQUESTED" }),
          makeOccRow({ id: "bk-rec-2", number: "BK-1003", startAt: new Date("2026-08-21T07:00:00.000Z"), endAt: new Date("2026-08-21T08:00:00.000Z") }),
        ],
      })
    );
    expect(r.occurrences.map((o) => o.number)).toEqual(["BK-1002", "BK-1003"]);
    expect(r.occurrences[0]!.status).toBe("requested");
    expect(r.occurrences[1]!.status).toBe("confirmed");
  });
});

describe("toDomainBookingMessage (§2.3 chat thread mapper)", () => {
  function makeMessageRow(overrides: Partial<PrismaBookingMessageRow> = {}): PrismaBookingMessageRow {
    return {
      id: "msg-1",
      bookingId: "bk-1001",
      senderRole: "worker",
      senderId: "u-khaled",
      text: "I can do it for 120",
      quote: 12_000,
      readAt: null,
      createdAt: new Date("2026-08-14T09:00:00.000Z"),
      ...overrides,
    };
  }

  it("maps a message with a quote to the domain type (minor units kept)", () => {
    const m = toDomainBookingMessage(makeMessageRow());
    expect(m).toMatchObject({
      id: "msg-1",
      bookingId: "bk-1001",
      senderRole: "worker",
      senderId: "u-khaled",
      text: "I can do it for 120",
      quote: 12_000,
    });
    expect(m.time).toBe("2026-08-14T09:00:00.000Z");
  });

  it("omits optional fields when absent (no sender id / no quote / no readAt)", () => {
    const m = toDomainBookingMessage(makeMessageRow({ senderId: null, quote: null, readAt: null }));
    expect(m.senderId).toBeUndefined();
    expect(m.quote).toBeUndefined();
    expect(m.readAt).toBeUndefined();
    expect(m.senderRole).toBe("worker");
  });

  it("maps the read receipt (readAt) onto the domain message", () => {
    const at = new Date("2026-08-14T10:00:00.000Z");
    const m = toDomainBookingMessage(makeMessageRow({ readAt: at }));
    expect(m.readAt).toBe(at.toISOString());
  });
});
