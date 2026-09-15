#!/usr/bin/env npx tsx
/**
 * ────────────────────────────────────────────────────────────────────────────
 * PRODUCTION SEED SCRIPT — populates realistic demo data via Prisma
 * ────────────────────────────────────────────────────────────────────────────
 * Usage:  npx tsx scripts/seed-production.ts
 *
 * Creates a realistic workforce across multiple trades, books some completed
 * jobs, and grants credits — enough that every dashboard surface has
 * meaningful data to show. Idempotent: skips records that already exist.
 *
 * Requires DATABASE_URL in .env pointing to a reachable Postgres instance.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ─── Helpers ─── */

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000);

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

/* ─── Worker fixtures ─── */

interface WorkerSeed {
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  citySlug: string;
  areaSlug: string;
  phone: string;
  email: string;
  plan: "BASIC" | "PROFESSIONAL" | "PREMIUM" | "ENTERPRISE";
}

const WORKERS: WorkerSeed[] = [
  { slug: "khaled-al-harbi-plumbing", nameEn: "Khaled Al Harbi", nameAr: "خالد الحربي", categorySlug: "plumbing", citySlug: "beirut", areaSlug: "hamra", phone: "+96170123456", email: "khaled@workersarena.test", plan: "PROFESSIONAL" },
  { slug: "sara-mansour-electrical", nameEn: "Sara Mansour", nameAr: "سارة منصور", categorySlug: "electrical", citySlug: "beirut", areaSlug: "achrafieh", phone: "+96171123456", email: "sara@workersarena.test", plan: "PREMIUM" },
  { slug: "omar-fadel-ac-technician", nameEn: "Omar Fadel", nameAr: "عمر فضل", categorySlug: "ac-technician", citySlug: "beirut", areaSlug: "mar-mikhael", phone: "+96176123456", email: "omar@workersarena.test", plan: "PROFESSIONAL" },
  { slug: "nadia-haddad-painting", nameEn: "Nadia Haddad", nameAr: "نادية حداد", categorySlug: "painting", citySlug: "beirut", areaSlug: "gemmayzeh", phone: "+96178123456", email: "nadia@workersarena.test", plan: "BASIC" },
  { slug: "tarek-hamade-carpentry", nameEn: "Tarek Hamade", nameAr: "طارق حمادة", categorySlug: "carpentry", citySlug: "beirut", areaSlug: "badaro", phone: "+96170123789", email: "tarek@workersarena.test", plan: "PROFESSIONAL" },
];

/* ─── Main ─── */

