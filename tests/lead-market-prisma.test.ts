import { describe, expect, it } from "vitest";

/**
 * Prisma mirror of the demo lead-marketplace tests: LIVE-DB offer creation,
 * the one-shot purchase (status CAS + ledger debit) and the §9 exclusive
 * revoke, all inside the real transaction.
 *
 * Gated on a live DATABASE_URL (the fixture-only host skips it). Run it against
 * the local Postgres with the seed in place and the lead-offers migration
 * applied:
 *   DATABASE_URL=postgresql://… DEMO_MODE=false npx vitest run tests/lead-market-prisma.test.ts
 */
const hasLiveDb = Boolean(process.env.DATABASE_URL);
const describeLive = hasLiveDb ? describe : describe.skip;

// The adapter selectors read DEMO_MODE per call.
process.env.DEMO_MODE = "false";

import { getPrisma } from "../src/lib/server/prisma";
import {
  createLeadOffers,
  getLeadOffers,
  purchaseLeadOffer,
} from "../src/lib/data/lead-market-store";
import { grantCredits } from "../src/lib/data/credit-ledger";
import { saveFeeRuleSet } from "../src/lib/data/fee-rules-store";
import { prismaConfirmBookingCompletion } from "../src/lib/data/prisma-repo";
import { DEFAULT_LEAD_MARKET_CONFIG, type LeadCandidate } from "../src/lib/data/lead-market";

function candidate(workerId: string, overrides: Partial<LeadCandidate> = {}): LeadCandidate {
  return {
    workerId,
    categorySlug: "plumbing",
    citySlug: "beirut",
    rating: 4.5,
    reviewCount: 30,
    responseRate: 80,
    availableThisWeek: true,
    verified: true,
    ...overrides,
  };
}

