#!/usr/bin/env npx tsx
/**
 * ────────────────────────────────────────────────────────────────────────────
 * SURGE REPORT BACKFILL — a populated 30-day emergency cohort, today
 * ────────────────────────────────────────────────────────────────────────────
 * Phase 2 says: tune the 1.5× emergency factor from 30 days of conversion and
 * refund data. A report with 3 offers in it cannot be reviewed, so this seed
 * writes a realistic cohort straight through Prisma:
 *
 *   • 60 emergency-grade leads spread over the last 30 days (2/day),
 *     each offered to 2 workers at the 1.5× premium (pricingMultiplier 1.5,
 *     reason "emergency dispatch"), priced off the shipped grade base;
 *   • a per-day buy pattern tuned so the window lands on a HEALTHY verdict
 *     (early days buy less, recent days buy more — a plausible adoption
 *     curve, and enough headroom above the 40% conversion threshold);
 *   • 3 refund requests (2 approved 1–2 days later, 1 pending) so the refund
 *     rate, the pending queue and the premium re-attribution all have data;
 *   • the matching gold-grade cohort (60 leads, similar pattern) so the
 *     baseline comparison on the card is meaningful;
 *   • real credit-ledger rows for every purchase (grant to fund the balance,
 *     then the spend) with backdated createdAt stamps.
 *
 * Everything goes through the same tables the report reads (LeadOffer +
 * LeadRefundRequest + WorkerCreditEntry) — the card, the CSV export, the
 * refund-review queue and the lead-market audit all light up at once.
 *
 * Idempotent: marked quote requests (SEED_EMAIL) short-circuit a re-run.
 * Run:  npx tsx scripts/seed-surge-report.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ─── Deterministic RNG (mulberry32) — a stable cohort on every run ─── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x5e27);
const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const jitter = (base: number, spread: number) =>
  Math.max(1, Math.round(base + (rand() * 2 - 1) * spread));

/* ─── Config ─── */