async function main() {
  console.log("🌱 Starting production seed...");

  // Resolve FK IDs from the database
  const [categories, cities, areas] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.city.findMany({ select: { id: true, slug: true } }),
    prisma.area.findMany({ select: { id: true, slug: true } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.slug, c.id]));
  const cityMap = new Map(cities.map((c) => [c.slug, c.id]));
  const areaMap = new Map(areas.map((a) => [a.slug, a.id]));

  // 1. Seed workers
  const workerIds: Record<string, string> = {};
  for (const w of WORKERS) {
    const existing = await prisma.worker.findUnique({ where: { slug: w.slug } });
    if (existing) {
      workerIds[w.slug] = existing.id;
      console.log(`  ✓ Worker ${w.nameEn} already exists (${existing.id})`);
      continue;
    }

    const catId = catMap.get(w.categorySlug);
    const cityId = cityMap.get(w.citySlug);
    const areaId = areaMap.get(w.areaSlug);
    if (!catId || !cityId || !areaId) {
      console.log(`  ⚠ Skipping ${w.nameEn}: missing category/city/area (${w.categorySlug}/${w.citySlug}/${w.areaSlug})`);
      continue;
    }

    const worker = await prisma.worker.create({
      data: {
        slug: w.slug,
        nameEn: w.nameEn,
        nameAr: w.nameAr,
        categoryId: catId,
        cityId,
        areaId,
        taglineEn: `Experienced ${w.categorySlug} professional`,
        taglineAr: `محترف ${w.categorySlug} بخبرة`,
        bioEn: `${w.nameEn} is a skilled ${w.categorySlug} professional with years of experience.`,
        bioAr: `${w.nameAr} محترف ${w.categorySlug} ذو خبرة سنوات.`,
        rating: 4.0 + Math.random() * 0.9,
        reviewCount: Math.floor(Math.random() * 50) + 5,
        yearsExp: Math.floor(Math.random() * 15) + 3,
        verified: true,
        premium: w.plan === "PREMIUM" || w.plan === "ENTERPRISE",
        isFeatured: w.plan === "PREMIUM",
        emergency: w.plan === "ENTERPRISE" || Math.random() > 0.6,
        available: true,
        priceMin: 50,
        priceMax: 200,
        phone: w.phone,
        whatsapp: w.phone,
        email: w.email,
        viewCount: Math.floor(Math.random() * 5000) + 200,
        leadCount: Math.floor(Math.random() * 100) + 10,
        hue: Math.floor(Math.random() * 360),
        lat: 33.8938 + Math.random() * 0.05,
        lng: 35.5018 + Math.random() * 0.05,
        languages: JSON.stringify([
          { code: "ar", nameEn: "Arabic", nameAr: "العربية" },
          { code: "en", nameEn: "English", nameAr: "الإنجليزية" },
        ]),
        hours: {
          create: [0, 1, 2, 3, 4, 5].map((day) => ({
            day,
            open: "09:00",
            close: "18:00",
            closed: day === 5,
          })),
        },
        subscription: {
          create: {
            plan: w.plan,
            status: "ACTIVE",
            price: w.plan === "BASIC" ? 29 : w.plan === "PROFESSIONAL" ? 99 : w.plan === "PREMIUM" ? 199 : 299,
            currency: "USD",
            startedAt: daysAgo(30),
            expiresAt: daysFromNow(w.plan === "PREMIUM" ? 335 : 30),
          },
        },
      },
    });
    workerIds[w.slug] = worker.id;
    console.log(`  ✓ Created worker ${w.nameEn} (${worker.id})`);
  }

  // 2. Seed completed bookings
  const BOOKINGS = [
    { slug: "khaled-al-harbi-plumbing", title: "Kitchen pipe repair", customerName: "Ahmad Kassem", quote: 12000, fee: 840 },
    { slug: "sara-mansour-electrical", title: "Apartment rewiring", customerName: "Lina Abi Chedid", quote: 45000, fee: 3150 },
    { slug: "khaled-al-harbi-plumbing", title: "Bathroom drain unclogging", customerName: "Rami Farhat", quote: 8000, fee: 560 },
    { slug: "omar-fadel-ac-technician", title: "AC unit installation", customerName: "Mona Aoun", quote: 35000, fee: 2450 },
    { slug: "tarek-hamade-carpentry", title: "Custom shelving unit", customerName: "George Abou Jaoude", quote: 25000, fee: 1750 },
    { slug: "khaled-al-harbi-plumbing", title: "Water heater replacement", customerName: "Nada Tfayli", quote: 50000, fee: 3500 },
    { slug: "sara-mansour-electrical", title: "Switch panel upgrade", customerName: "Bilal Charara", quote: 18000, fee: 1260 },
    { slug: "nadia-haddad-painting", title: "Living room painting", customerName: "Rima Jaber", quote: 30000, fee: 2100 },
  ];

  for (let i = 0; i < BOOKINGS.length; i++) {
    const b = BOOKINGS[i];
    const num = `BK-${9000 + i}`;
    const existing = await prisma.booking.findFirst({ where: { number: num } });
    if (existing) {
      console.log(`  ✓ Booking ${num} already exists`);
      continue;
    }

    const workerId = workerIds[b.slug];
    if (!workerId) continue;

    const completedDaysAgo = 30 - i * 3;
    const completedAt = daysAgo(Math.max(1, completedDaysAgo));

    const booking = await prisma.booking.create({
      data: {
        number: num,
        workerId,
        customerName: b.customerName,
        customerPhone: `+9617${String(i).padStart(7, "0")}`,
        jobTitle: b.title,
        status: "COMPLETED",
        quote: b.quote,
        platformFee: b.fee,
        platformFeeRateBps: 700,
        currency: "USD",
        startAt: completedAt,
        endAt: new Date(completedAt.getTime() + 2 * 3600_000),
        events: {
          create: [
            { status: "REQUESTED", actorType: "customer", createdAt: daysAgo(completedDaysAgo + 2) },
            { status: "CONFIRMED", actorType: "worker", createdAt: daysAgo(completedDaysAgo + 1) },
            { status: "COMPLETED", actorType: "system", createdAt: completedAt },
          ],
        },
      },
    });

    // Create ledger earning entry
    const earnings = b.quote - b.fee;
    await prisma.workerLedgerEntry.create({
      data: {
        workerId,
        bookingId: booking.id,
        kind: "EARNING",
        status: "POSTED",
        amount: earnings,
        balanceAfter: earnings,
        currency: "USD",
        reason: `Earnings: ${b.title}`,
        createdAt: completedAt,
      },
    });

    console.log(`  ✓ Created booking ${num} (${b.title})`);
  }

  // 3. Grant credits to demo workers
  for (const [slug, workerId] of Object.entries(workerIds)) {
    const existing = await prisma.workerCreditEntry.findFirst({
      where: { workerId, reason: { contains: "Production seed" } },
    });
    if (!existing) {
      await prisma.workerCreditEntry.create({
        data: {
          workerId,
          amount: 50,
          kind: "grant",
          reason: "Production seed — lead marketplace credits",
          createdBy: "seed",
          balanceAfter: 50,
        },
      });
      console.log(`  ✓ Granted 50 credits to ${slug}`);
    }
  }

  // Summary
  const [workerCount, bookingCount, ledgerCount] = await Promise.all([
    prisma.worker.count(),
    prisma.booking.count(),
    prisma.workerLedgerEntry.count(),
  ]);

  console.log(`\n🎉 Seed complete!`);
  console.log(`   Workers: ${workerCount}`);
  console.log(`   Bookings: ${bookingCount}`);
  console.log(`   Ledger entries: ${ledgerCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
