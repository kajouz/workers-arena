import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import {
  DEFAULT_LEAD_MARKET_CONFIG,
  contactRevealFor,
  gradeLead,
  gradeLeadRequest,
  leadBoardItemFor,
  leadCandidateFromWorker,
  leadCandidatesFromWorkers,
  leadMarketConfig,
  leadPrice,
  maskContact,
  matchLeadCandidates,
  matchReasonsFor,
  normalizeLeadMarketConfig,
  offerIsLive,
  offersToRevoke,
  revealContact,
  revealedContact,
  scoreLeadCandidate,
  splitLeadBoard,
  type LeadCandidate,
  type LeadOffer,
  type LeadSignals,
} from "../src/lib/data/lead-market";
import {
  createLeadOffers,
  expireLeadOffers,
  getLeadOffers,
  getPurchasedOffer,
  getWorkerLeadOffers,
  listLeadOffers,
  offerQualifiedLead,
  purchaseLeadOffer,
  resetLeadOfferStore,
} from "../src/lib/data/lead-market-store";
import { grantCredits, resetCreditLedgerStore, getWorkerCreditBalance } from "../src/lib/data/credit-ledger";
import { createQuoteRequest, getWorkerLeadBoard, getWorkers } from "../src/lib/data/repo";
import {
  demoAddSlot,
  demoConfirmBookingCompletion,
  demoCreateBookingRequest,
  demoRespondToBooking,
  demoTransitionBooking,
  demoGetWorkerBalance,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { listLeadRebates, resetLeadRebateStore } from "../src/lib/data/lead-rebate";
import { workerBySlug } from "../src/lib/data/workers";
import type { Booking } from "../src/lib/data/types";
import { loadActiveFeeRuleSet, resetFeeRuleStore, saveFeeRuleSet } from "../src/lib/data/fee-rules-store";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";

/**
 * §7–§10 — the qualified lead marketplace (docs/lead-marketplace.md).
 *
 *   • grading   — what makes a request bronze/silver/gold/emergency
 *   • pricing   — admin-editable, clamped, locked onto each offer
 *   • matching  — hard filters, weighted ranking, the "only a few workers" cut
 *   • ownership — exclusivity, expiry, revocation
 *   • reveal    — who may see the customer's contact details, and when
 *   • the money — a purchase debits the ledger exactly once and cannot half-happen
 */

let activityFile: string;

/** The demo worker account the dashboard and the marketplace both use. */
const DEMO_WORKER = "khaled-al-harbi-plumbing";

beforeEach(() => {
  resetLeadOfferStore();
  resetLeadRebateStore();
  resetCreditLedgerStore();
  resetFeeRuleStore();
  resetBookingsStore();
  activityFile = path.join(tmpdir(), `lead-market-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

const HOUR = 60 * 60 * 1000;
/** A fixed clock so the slot windows below are deterministic. */
const BOOKING_CLOCK = new Date("2026-09-14T09:00:00.000Z");

/**
 * Take a job off a lead through the REAL lifecycle and complete it: request →
 * accept-with-quote (which stamps the platform fee) → in progress → staged
 * completion → customer confirmation (which credits the earnings). Nothing here
 * fabricates a fee or an earnings row, so a rebate assertion is an assertion
 * about the money path, not about a fixture.
 *
 * The booking is attached to the lead the way the multi-candidate flow attaches
 * it (the winner's booking carries the QuoteRequest id), which is exactly how
 * §11 attributes a job to the lead that produced it.
 */
async function completeLeadJob(input: {
  workerId: string;
  leadId: string;
  quoteMinor: number;
  /** Distinct slot windows per caller — the overlap guard rejects two on one. */
  hourOffset: number;
}): Promise<Booking> {
  const start = new Date(BOOKING_CLOCK.getTime() + input.hourOffset * HOUR);
  const slot = demoAddSlot(
    input.workerId,
    start.toISOString(),
    new Date(start.getTime() + HOUR).toISOString(),
    "available"
  );
  const created = await demoCreateBookingRequest({
    workerId: input.workerId,
    slotId: slot.id,
    customerName: "Noor E.",
    customerPhone: "+961 70 123 456",
    customerEmail: "noor@example.com",
    jobTitle: "Job won off a marketplace lead",
  });
  if ("error" in created) throw new Error(`create failed: ${created.error}`);
  created.quoteRequestId = input.leadId;

  const accepted = await demoRespondToBooking(created.id, { accept: true, quote: input.quoteMinor });
  if (!accepted) throw new Error("accept failed");
  await demoTransitionBooking(created.id, "inProgress");
  await demoTransitionBooking(created.id, "completed"); // STAGED
  const confirmed = await demoConfirmBookingCompletion(created.id);
  if (!confirmed) throw new Error("completion confirm failed");
  return confirmed;
}

/** A worker pool for the matcher, with sensible defaults per row. */
function candidate(overrides: Partial<LeadCandidate> & { workerId: string }): LeadCandidate {
  return {
    categorySlug: "plumbing",
    citySlug: "beirut",
    rating: 4.5,
    reviewCount: 20,
    responseRate: 80,
    availableThisWeek: true,
    plan: "professional",
    emergency: false,
    verified: true,
    ...overrides,
  };
}

/** All the signals a well-qualified request carries. */
const FULL_SIGNALS: LeadSignals = {
  hasCategory: true,
  hasPricedService: true,
  hasLocation: true,
  noteLength: 200,
  isSignedIn: true,
  hasEmail: true,
  isEmergency: false,
  hasPreferredTime: true,
  photoCount: 3,
};

describe("§7 grading", () => {
  it("grades a bare \"I need a plumber\" request as BRONZE", () => {
    const result = gradeLeadRequest({ jobTitle: "I need a plumber" });
    expect(result.grade).toBe("bronze");
    expect(result.score).toBe(0);
  });

  it("grades a categorised + located request with real detail as SILVER", () => {
    const silver = gradeLeadRequest({
      jobTitle: "Kitchen sink leak",
      categorySlug: "plumbing",
      citySlug: "beirut",
      note: "The pipe under the kitchen sink drips steadily and the cabinet floor is soaked through. It started two days ago and is getting worse, please bring a replacement trap.",
    });
    expect(silver.grade).toBe("silver");
    // A guest request: no signed-in customer, no email — silver, not gold.
    expect(silver.score).toBeGreaterThanOrEqual(40);
    expect(silver.score).toBeLessThan(70);
  });

  it("grades a fully-described verified request as GOLD", () => {
    const gold = gradeLead({ ...FULL_SIGNALS });
    expect(gold.grade).toBe("gold");
    expect(gold.score).toBe(100);
  });

  it("makes EMERGENCY win outright, however short the description", () => {
    const emergency = gradeLeadRequest({
      jobTitle: "Water everywhere",
      categorySlug: "plumbing",
      citySlug: "beirut",
      isEmergency: true,
    });
    expect(emergency.grade).toBe("emergency");
  });

  it("explains the score with a per-signal breakdown that sums to it", () => {
    const result = gradeLead({ ...FULL_SIGNALS, hasEmail: false, photoCount: 0 });
    expect(result.breakdown.reduce((sum, row) => sum + row.points, 0)).toBe(result.score);
    expect(result.breakdown.find((row) => row.signal === "hasEmail")?.points).toBe(0);
    expect(result.breakdown.find((row) => row.signal === "hasCategory")?.points).toBe(15);
  });

  it("scales description and photo credit instead of granting it outright", () => {
    const short = gradeLead({ ...FULL_SIGNALS, noteLength: 0, photoCount: 0 });
    const long = gradeLead({ ...FULL_SIGNALS, noteLength: 10_000, photoCount: 99 });
    expect(long.score).toBeGreaterThan(short.score);
    // Capped: extra length/photos cannot exceed their weight.
    expect(long.score).toBe(100);
  });
});

describe("§7 pricing", () => {
  it("prices each grade from the rule set and reports the USD equivalent", () => {
    const ruleSet = { ...{}, leadMarket: { ...DEFAULT_LEAD_MARKET_CONFIG, prices: { bronze: 4, silver: 8, gold: 18, emergency: 40 } } };
    expect(leadPrice(ruleSet as never, "gold")).toEqual({ credits: 18, amountMinor: 1800 });
    expect(leadPrice(ruleSet as never, "emergency").credits).toBe(40);
  });

  it("falls back to the shipped defaults for a rule set that predates the marketplace", () => {
    expect(leadMarketConfig({} as never).prices.gold).toBe(DEFAULT_LEAD_MARKET_CONFIG.prices.gold);
  });

  it("clamps an admin's nonsense policy into a usable one", () => {
    const normalized = normalizeLeadMarketConfig({
      prices: { bronze: -5, silver: 9, gold: 999_999 } as never,
      maxWorkersPerLead: 99,
      offerTtlMinutes: 0,
      reveal: {
        beforePurchase: "revealed",
        afterPurchase: "revealed",
        afterPurchaseFreeTier: "revealed",
        afterBooking: "nonsense" as never,
      },
      weights: { category: 500, city: -3 } as never,
    });
    expect(normalized.prices.bronze).toBe(0);
    expect(normalized.prices.gold).toBe(100_000);
    expect(normalized.maxWorkersPerLead).toBe(20);
    expect(normalized.offerTtlMinutes).toBe(5);
    // An unknown reveal state falls back to the default rather than leaking.
    expect(normalized.reveal.afterBooking).toBe(DEFAULT_LEAD_MARKET_CONFIG.reveal.afterBooking);
    expect(normalized.weights.category).toBe(100);
    expect(normalized.weights.city).toBe(0);
  });
});

describe("§8 matching", () => {
  const lead = { categorySlug: "plumbing", citySlug: "beirut" };

  it("hard-filters a different trade — no weight can compensate", () => {
    const scored = scoreLeadCandidate(candidate({ workerId: "w1", categorySlug: "electrical" }), lead);
    expect(scored).toBeNull();
  });

  it("hard-filters an unavailable worker", () => {
    expect(scoreLeadCandidate(candidate({ workerId: "w1", active: false }), lead)).toBeNull();
  });

  it("hard-filters a non-emergency worker on an emergency lead", () => {
    const emergency = { ...lead, isEmergency: true };
    expect(scoreLeadCandidate(candidate({ workerId: "w1", emergency: false }), emergency)).toBeNull();
    expect(scoreLeadCandidate(candidate({ workerId: "w1", emergency: true }), emergency)).not.toBeNull();
  });

  it("ranks a stronger candidate above a weaker one and tolerates a generalist", () => {
    const strong = candidate({ workerId: "strong", rating: 5, reviewCount: 200, responseRate: 100, plan: "enterprise" });
    const weak = candidate({ workerId: "weak", rating: 3, reviewCount: 2, responseRate: 20, plan: null, verified: false, availableThisWeek: false });
    const ranked = matchLeadCandidates([weak, strong], lead, { maxWorkers: 5 });
    expect(ranked.map((r) => r.candidate.workerId)).toEqual(["strong", "weak"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("gives a lapsed subscription no plan-tier weight", () => {
    const active = leadCandidateFromWorker({
      id: "w1", categorySlug: "plumbing", citySlug: "beirut", rating: 4, reviewCount: 10,
      subscription: { plan: "enterprise", status: "active" },
    });
    const lapsed = leadCandidateFromWorker({
      id: "w2", categorySlug: "plumbing", citySlug: "beirut", rating: 4, reviewCount: 10,
      subscription: { plan: "enterprise", status: "expired" },
    });
    expect(active.plan).toBe("enterprise");
    expect(lapsed.plan).toBeNull();
  });

  it("cuts the pool to the configured number of workers", () => {
    const pool = Array.from({ length: 12 }, (_, i) => candidate({ workerId: `w${i}`, reviewCount: i }));
    const matched = matchLeadCandidates(pool, lead, { maxWorkers: 3 });
    expect(matched).toHaveLength(3);
    // Deterministic: same pool in, same order out.
    expect(matchLeadCandidates(pool, lead, { maxWorkers: 3 }).map((m) => m.candidate.workerId)).toEqual(
      matched.map((m) => m.candidate.workerId)
    );
  });

  it("never re-offers a worker who is excluded", () => {
    const pool = [candidate({ workerId: "w1" }), candidate({ workerId: "w2" })];
    const matched = matchLeadCandidates(pool, lead, { maxWorkers: 5, excludeWorkerIds: ["w1"] });
    expect(matched.map((m) => m.candidate.workerId)).toEqual(["w2"]);
  });

  it("reports the signals that actually scored, strongest first", () => {
    const scored = scoreLeadCandidate(
      candidate({ workerId: "w1", availableThisWeek: false, areaSlug: undefined }),
      lead
    )!;
    const reasons = matchReasonsFor(scored.breakdown);
    expect(reasons[0]).toBe("category");
    expect(reasons).not.toContain("availability");
  });

  it("maps worker rows onto candidates (verified/emergency/area carried over)", () => {
    const [mapped] = leadCandidatesFromWorkers([
      { id: "w1", categorySlug: "plumbing", citySlug: "beirut", areaSlug: "hamra", rating: 4, reviewCount: 5, emergency: true, verified: true, responseRate: 55 },
    ]);
    expect(mapped).toMatchObject({ workerId: "w1", areaSlug: "hamra", emergency: true, verified: true, responseRate: 55 });
  });
});

describe("§9 ownership & expiry", () => {
  const offer: LeadOffer = {
    id: "offer-1",
    leadId: "qr-1",
    leadNumber: "QR-2026-00001",
    workerId: "w1",
    grade: "gold",
    matchScore: 80,
    priceCredits: 20,
    status: "offered",
    exclusive: true,
    offeredAt: "2026-09-14T10:00:00.000Z",
    expiresAt: "2026-09-14T12:00:00.000Z",
  };
  const at = Date.parse("2026-09-14T11:00:00.000Z");

  it("treats an offer inside its window as live and one past it as dead", () => {
    expect(offerIsLive(offer, at)).toBe(true);
    expect(offerIsLive(offer, Date.parse("2026-09-14T12:00:01.000Z"))).toBe(false);
    expect(offerIsLive({ ...offer, status: "purchased" }, at)).toBe(false);
  });

  it("revokes only the OTHER live offers when an exclusive purchase lands", () => {
    const others: LeadOffer[] = [
      { ...offer, id: "offer-2", workerId: "w2" },
      { ...offer, id: "offer-3", workerId: "w3", status: "purchased" },
      { ...offer, id: "offer-4", workerId: "w4", expiresAt: "2026-09-14T09:00:00.000Z" },
    ];
    const revoked = offersToRevoke([offer, ...others], "offer-1", at);
    expect(revoked).toEqual(["offer-2"]);
  });
});

describe("§10 contact reveal", () => {
  const policy = DEFAULT_LEAD_MARKET_CONFIG.reveal;

  it("hides the contact before purchase, at whatever level the policy sets", () => {
    expect(contactRevealFor({ policy })).toBe("masked");
    expect(contactRevealFor({ policy: { ...policy, beforePurchase: "hidden" } })).toBe("hidden");
  });

  it("reveals to a paying worker but holds a free-tier buyer at the tier lever", () => {
    expect(contactRevealFor({ policy, purchased: true, planTier: "professional" })).toBe("revealed");
    expect(contactRevealFor({ policy, purchased: true, planTier: "free" })).toBe("masked");
  });

  it("always reveals once the job is actually booked (customer consent)", () => {
    expect(contactRevealFor({ policy: { ...policy, beforePurchase: "hidden" }, booked: true })).toBe("revealed");
  });

  it("masks a phone keeping only its last two digits and an email keeping its head", () => {
    // Compact phone is 12 chars → 10 dots + the final two digits.
    expect(maskContact("+961 70 111 222")).toBe("••••••••••22");
    expect(maskContact("sara@example.com")).toBe("s••••@example.com");
    expect(maskContact("")).toBe("");
  });

  it("resolves a value under each reveal state", () => {
    expect(revealContact("+961 70 111 222", "revealed")).toBe("+961 70 111 222");
    expect(revealContact("+961 70 111 222", "hidden")).toBe("");
    expect(revealedContact({ reveal: "hidden", name: "Sara", phone: "70" }).name).toBe("");
    expect(revealedContact({ reveal: "masked", name: "Sara", phone: "+961 70 111 222" }).bookedValue).toBe(false);
  });

  it("builds a board row whose contact is masked before purchase and full after", () => {
    const base = {
      lead: {
        id: "qr-1", number: "QR-2026-00001", jobTitle: "Leaking sink",
        categorySlug: "plumbing", citySlug: "beirut",
      },
      policy,
      customer: { name: "Sara Customer", phone: "+961 70 111 222", email: "sara@example.com" },
      now: Date.parse("2026-09-14T11:00:00.000Z"),
    };
    const before = leadBoardItemFor({ ...base, offer: offerFixture() });
    expect(before.reveal).toBe("masked");
    expect(before.contact.phone).toBe("••••••••••22");
    expect(before.contact.email).toBe("s••••@example.com");

    const after = leadBoardItemFor({
      ...base,
      offer: { ...offerFixture(), status: "purchased", purchasedAt: "2026-09-14T11:15:00.000Z", priceCredits: 20 },
      planTier: "professional",
    });
    expect(after.reveal).toBe("revealed");
    expect(after.contact.phone).toBe("+961 70 111 222");
    expect(after.purchased).toBe(true);
    // Buying does not stop the clock the offer was quoted under (the row still
    // reports the window it was sold in), but it is no longer buyable.
    expect(after.minutesLeft).toBe(60);
    expect(after.live).toBe(false);
  });

  it("splits the board into live / owned / past, best match first", () => {
    const now = Date.parse("2026-09-14T11:00:00.000Z");
    const live = { ...offerFixture(), id: "o1", matchScore: 90 };
    const weaker = { ...offerFixture(), id: "o2", matchScore: 40 };
    const dead = { ...offerFixture(), id: "o3", status: "expired" as const };
    const owned = { ...offerFixture(), id: "o4", status: "purchased" as const };
    const mk = (offer: LeadOffer) =>
      leadBoardItemFor({
        offer,
        lead: { id: "qr-1", number: "QR-2026-00001", jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
        policy,
        now,
      });
    const split = splitLeadBoard([weaker, dead, live, owned].map(mk));
    expect(split.live.map((i) => i.offer.id)).toEqual(["o1", "o2"]);
    expect(split.owned.map((i) => i.offer.id)).toEqual(["o4"]);
    expect(split.past.map((i) => i.offer.id)).toEqual(["o3"]);
  });
});

/** A neutral offered lead offer (module-scope so the tests above can reuse it). */
function offerFixture(): LeadOffer {
  return {
    id: "offer-1",
    leadId: "qr-1",
    leadNumber: "QR-2026-00001",
    workerId: "w1",
    grade: "gold",
    matchScore: 80,
    priceCredits: 20,
    status: "offered",
    exclusive: true,
    offeredAt: "2026-09-14T10:00:00.000Z",
    expiresAt: "2026-09-14T12:00:00.000Z",
  };
}

describe("§7–§9 the marketplace store", () => {
  const lead = { id: "qr-100", number: "QR-2026-00100" };

  it("offers a graded lead only to the few best-matched workers", async () => {
    const pool = [
      candidate({ workerId: "w1", reviewCount: 300, rating: 5 }),
      candidate({ workerId: "w2", reviewCount: 100, rating: 4.8 }),
      candidate({ workerId: "w3", reviewCount: 40, rating: 4.5 }),
      candidate({ workerId: "w4", reviewCount: 5, rating: 4 }),
    ];
    const result = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Full bathroom re-pipe", categorySlug: "plumbing", citySlug: "beirut", note: "Long detailed note".repeat(10), customerId: "u-customer", customerEmail: "c@example.com" },
      candidates: pool,
    });
    expect(result.grade.grade).toBe("gold");
    expect(result.created).toHaveLength(DEFAULT_LEAD_MARKET_CONFIG.maxWorkersPerLead);
    expect(result.created[0]!.workerId).toBe("w1");
    expect(result.created[0]!.priceCredits).toBe(DEFAULT_LEAD_MARKET_CONFIG.prices.gold);
  });

  it("never sells a lead to a worker the customer already invited", async () => {
    const result = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" }), candidate({ workerId: "w2" })],
      invitedWorkerIds: ["w1"],
    });
    expect(result.created.map((o) => o.workerId)).toEqual(["w2"]);
  });

  it("is idempotent: re-running a match adds no offer and does not re-price", async () => {
    // A GOLD request (category + area + long detail + verified customer).
    const input = {
      lead: {
        ...lead,
        jobTitle: "Full bathroom re-pipe",
        categorySlug: "plumbing",
        citySlug: "beirut",
        note: "Two bathrooms need new supply lines and shut-off valves before we tile. I have photos of the layout and a budget in mind. Weekday mornings work best for us.",
        customerId: "u-customer",
        customerEmail: "c@example.com",
      },
      candidates: [candidate({ workerId: "w1" })],
    };
    const first = await offerQualifiedLead(input);
    expect(first.grade.grade).toBe("gold");
    expect(first.created).toHaveLength(1);
    expect(first.created[0]!.priceCredits).toBe(DEFAULT_LEAD_MARKET_CONFIG.prices.gold);

    // The price changes under the offer's feet for BOTH the offer and the
    // policy it was quoted from — the live offer must not move either way.
    await saveFeeRuleSet({ leadMarket: { prices: { bronze: 5, silver: 9, gold: 99, emergency: 35 } } });
    expect(leadPrice(await loadActiveFeeRuleSet(), "gold").credits).toBe(99);

    const second = await createLeadOffers({
      lead: { ...lead, categorySlug: "plumbing", citySlug: "beirut", grade: "gold", gradeScore: 100 },
      candidates: input.candidates,
    });
    expect(second.created).toHaveLength(0);
    expect(second.offers).toHaveLength(1);
    expect(second.offers[0]!.priceCredits).toBe(DEFAULT_LEAD_MARKET_CONFIG.prices.gold);
    expect(second.offers[0]!.grade).toBe("gold");
  });

  it("carries the lead-market policy forward when the take rate is republished", async () => {
    // Regression: `normalizeFeeRuleSet` is the take-rate normalizer and does not
    // know about the marketplace, so a fee-rule publish must not reset the
    // lead policy back to the shipped defaults.
    await saveFeeRuleSet({ leadMarket: { maxWorkersPerLead: 7, exclusive: false, prices: { bronze: 1, silver: 2, gold: 3, emergency: 4 } } });
    const published = await saveFeeRuleSet({ defaults: { rateBps: 500, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false } });
    expect(published.leadMarket?.maxWorkersPerLead).toBe(7);
    expect(published.leadMarket?.exclusive).toBe(false);
    expect(published.leadMarket?.prices.gold).toBe(3);
    expect(published.defaults.rateBps).toBe(500);
  });

  it("refuses a purchase with no credits, and leaves the offer untouched", async () => {
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
    });
    const result = await purchaseLeadOffer(created[0]!.id, "w1");
    expect(result).toEqual({ ok: false, error: "insufficient-credits" });
    const offers = await getLeadOffers(lead.id);
    expect(offers[0]!.status).toBe("offered");
    expect((await getWorkerCreditBalance("w1")).balance).toBe(0);
  });

  it("charges once, unlocks the contact per the policy, and revokes the rivals", async () => {
    await grantCredits({ workerId: "w1", amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" }), candidate({ workerId: "w2", reviewCount: 5 })],
    });
    const mine = created.find((o) => o.workerId === "w1")!;
    const result = await purchaseLeadOffer(mine.id, "w1", { planTier: "professional" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("purchase failed");
    expect(result.reveal).toBe("revealed");
    expect((await getWorkerCreditBalance("w1")).balance).toBe(100 - mine.priceCredits);

    const offers = await getLeadOffers(lead.id);
    expect(offers.find((o) => o.workerId === "w1")!.status).toBe("purchased");
    // Exclusive by default: the rival's pending offer is withdrawn.
    expect(offers.find((o) => o.workerId === "w2")!.status).toBe("revoked");
    expect(await getPurchasedOffer(lead.id, "w1")).not.toBeNull();

    // A retry cannot double-charge.
    expect(await purchaseLeadOffer(mine.id, "w1")).toEqual({ ok: false, error: "already-owned" });
    expect((await getWorkerCreditBalance("w1")).balance).toBe(100 - mine.priceCredits);
  });

  it("never lets a worker buy someone else's offer", async () => {
    await grantCredits({ workerId: "w2", amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
    });
    expect(await purchaseLeadOffer(created[0]!.id, "w2")).toEqual({ ok: false, error: "not-found" });
  });

  it("refuses an offer whose window has closed", async () => {
    await grantCredits({ workerId: "w1", amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
      at: "2026-09-14T10:00:00.000Z",
    });
    const late = await purchaseLeadOffer(created[0]!.id, "w1", { at: "2026-09-14T23:00:00.000Z" });
    expect(late).toEqual({ ok: false, error: "not-live" });
  });

  it("shares the lead when exclusivity is off (competing offers survive)", async () => {
    await saveFeeRuleSet({ leadMarket: { exclusive: false } });
    await grantCredits({ workerId: "w1", amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" }), candidate({ workerId: "w2", reviewCount: 5 })],
    });
    await purchaseLeadOffer(created.find((o) => o.workerId === "w1")!.id, "w1");
    const offers = await getLeadOffers(lead.id);
    expect(offers.find((o) => o.workerId === "w2")!.status).toBe("offered");
  });

  it("expires offers past their window (the cron twin)", async () => {
    await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
      at: "2026-09-14T10:00:00.000Z",
    });
    expect(await expireLeadOffers(new Date("2026-09-14T11:00:00.000Z"))).toBe(0);
    expect(await expireLeadOffers(new Date("2026-09-14T23:00:00.000Z"))).toBe(1);
    const offers = await getLeadOffers(lead.id);
    expect(offers[0]!.status).toBe("expired");
  });

  it("lists a worker's own offers live-first and audits recent offers", async () => {
    await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
      at: "2026-09-14T10:00:00.000Z",
    });
    const mine = await getWorkerLeadOffers("w1", new Date("2026-09-14T10:30:00.000Z"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.workerId).toBe("w1");
    expect(await getWorkerLeadOffers("w9")).toHaveLength(0);
    expect(await listLeadOffers(10)).toHaveLength(1);
  });

  it("carries the customer's emergency flag from creation through to the EMERGENCY grade", async () => {
    // Regression: the flag was dropped by both adapters when the request was
    // created, so no posted request could ever grade as an emergency lead.
    const [plumbing, electrical] = await Promise.all([
      getWorkers({ category: "plumbing", city: "beirut" }),
      getWorkers({ category: "electrical", city: "beirut" }),
    ]);
    const plumber = plumbing.items[0];
    const invited = electrical.items[0];
    if (!plumber || !invited) throw new Error("demo workforce missing");

    // Invite the OTHER trade so the plumber is the unmatched professional the
    // marketplace offers the lead to (the demo has one worker per trade).
    const urgent = await createQuoteRequest(
      {
        customerName: "Test Customer",
        customerPhone: "+96170000000",
        jobTitle: "Burst pipe flooding the kitchen",
        categorySlug: "plumbing",
        citySlug: "beirut",
        isEmergency: true,
      },
      [invited.id]
    );
    if ("error" in urgent) throw new Error("quote request rejected");
    expect(urgent.isEmergency).toBe(true);

    const urgentOffers = await getLeadOffers(urgent.id);
    expect(urgentOffers.length).toBeGreaterThan(0);
    expect(urgentOffers[0]!.workerId).toBe(plumber.id);
    expect(urgentOffers[0]!.grade).toBe("emergency");

    // A calm request on the same trade is graded on its content, not urgency.
    const calm = await createQuoteRequest(
      {
        customerName: "Test Customer",
        customerPhone: "+96170000001",
        jobTitle: "I need a plumber",
        categorySlug: "plumbing",
        citySlug: "beirut",
      },
      [invited.id]
    );
    if ("error" in calm) throw new Error("quote request rejected");
    expect(calm.isEmergency).toBe(false);
    const calmOffers = await getLeadOffers(calm.id);
    expect(calmOffers[0]!.grade).not.toBe("emergency");
  });

  it("rebates the platform fee on the job a bought lead produced (§11)", async () => {
    // The loop this feature exists for: a worker buys a lead, wins the job, and
    // the fee on that job comes back — so the effective take rate falls by what
    // the lead cost, while the platform still keeps whatever the fee exceeded
    // it by (it is never out of pocket selling the lead).
    const worker = workerBySlug(DEMO_WORKER)!;
    await grantCredits({ workerId: worker.id, amount: 100, reason: "seed" });

    // A real customer post: the demo workforce has one worker per trade, so the
    // customer invites the ELECTRICIAN and the plumber becomes the unmatched
    // professional the marketplace offers the lead to.
    const other = (await getWorkers({ category: "electrical", city: "beirut" })).items[0]!;
    const request = await createQuoteRequest(
      {
        customerName: "Noor E.",
        customerPhone: "+961 70 123 456",
        customerEmail: "noor@example.com",
        jobTitle: "Full bathroom re-pipe",
        // Long enough for the full 15 description points — with the trade, the
        // area, a signed-in customer and an email that is exactly 70 (GOLD).
        note: "Two bathrooms need new supply lines and shut-off valves before we tile the walls. I have photos of the current layout and a budget in mind for labour, and weekday mornings work best for us.",
        customerId: "u-customer",
        categorySlug: "plumbing",
        citySlug: "beirut",
      },
      [other.id]
    );
    if ("error" in request) throw new Error(`post failed: ${request.error}`);

    const mine = (await getLeadOffers(request.id)).find((o) => o.workerId === worker.id)!;
    expect(mine.grade).toBe("gold");
    expect(await purchaseLeadOffer(mine.id, worker.id, { planTier: "professional" })).toMatchObject({ ok: true });

    // Win the job off that lead and complete it through the REAL lifecycle:
    // the accept stamps the fee, the completion credits the earnings.
    const done = await completeLeadJob({ workerId: worker.id, leadId: request.id, quoteMinor: 30_000, hourOffset: 40 });
    const fee = done.platformFee!;
    expect(fee).toBeGreaterThan(0);

    const rebates = await listLeadRebates(10);
    expect(rebates).toHaveLength(1);
    expect(rebates[0]).toMatchObject({
      bookingId: done.id,
      leadId: mine.leadId,
      offerId: mine.id,
      workerId: worker.id,
      leadCostCredits: mine.priceCredits,
      leadCostMinor: mine.priceCredits * 100,
      feeMinor: fee,
      // The lead's own price ($20) is below the fee ($21) → the lead-cost cap
      // decides, and the platform still keeps the remaining $1.
      rebateMinor: mine.priceCredits * 100,
      effectiveFeeMinor: fee - mine.priceCredits * 100,
      limitedBy: "lead-cost",
      ruleId: expect.any(String),
      ruleVersion: 1,
    });

    // The money rides the ONE earnings row per booking (quote − fee + rebate),
    // so the worker's spendable balance proves it landed (the ledger row is
    // unique per booking — there is no second credit to find).
    expect(demoGetWorkerBalance(worker.id).availableMinor).toBe(30_000 - fee + mine.priceCredits * 100);
    // …and the booking carries the number for display.
    expect(done.leadRebateMinor).toBe(mine.priceCredits * 100);
    // The credits were spent; the rebate is money, not credits, so the balance
    // is unchanged by the rebate and only the purchase moved it.
    expect((await getWorkerCreditBalance(worker.id)).balance).toBe(100 - mine.priceCredits);

    // The board marks the lead as having paid for itself.
    const board = await getWorkerLeadBoard(worker.id);
    expect(board.rebates).toEqual({ totalMinor: mine.priceCredits * 100, count: 1 });
    expect(board.owned.find((i) => i.offer.id === mine.id)?.rebateMinor).toBe(mine.priceCredits * 100);
  });

  it("caps the rebate at the FEE when the fee is the smaller number", async () => {
    const worker = workerBySlug(DEMO_WORKER)!;
    await grantCredits({ workerId: worker.id, amount: 100, reason: "seed" });
    // A GOLD lead ($20).
    const { created } = await offerQualifiedLead({
      lead: {
        id: "qr-small",
        number: "QR-2026-00078",
        jobTitle: "Bathroom re-pipe",
        categorySlug: "plumbing",
        citySlug: "beirut",
        note: "Two bathrooms need new supply lines and shut-off valves before we tile the walls. I have photos of the current layout and a budget in mind for labour.",
        customerId: "u-customer",
        customerEmail: "c@example.com",
      },
      candidates: [candidate({ workerId: worker.id })],
    });
    const mine = created.find((o) => o.workerId === worker.id)!;
    expect(mine.grade).toBe("gold");
    await purchaseLeadOffer(mine.id, worker.id);

    // A modest job: 7% of $100 is $7 — BELOW the $20 lead — so the fee is the
    // cap, the platform keeps nothing, and the worker is made whole on the lead.
    const done = await completeLeadJob({ workerId: worker.id, leadId: mine.leadId, quoteMinor: 10_000, hourOffset: 41 });
    const fee = done.platformFee!;
    expect(fee).toBe(700);
    expect(fee).toBeLessThan(mine.priceCredits * 100);

    const rebate = (await listLeadRebates(10)).find((r) => r.leadId === mine.leadId)!;
    expect(rebate.rebateMinor).toBe(fee);
    expect(rebate.effectiveFeeMinor).toBe(0);
    expect(rebate.limitedBy).toBe("fee");
    // Net is simply the quote: the fee was entirely rebated.
    expect(demoGetWorkerBalance(worker.id).availableMinor).toBe(10_000);
  });

  it("rebates nothing for a job on a lead the worker did NOT buy", async () => {
    const worker = workerBySlug(DEMO_WORKER)!;
    await grantCredits({ workerId: worker.id, amount: 100, reason: "seed" });
    // An offer exists but was never purchased — the job is the worker's own.
    const { created } = await offerQualifiedLead({
      lead: { id: "qr-unbought", number: "QR-2026-00080", jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: worker.id })],
    });
    const offer = created.find((o) => o.workerId === worker.id)!;
    const done = await completeLeadJob({ workerId: worker.id, leadId: offer.leadId, quoteMinor: 30_000, hourOffset: 42 });
    expect(done.leadRebateMinor ?? 0).toBe(0);
    expect(await listLeadRebates(10)).toHaveLength(0);
    expect(demoGetWorkerBalance(worker.id).availableMinor).toBe(30_000 - done.platformFee!);
  });

  it("charges the stamped fee in full when the rebate is switched off", async () => {
    const worker = workerBySlug(DEMO_WORKER)!;
    await saveFeeRuleSet({ leadMarket: { rebate: { enabled: false, pctBps: 10_000, maxMinor: null } } });
    await grantCredits({ workerId: worker.id, amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { id: "qr-off", number: "QR-2026-00079", jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: worker.id })],
    });
    const mine = created.find((o) => o.workerId === worker.id)!;
    await purchaseLeadOffer(mine.id, worker.id);
    const done = await completeLeadJob({ workerId: worker.id, leadId: mine.leadId, quoteMinor: 30_000, hourOffset: 43 });
    expect(await listLeadRebates(10)).toHaveLength(0);
    expect(done.leadRebateMinor ?? 0).toBe(0);
    expect(demoGetWorkerBalance(worker.id).availableMinor).toBe(30_000 - done.platformFee!);
  });

  it("honours a share-of-fee policy and a per-job ceiling", async () => {
    const worker = workerBySlug(DEMO_WORKER)!;
    // Half the fee, never more than $10.
    await saveFeeRuleSet({ leadMarket: { rebate: { enabled: true, pctBps: 5_000, maxMinor: 1_000 } } });
    await grantCredits({ workerId: worker.id, amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: {
        id: "qr-share",
        number: "QR-2026-00081",
        jobTitle: "Bathroom re-pipe",
        categorySlug: "plumbing",
        citySlug: "beirut",
        note: "Two bathrooms need new supply lines and shut-off valves before we tile the walls. I have photos of the current layout and a budget in mind for labour.",
        customerId: "u-customer",
        customerEmail: "c@example.com",
      },
      candidates: [candidate({ workerId: worker.id })],
    });
    const mine = created.find((o) => o.workerId === worker.id)!;
    await purchaseLeadOffer(mine.id, worker.id);
    const done = await completeLeadJob({ workerId: worker.id, leadId: mine.leadId, quoteMinor: 30_000, hourOffset: 44 });
    const fee = done.platformFee!;

    // 50% of a $21 fee is $10.50, but the $10 ceiling wins.
    const rebate = (await listLeadRebates(10)).find((r) => r.leadId === mine.leadId)!;
    expect(rebate.pctBps).toBe(5_000);
    expect(rebate.maxMinor).toBe(1_000);
    expect(rebate.rebateMinor).toBe(1_000);
    expect(rebate.effectiveFeeMinor).toBe(fee - 1_000);
    expect(rebate.limitedBy).toBe("ceiling");
  });

  it("records an audit entry when a lead is purchased", async () => {
    await grantCredits({ workerId: "w1", amount: 100, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { ...lead, jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [candidate({ workerId: "w1" })],
    });
    await purchaseLeadOffer(created[0]!.id, "w1");
    const feed = await getAdminActivityFeed();
    expect(feed.some((e) => e.code === "LEAD_PURCHASED")).toBe(true);
  });
});