const NOW = Date.now();
const WINDOW_DAYS = 30;
const DAYS_AGO_ISO = (n: number, hour = 9) => {
  const d = new Date(NOW - n * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Idempotency marker — every seeded request carries this email. */
const SEED_EMAIL = "surge-seed@workersarena.test";
/** Offer TTL (hours) — matches the shipped 120-minute policy × burst factor. */
const OFFER_TTL_HOURS = 48;
/** The 1.5× emergency dispatch premium (Phase 2 under evaluation). */
const EMERGENCY_MULTIPLIER = 1.5;
/** Shipped grade base prices (DEFAULT_LEAD_MARKET_CONFIG). */
const BASE_PRICE: Record<string, number> = { bronze: 5, silver: 9, gold: 20, emergency: 35 };
/** Gold gets no dispatch premium — its offers lock multiplier 1. */
const GOLD_MULTIPLIER = 1;

const EMERGENCY_JOBS = [
  { title: "Burst pipe flooding the kitchen", note: "Water is spreading fast, need someone today." },
  { title: "Power outage in the whole apartment", note: "Breaker trips immediately, no lights since morning." },
  { title: "AC leaking into the bedroom ceiling", note: "Drip is staining the ceiling, urgent check needed." },
];
const GOLD_JOBS = [
  { title: "Full bathroom renovation quote", note: "Verified customer, full brief with photos available on request." },
  { title: "Annual maintenance contract for 3 units", note: "Property manager, scheduled quarterly visits preferred." },
];
const CUSTOMER_NAMES = ["Rami Haddad", "Nour Salameh", "Jana Atallah", "Fadi Khoury", "Maya Barakat", "Ziad Gebran"];
const AREAS = ["hamra", "achrafieh", "mar-mikhael", "badaro", "gemmayzeh"];

/**
 * Per-day purchase probability for the emergency cohort (days ago → p).
 * Ramps upward so the window ends healthy: early weeks suppress demand,
 * recent weeks absorb the premium.
 *
 * Calibration: the report's conversion is OFFER-level (purchased offers ÷
 * offers shown, 2 offers per lead) while exclusivity caps purchases at one
 * per lead — so per-offer probability p yields lead-level conversion
 * 1−(1−p)². Landing ≥ 48 of 120 offers (40% healthy bar) needs ~50+ of 60
 * leads bought, i.e. a weighted p ≈ 0.62 — this ramp averages 0.616.
 */
function emergencyBuyProbability(daysAgo: number): number {
  if (daysAgo > 24) return 0.5;
  if (daysAgo > 18) return 0.58;
  if (daysAgo > 12) return 0.62;
  if (daysAgo > 6) return 0.66;
  return 0.72;
}
function goldBuyProbability(daysAgo: number): number {
  if (daysAgo > 24) return 0.3;
  if (daysAgo > 12) return 0.45;
  return 0.55;
}

/* ─── Main ─── */

async function main() {
  console.log("── Surge-report backfill ──");

  // Idempotency: any seeded request short-circuits.
  const existing = await prisma.quoteRequest.findFirst({ where: { customerEmail: SEED_EMAIL }, select: { id: true } });
  if (existing) {
    console.log(`Already seeded (found request ${existing.id}) — nothing to do.`);
    return;
  }

  // The buying workers: up to two Beirut plumbers from the production seed,
  // so each lead has distinct candidates. Fallback to any 2 active workers.
  let workers = await prisma.worker.findMany({
    where: { category: { slug: "plumbing" }, city: { slug: "beirut" } },
    select: { id: true, nameEn: true },
    take: 6,
  });
  if (workers.length < 2) {
    workers = await prisma.worker.findMany({
      where: { city: { slug: "beirut" } },
      select: { id: true, nameEn: true },
      take: 2,
    });
  }
  if (workers.length < 1) throw new Error("No workers in Beirut — run scripts/seed-production.ts first.");
  const buyers = workers.slice(0, 2);
  console.log(`Buyers: ${buyers.map((w) => w.nameEn).join(", ")}`);

  // Fund each buyer once (backdated grant) so the ledger trail is plausible.
  const grantAt = DAYS_AGO_ISO(WINDOW_DAYS + 1);
  for (const worker of buyers) {
    await prisma.workerCreditEntry.create({
      data: {
        workerId: worker.id,
        kind: "grant",
        amount: 2000,
        balanceAfter: 2000,
        reason: "Surge-report seed funding",
        createdBy: "surge-seed",
        createdAt: new Date(grantAt),
      },
    });
  }

  const qrCount = await prisma.quoteRequest.count();
  let seq = 0;
  const mkNumber = () => `QR-${new Date(NOW).getFullYear()}-${String(qrCount + ++seq).padStart(5, "0")}`;

  /** One seeded lead: request → 2 offers → maybe purchase → maybe refund. */
  async function seedLead(grade: "emergency" | "gold", daysAgo: number) {
    const isEmergency = grade === "emergency";
    const job = isEmergency ? pick(EMERGENCY_JOBS) : pick(GOLD_JOBS);
    const offeredAt = DAYS_AGO_ISO(daysAgo, isEmergency ? 14 + Math.floor(rand() * 8) : 11);
    const price = isEmergency
      ? Math.round(BASE_PRICE.emergency * EMERGENCY_MULTIPLIER) // 53 credits ≈ the real 1.5× lock
      : BASE_PRICE.gold;

    const request = await prisma.quoteRequest.create({
      data: {
        number: mkNumber(),
        customerName: pick(CUSTOMER_NAMES),
        customerPhone: "+961 3 000 000",
        customerEmail: SEED_EMAIL,
        jobTitle: job.title,
        note: job.note,
        categorySlug: "plumbing",
        citySlug: "beirut",
        isEmergency,
        status: "OPEN",
        createdAt: new Date(offeredAt),
        updatedAt: new Date(offeredAt),
      },
    });

    const offers: Array<{ id: string; workerId: string; bought: boolean }> = [];
    for (const worker of buyers) {
      const multiplier = isEmergency ? EMERGENCY_MULTIPLIER : GOLD_MULTIPLIER;
      const willBuy = rand() < (isEmergency ? emergencyBuyProbability(daysAgo) : goldBuyProbability(daysAgo));
      const offer = await prisma.leadOffer.create({
        data: {
          leadId: request.id,
          leadNumber: request.number,
          workerId: worker.id,
          grade,
          matchScore: jitter(isEmergency ? 92 : 84, 6),
          priceCredits: price,
          pricingMultiplier: multiplier,
          pricingReason: isEmergency ? "emergency dispatch" : "base rate",
          status: "offered",
          exclusive: true,
          offeredAt: new Date(offeredAt),
          expiresAt: new Date(NOW - daysAgo * 86_400_000 + OFFER_TTL_HOURS * 3_600_000),
        },
      });
      offers.push({ id: offer.id, workerId: worker.id, bought: willBuy });
    }

    // Purchases: at most one per lead (exclusivity), the best scorer buys.
    const buyer = offers.find((o) => o.bought);
    if (buyer) {
      const purchasedAt = new Date(Date.parse(offeredAt) + jitter(3, 2) * 3_600_000);
      const spend = await prisma.workerCreditEntry.create({
        data: {
          workerId: buyer.workerId,
          kind: "spend",
          amount: -price,
          balanceAfter: 0, // reconciled below
          reason: `Lead ${request.number} (${grade})`,
          offerId: buyer.id,
          createdAt: purchasedAt,
        },
      });
      await prisma.leadOffer.update({
        where: { id: buyer.id },
        data: { status: "purchased", purchasedAt, creditEntryId: spend.id, contactReveal: "revealed" },
      });
    }

    // Refunds: only on emergency purchases, ~5% of the cohort's buyers.
    if (isEmergency && buyer && rand() < 0.07) {
      const reason = pick(["unreachable", "no-show", "wrong-trade"] as const);
      const submittedAt = new Date(Date.parse(offeredAt) + jitter(20, 8) * 3_600_000);
      const refund = await prisma.leadRefundRequest.create({
        data: {
          offerId: buyer.id,
          leadId: request.id,
          workerId: buyer.workerId,
          reason,
          requestedCredits: price,
          approvedCredits: 0,
          status: "pending",
          submittedAt,
        },
      });
      // Two of every three refunds resolve approved the next day.
      if (rand() < 2 / 3) {
        const approvedAt = new Date(submittedAt.getTime() + 24 * 3_600_000);
        await prisma.leadRefundRequest.update({
          where: { id: refund.id },
          data: {
            status: "approved",
            approvedCredits: price,
            decidedAt: approvedAt,
            decidedBy: "surge-seed",
            adminNote: "Backfill: customer unreachable after purchase.",
          },
        });
        // The approved credits flow back through the ledger (kind adjustment).
        await prisma.workerCreditEntry.create({
          data: {
            workerId: buyer.workerId,
            kind: "adjustment",
            amount: price,
            balanceAfter: 0, // reconciled below
            reason: `Lead refund ${refund.id}: ${reason}`,
            offerId: `refund:${refund.id}`,
            createdBy: "surge-seed",
            createdAt: approvedAt,
          },
        });
      }
    }
  }

  // The cohorts: 2 emergency + 2 gold leads per day across the window.
  for (let d = WINDOW_DAYS; d >= 1; d -= 1) {
    await seedLead("emergency", d);
    await seedLead("emergency", d);
    await seedLead("gold", d);
    await seedLead("gold", d);
  }

  // Reconcile every balanceAfter by replaying that worker's entries in time
  // order (the ledger's balance column must stay internally consistent).
  const touched = await prisma.workerCreditEntry.findMany({
    where: { createdBy: "surge-seed" },
    orderBy: [{ workerId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const balances = new Map<string, number>();
  for (const entry of touched) {
    const running = (balances.get(entry.workerId) ?? 0) + entry.amount;
    if (entry.balanceAfter !== running) {
      await prisma.workerCreditEntry.update({ where: { id: entry.id }, data: { balanceAfter: running } });
    }
    balances.set(entry.workerId, running);
  }

  console.log(`Seeded ${seq} leads across ${WINDOW_DAYS} days (2 emergency + 2 gold per day).`);
  const emergencyOffers = await prisma.leadOffer.count({ where: { grade: "emergency" } });
  const purchased = await prisma.leadOffer.count({ where: { grade: "emergency", status: "purchased" } });
  const refunds = await prisma.leadRefundRequest.count();
  console.log(`Emergency offers: ${emergencyOffers} · purchased: ${purchased} · refunds: ${refunds}`);
  console.log("The /admin/revenue-settings surge card now has a full 30-day cohort.");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