describeLive("lead marketplace — prisma adapter (live DB)", () => {
  it("persists offers, charges once, revokes rivals and never double-charges", async () => {
    const prisma = getPrisma();
    const [khaled, other] = await Promise.all([
      prisma.worker.findFirst({ where: { slug: "khaled-al-harbi-plumbing" } }),
      prisma.worker.findFirst({
        where: { category: { slug: "plumbing" }, NOT: { slug: "khaled-al-harbi-plumbing" } },
      }),
    ]);
    if (!khaled || !other) return; // requires the seeded workforce

    // A real QuoteRequest to hang the offers on (the FK is enforced).
    const request = await prisma.quoteRequest.create({
      data: {
        number: `QR-TEST-${Date.now()}`,
        customerName: "Prisma Test Customer",
        customerPhone: "+961 70 000 000",
        jobTitle: "Lead marketplace prisma test",
        categorySlug: "plumbing",
        citySlug: "beirut",
        status: "OPEN",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const grantAmount = DEFAULT_LEAD_MARKET_CONFIG.prices.bronze + 10;
    let grantId: string | undefined;

    try {
      const grant = await grantCredits({
        workerId: khaled.id,
        amount: grantAmount,
        reason: "prisma lead test",
      });
      grantId = grant?.id;

      const first = await createLeadOffers({
        lead: { id: request.id, number: request.number, categorySlug: "plumbing", citySlug: "beirut", grade: "bronze", gradeScore: 20 },
        candidates: [candidate(khaled.id, { reviewCount: 500 }), candidate(other.id, { reviewCount: 5 })],
      });
      expect(first.created).toHaveLength(2);
      expect(first.offers).toHaveLength(2);

      // Re-running the match must not duplicate a (lead, worker) pair.
      const second = await createLeadOffers({
        lead: { id: request.id, number: request.number, categorySlug: "plumbing", citySlug: "beirut", grade: "bronze", gradeScore: 20 },
        candidates: [candidate(khaled.id, { reviewCount: 500 }), candidate(other.id, { reviewCount: 5 })],
      });
      expect(second.created).toHaveLength(0);
      expect(second.offers).toHaveLength(2);

      const mine = first.created.find((o) => o.workerId === khaled.id)!;
      const rival = first.created.find((o) => o.workerId === other.id)!;

      const purchase = await purchaseLeadOffer(mine.id, khaled.id, { planTier: "professional" });
      expect(purchase.ok).toBe(true);

      const offers = await getLeadOffers(request.id);
      expect(offers.find((o) => o.id === mine.id)!.status).toBe("purchased");
      // Exclusive by default (§9): the competing offer is withdrawn.
      expect(offers.find((o) => o.id === rival.id)!.status).toBe("revoked");
      expect(offers.find((o) => o.id === mine.id)!.creditEntryId).toBeTruthy();

      // A retry is refused and charges nothing more.
      expect(await purchaseLeadOffer(mine.id, khaled.id)).toEqual({ ok: false, error: "already-owned" });
    } finally {
      // Offers cascade with the QuoteRequest; the credit rows are cleaned by id.
      await prisma.quoteRequest.delete({ where: { id: request.id } }).catch(() => {});
      if (grantId) await prisma.workerCreditEntry.deleteMany({ where: { workerId: khaled.id, reason: "prisma lead test" } });
      await prisma.workerCreditEntry.deleteMany({ where: { workerId: khaled.id, reason: { startsWith: "Lead " } } });
    }
  });

  it("rebates the fee inside the completion transaction (§11)", async () => {
    const prisma = getPrisma();
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) return; // requires the seeded workforce

    // Pin the policy this test asserts against — append-only, so the version an
    // older snapshot points at still resolves; only the ACTIVE set changes.
    await saveFeeRuleSet({
      leadMarket: { rebate: { enabled: true, pctBps: 10_000, maxMinor: null } },
    });

    const request = await prisma.quoteRequest.create({
      data: {
        number: `QR-REBATE-${Date.now()}`,
        customerName: "Rebate Test Customer",
        customerPhone: "+961 70 000 111",
        jobTitle: "Lead rebate prisma test",
        categorySlug: "plumbing",
        citySlug: "beirut",
        status: "OPEN",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const reason = "rebate prisma test";
    let bookingId: string | undefined;

    try {
      await grantCredits({ workerId: worker.id, amount: 20, reason });
      const created = await createLeadOffers({
        lead: {
          id: request.id,
          number: request.number,
          categorySlug: "plumbing",
          citySlug: "beirut",
          grade: "bronze",
          gradeScore: 20,
        },
        candidates: [candidate(worker.id, { reviewCount: 500 })],
      });
      const offer = created.created.find((o) => o.workerId === worker.id)!;
      const purchase = await purchaseLeadOffer(offer.id, worker.id, { planTier: "professional" });
      expect(purchase).toMatchObject({ ok: true });
      const leadCostMinor = offer.priceCredits * 100;

      // A job that came from that lead, with a fee already stamped on it.
      const booking = await prisma.booking.create({
        data: {
          number: `BK-REBATE-${Date.now()}`,
          workerId: worker.id,
          customerName: "Rebate Test Customer",
          customerPhone: "+961 70 000 111",
          jobTitle: "Lead rebate prisma test",
          status: "COMPLETION_PENDING",
          quote: 30_000,
          platformFee: 2_100,
          quoteRequestId: request.id,
          currency: "USD",
        },
      });
      bookingId = booking.id;

      const done = await prismaConfirmBookingCompletion(booking.id);
      expect(done?.status).toBe("completed");
      expect(done?.leadRebateMinor).toBe(leadCostMinor);

      // The append-only row records the whole derivation, bounded by the lead's
      // own price (the smallest of share / lead cost / ceiling).
      const row = await prisma.leadRebate.findUnique({ where: { bookingId: booking.id } });
      expect(row).toMatchObject({
        leadId: request.id,
        offerId: offer.id,
        workerId: worker.id,
        leadCostMinor,
        feeMinor: 2_100,
        rebateMinor: leadCostMinor,
        effectiveFeeMinor: 2_100 - leadCostMinor,
        limitedBy: "lead-cost",
        currency: "USD",
      });
      expect(row!.ruleVersion).toBeGreaterThanOrEqual(1);

      // The rebate rides the ONE earnings row: net (quote − fee) + the rebate.
      const earning = await prisma.workerLedgerEntry.findUnique({ where: { bookingId: booking.id } });
      expect(earning?.amount).toBe(30_000 - 2_100 + leadCostMinor);
      expect(earning?.reason).toContain("Lead rebate");

      // A retried completion is refused by the status CAS — no second rebate.
      expect(await prismaConfirmBookingCompletion(booking.id)).toBeNull();
      expect(await prisma.leadRebate.count({ where: { bookingId: booking.id } })).toBe(1);
    } finally {
      if (bookingId) {
        await prisma.workerLedgerEntry.deleteMany({ where: { bookingId } });
        await prisma.leadRebate.deleteMany({ where: { bookingId } });
        await prisma.booking.delete({ where: { id: bookingId } }).catch(() => {});
      }
      await prisma.quoteRequest.delete({ where: { id: request.id } }).catch(() => {});
      await prisma.workerCreditEntry.deleteMany({ where: { workerId: worker.id, reason } });
      // The spend row (reason "Lead QR-… (bronze)") must go too, or every run
      // leaves −5 on the worker and the next run can't afford the lead.
      await prisma.workerCreditEntry.deleteMany({ where: { workerId: worker.id, reason: { startsWith: "Lead " } } });
    }
  });
});
