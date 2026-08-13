/**
 * Database seeder — loads the full bilingual demo dataset into PostgreSQL.
 *
 *   npx prisma migrate dev && npm run db:seed
 *
 * Reuses the exact same source of truth as demo mode
 * (src/lib/data/*), so demo and production stay consistent.
 */
import { BookingStatus, PrismaClient, RecurringFrequency, RecurringStatus, Role, SlotStatus, SubscriptionPlan, WorkerStatus } from "@prisma/client";
import { CATEGORIES } from "../src/lib/data/categories";
import { CITIES } from "../src/lib/data/cities";
import { WORKERS } from "../src/lib/data/workers";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding WorkersArena…");

  // Categories — sortOrder mirrors the demo array order so the production
  // category listing matches the demo's (tie-free ordering for getCategories).
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        icon: c.icon,
        taglineEn: c.taglineEn,
        taglineAr: c.taglineAr,
        hue: c.hue,
        isActive: true,
        sortOrder: i,
      },
      create: {
        slug: c.slug,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        icon: c.icon,
        taglineEn: c.taglineEn,
        taglineAr: c.taglineAr,
        hue: c.hue,
        sortOrder: i,
      },
    });
  }
  console.log(`  ✓ ${CATEGORIES.length} categories`);

  // Cities + areas
  for (const city of CITIES) {
    const created = await prisma.city.upsert({
      where: { slug: city.slug },
      update: {
        nameEn: city.nameEn,
        nameAr: city.nameAr,
        countryEn: city.countryEn,
        countryAr: city.countryAr,
        currency: city.currency,
        lat: city.lat,
        lng: city.lng,
      },
      create: {
        slug: city.slug,
        nameEn: city.nameEn,
        nameAr: city.nameAr,
        countryEn: city.countryEn,
        countryAr: city.countryAr,
        currency: city.currency,
        lat: city.lat,
        lng: city.lng,
      },
    });
    for (const area of city.areas) {
      await prisma.area.upsert({
        where: { cityId_slug: { cityId: created.id, slug: area.slug } },
        update: { nameEn: area.nameEn, nameAr: area.nameAr },
        create: { cityId: created.id, slug: area.slug, nameEn: area.nameEn, nameAr: area.nameAr },
      });
    }
  }
  console.log(`  ✓ ${CITIES.length} cities with areas`);

  // Real users for the demo identities — credentials login works end-to-end
  // against the DB (src/app/actions/auth.ts → DEMO_PASSWORD, and the one-click
  // demo buttons in real mode sign in with these). Workers are owned by admin.
  const { DEMO_PASSWORD, hashPassword } = await import("../src/lib/security");
  // NOTE: the user upsert's `update` branch re-hashes the demo password on
  // every seed run (new random salt each time) — dev convenience; an operator
  // who changes a demo user's password in the DB will have it reset by re-seeding.
  const demoUsers = [
    { email: "sara@example.com", name: "Sara Customer", role: Role.CUSTOMER, hue: 200 },
    { email: "khaled@plumbfix.sa", name: "Khaled Al-Harbi", role: Role.WORKER, hue: 25 },
    { email: "ads@buildco.sa", name: "BuildCo Ltd", role: Role.COMPANY, hue: 150 },
    { email: "admin@workersarena.com", name: "Platform Admin", role: Role.ADMIN, hue: 280 },
  ];
  const users = new Map<string, string>(); // email → user id
  for (const u of demoUsers) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, hue: u.hue, passwordHash: hashPassword(DEMO_PASSWORD) },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        hue: u.hue,
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
    });
    users.set(u.email, row.id);
  }
  const adminId = users.get("admin@workersarena.com")!;
  console.log(`  ✓ ${demoUsers.length} demo users (credentials: password ${DEMO_PASSWORD})`);

  // The demo company account gets its Company row (mirrors the demo adapter's
  // fixed company) so self-serve ad purchases work in real mode — the purchase
  // path resolves the Company by userId (Company.userId is unique). Idempotent.
  const companyUserId = users.get("ads@buildco.sa");
  if (companyUserId) {
    await prisma.company.upsert({
      where: { userId: companyUserId },
      update: { nameEn: "BuildCo Ltd", nameAr: "شركة بيلدكو" },
      create: {
        userId: companyUserId,
        nameEn: "BuildCo Ltd",
        nameAr: "شركة بيلدكو",
        slug: "buildco-ltd",
      },
    });
    console.log("  ✓ company row (BuildCo Ltd)");
  }

  for (const w of WORKERS) {
    const category = await prisma.category.findUnique({ where: { slug: w.categorySlug } });
    const city = await prisma.city.findUnique({ where: { slug: w.citySlug } });
    const area = city
      ? await prisma.area.findUnique({ where: { cityId_slug: { cityId: city.id, slug: w.areaSlug } } })
      : null;
    if (!category || !city || !area) continue;

    const worker = await prisma.worker.upsert({
      where: { slug: w.slug },
      update: {
        nameEn: w.nameEn,
        nameAr: w.nameAr,
        taglineEn: w.taglineEn,
        taglineAr: w.taglineAr,
        bioEn: w.bioEn,
        bioAr: w.bioAr,
        rating: w.rating,
        reviewCount: w.reviewCount,
        yearsExp: w.yearsExp,
        verified: w.verified,
        premium: w.premium,
        emergency: w.emergency,
        available: w.available,
        // Schema convention: all money in minor units (×100) — the production
        // mapper divides back to major units for the UI (prisma-repo.ts).
        priceMin: w.priceMin * 100,
        priceMax: w.priceMax * 100,
        phone: w.phone,
        whatsapp: w.whatsapp,
        // Preserve the demo verification state: pending workers stay pending
        // (PENDING_VERIFICATION) so the production mapper round-trips
        // Worker.verification correctly; verified/rejected map to ACTIVE.
        status: w.verification === "pending" ? WorkerStatus.PENDING_VERIFICATION : WorkerStatus.ACTIVE,
      },
      create: {
        slug: w.slug,
        // Admin-imported demo workers: no owning user row (Worker.userId is
        // @unique — only the seeded account users get real user ids).
        userId: null,
        nameEn: w.nameEn,
        nameAr: w.nameAr,
        taglineEn: w.taglineEn,
        taglineAr: w.taglineAr,
        bioEn: w.bioEn,
        bioAr: w.bioAr,
        categoryId: category.id,
        cityId: city.id,
        areaId: area.id,
        lat: w.lat,
        lng: w.lng,
        phone: w.phone,
        whatsapp: w.whatsapp,
        email: w.email,
        website: w.website,
        priceMin: w.priceMin * 100,
        priceMax: w.priceMax * 100,
        yearsExp: w.yearsExp,
        languages: w.languages,
        rating: w.rating,
        reviewCount: w.reviewCount,
        viewCount: w.views,
        leadCount: w.leads,
        verified: w.verified,
        premium: w.premium,
        emergency: w.emergency,
        available: w.available,
        hue: w.hue,
        completion: w.completion,
        status: w.verification === "pending" ? WorkerStatus.PENDING_VERIFICATION : WorkerStatus.ACTIVE,
        isFeatured: w.featured,
        joinedAt: new Date(`${w.joinedYear}-01-15`),
      },
    });

    // Services
    await prisma.serviceItem.deleteMany({ where: { workerId: worker.id } });
    for (const s of w.services) {
      await prisma.serviceItem.create({
        data: {
          workerId: worker.id,
          nameEn: s.nameEn,
          nameAr: s.nameAr,
          price: s.price,
          unit: s.unit,
        },
      });
    }

    // Working hours
    await prisma.workingHour.deleteMany({ where: { workerId: worker.id } });
    for (const h of w.hours) {
      await prisma.workingHour.create({
        data: { workerId: worker.id, day: h.day, open: h.open, close: h.close, closed: h.closed },
      });
    }

    // Certifications
    await prisma.certification.deleteMany({ where: { workerId: worker.id } });
    for (const c of w.certifications) {
      await prisma.certification.create({
        data: { workerId: worker.id, nameEn: c.nameEn, nameAr: c.nameAr, issuerEn: c.issuerEn, issuerAr: c.issuerAr, year: c.year, verified: true },
      });
    }

    // Portfolio
    await prisma.portfolioItem.deleteMany({ where: { workerId: worker.id } });
    for (const p of w.gallery) {
      await prisma.portfolioItem.create({
        data: { workerId: worker.id, titleEn: p.titleEn, titleAr: p.titleAr, imageUrl: `https://res.cloudinary.com/workersarena/portfolio/${w.slug}-${p.titleEn.toLowerCase().replace(/\s+/g, "-")}.jpg`, sortOrder: 0 },
      });
    }

    // Reviews (demo reviews are marked approved). One review per author per
    // worker (unique [workerId, authorId]) — authors rotate through the demo
    // users, so a worker can carry up to 4 seeded reviews; exact duplicates
    // are skipped instead of crashing the seed.
    await prisma.review.deleteMany({ where: { workerId: worker.id } });
    // At most 4 reviews per worker survive (one per demo author); extras are
    // silently dropped by skipDuplicates rather than crashing the seed.
    const authors = [...users.values()];
    const reviewRows = w.reviews.map((r, i) => ({
      workerId: worker.id,
      authorId: authors[i % authors.length],
      rating: r.rating,
      textEn: r.textEn,
      textAr: r.textAr,
      status: "APPROVED" as const,
      verifiedPurchase: r.verifiedPurchase ?? false,
      createdAt: new Date(r.date),
    }));
    if (reviewRows.length) {
      await prisma.review.createMany({ data: reviewRows, skipDuplicates: true });
    }

    // Subscription mirrors the demo dataset (every worker has one) — gated on
    // the worker's plan, NOT on verification, so an unverified worker (e.g. the
    // demo WORKER account Khaled) still gets its Premium row in real mode.
    const PLAN_MAP: Record<string, SubscriptionPlan> = {
      basic: SubscriptionPlan.BASIC,
      professional: SubscriptionPlan.PROFESSIONAL,
      premium: SubscriptionPlan.PREMIUM,
      enterprise: SubscriptionPlan.ENTERPRISE,
    };
    const sub = w.subscription;
    const expiresAt = new Date(sub.expiresAt);
    await prisma.subscription.upsert({
      where: { workerId: worker.id },
      update: {
        plan: PLAN_MAP[sub.plan] ?? SubscriptionPlan.PROFESSIONAL,
        status: sub.status === "expired" ? "EXPIRED" : sub.status === "expiring" ? "EXPIRING_SOON" : "ACTIVE",
        price: sub.price * 100, // demo USD → minor units
        expiresAt,
      },
      create: {
        workerId: worker.id,
        plan: PLAN_MAP[sub.plan] ?? SubscriptionPlan.PROFESSIONAL,
        status: sub.status === "expired" ? "EXPIRED" : sub.status === "expiring" ? "EXPIRING_SOON" : "ACTIVE",
        price: sub.price * 100,
        currency: "USD",
        startedAt: new Date(sub.startedAt),
        expiresAt,
      },
    });
  }
  console.log(`  ✓ ${WORKERS.length} workers with services, hours, reviews & subscriptions`);

  // ── Bookings & slots (demo, deterministic) ─────────────────────────────────
  // A request + slots for the demo worker so the booking flow is exercisable
  // in the preview: one AVAILABLE slot, one RESERVED slot (the demo request),
  // and one BLOCKED slot to exercise the availability editor. Idempotent: the
  // demo booking and its unclaimed slots are recreated fresh on every seed run
  // (relative "tomorrow" dates, so they always look upcoming).
  const demoWorker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
  if (demoWorker) {
    const saraId = users.get("sara@example.com");
    const slotAt = (hour: number) => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(hour, 0, 0, 0);
      return d;
    };
    // Fresh AVAILABLE slots a few days out (+3/+5), mirroring the demo store —
    // so the real-mode worker page's booking dialog always has bookable chips
    // in its 14-day window even after the "tomorrow" 09:00 slot is consumed.
    const plusDays = (hour: number, days: number) => {
      const d = slotAt(hour);
      d.setDate(d.getDate() + days);
      return d;
    };
    const slotPlans = [
      { startAt: slotAt(9), status: SlotStatus.AVAILABLE },
      { startAt: slotAt(10), status: SlotStatus.RESERVED },
      { startAt: slotAt(14), status: SlotStatus.BLOCKED },
      { startAt: plusDays(16, 2), status: SlotStatus.AVAILABLE }, // +3 days
      { startAt: plusDays(11, 4), status: SlotStatus.AVAILABLE }, // +5 days
    ];
    // Reset: drop the previous demo booking + any unclaimed demo slots.
    const existingBooking = await prisma.booking.findUnique({ where: { number: "BK-1001" } });
    if (existingBooking) {
      await prisma.bookingEvent.deleteMany({ where: { bookingId: existingBooking.id } });
      await prisma.booking.delete({ where: { number: "BK-1001" } });
    }
    await prisma.bookingSlot.deleteMany({ where: { workerId: demoWorker.id, bookingId: null } });

    const slotIds: string[] = [];
    for (const plan of slotPlans) {
      const slot = await prisma.bookingSlot.create({
        data: {
          workerId: demoWorker.id,
          startAt: plan.startAt,
          endAt: new Date(plan.startAt.getTime() + 60 * 60 * 1000),
          status: plan.status,
        },
      });
      slotIds.push(slot.id);
    }

    const booking = await prisma.booking.create({
      data: {
        number: "BK-1001",
        workerId: demoWorker.id,
        customerId: saraId ?? null,
        customerName: "Sara Customer",
        customerPhone: "+966 50 000 0000",
        customerEmail: "sara@example.com",
        jobTitle: "Leaking kitchen sink repair",
        note: "Sink under the kitchen window has been leaking for two days.",
        startAt: slotPlans[1]!.startAt,
        endAt: new Date(slotPlans[1]!.startAt.getTime() + 60 * 60 * 1000),
        status: BookingStatus.REQUESTED,
        currency: "SAR",
      },
    });
    // Claim the reserved slot (slot → booking FK lives on BookingSlot).
    await prisma.bookingSlot.update({ where: { id: slotIds[1]! }, data: { bookingId: booking.id } });
    await prisma.bookingEvent.create({
      data: { bookingId: booking.id, status: BookingStatus.REQUESTED, actorType: "customer", actorId: saraId ?? null },
    });
    console.log("  ✓ 5 booking slots + 1 demo booking (BK-1001)");

    // ── Recurring contract (W2 — ENHANCEMENT-PLAN §7 #1) ────────────────────
    // One ACTIVE maintenance contract (RC-1001) so the recurring tabs and the
    // generation cron are exercisable against the seeded DB: an AVAILABLE slot
    // tomorrow at 11:00 anchors it, and the first occurrence is CONFIRMED with
    // a quote (slot BOOKED). The weekly cadence rolls forward via
    // GET /api/cron/recurring. Idempotent: the previous RC-1001 + its
    // occurrences + the anchor slot are recreated fresh on every seed run.
    const existingRecurring = await prisma.recurringBooking.findUnique({ where: { number: "RC-1001" } });
    if (existingRecurring) {
      // BookingSlot.bookingId is SetNull — deleting the occurrences frees the
      // anchor slot for the unclaimed-slot cleanup below.
      await prisma.booking.deleteMany({ where: { recurringBookingId: existingRecurring.id } });
      await prisma.recurringBooking.delete({ where: { number: "RC-1001" } });
    }
    await prisma.bookingSlot.deleteMany({
      where: { workerId: demoWorker.id, bookingId: null, startAt: slotAt(11) },
    });
    const recurringSlot = await prisma.bookingSlot.create({
      data: {
        workerId: demoWorker.id,
        startAt: slotAt(11),
        endAt: new Date(slotAt(11).getTime() + 60 * 60 * 1000),
        status: SlotStatus.AVAILABLE,
      },
    });
    const recurring = await prisma.recurringBooking.create({
      data: {
        number: "RC-1001",
        workerId: demoWorker.id,
        customerId: saraId ?? null,
        customerName: "Sara Customer",
        customerPhone: "+966 50 000 0000",
        customerEmail: "sara@example.com",
        jobTitle: "Weekly AC maintenance",
        note: "Filter clean + pressure check, every week.",
        frequency: RecurringFrequency.WEEKLY,
        anchorStart: recurringSlot.startAt,
        anchorEnd: recurringSlot.endAt,
        status: RecurringStatus.ACTIVE,
      },
    });
    const recurringOcc = await prisma.booking.create({
      data: {
        number: "BK-1002",
        workerId: demoWorker.id,
        customerId: saraId ?? null,
        customerName: "Sara Customer",
        customerPhone: "+966 50 000 0000",
        customerEmail: "sara@example.com",
        jobTitle: "Weekly AC maintenance",
        note: "Filter clean + pressure check, every week.",
        startAt: recurringSlot.startAt,
        endAt: recurringSlot.endAt,
        status: BookingStatus.CONFIRMED,
        quote: 15000, // 150 SAR — minor units, like the adapter's stamps
        platformFee: 1500, // 10% take rate snapshot
        platformFeeRateBps: 1000,
        currency: "SAR",
        recurringBookingId: recurring.id,
      },
    });
    await prisma.bookingSlot.update({ where: { id: recurringSlot.id }, data: { bookingId: recurringOcc.id, status: SlotStatus.BOOKED } });
    await prisma.bookingEvent.create({
      data: { bookingId: recurringOcc.id, status: BookingStatus.CONFIRMED, actorType: "system", reason: "recurring weekly" },
    });
    console.log("  ✓ 1 recurring contract (RC-1001) + 1 confirmed occurrence (BK-1002)");
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
