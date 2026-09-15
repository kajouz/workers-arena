import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import {
  DEFAULT_FEE_RULE_SET,
  FEE_LADDER_PRESET,
  buildFeeSnapshot,
  computeFee,
  feePromotionActive,
  feePromotionMatches,
  mergeFeeRule,
  normalizeFeeRuleSet,
  normalizePromotions,
  planTierFor,
  priceJob,
  resolveFeeRule,
  tierRateTable,
  type FeeRuleSet,
} from "../src/lib/data/fee-rules";
import {
  activeFeeRuleSetSync,
  feePromotionAttribution,
  listFeeSnapshots,
  resetFeeRuleStore,
  saveFeeRuleSet,
} from "../src/lib/data/fee-rules-store";
import { computePlatformFee, isPlanFeeExempt } from "../src/lib/data/booking-ui";
import { resetBookingsStore } from "../src/lib/data/bookings";
import { respondToBooking, getWorkerBookings, getWorkerSlots } from "../src/lib/data/repo";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { workerBySlug } from "../src/lib/data/workers";

/**
 * §5/§6 — the platform fee engine (docs/fee-rules.md).
 *
 * Two classes of test live here:
 *  • the PURE engine (determinism, precedence, rounding, clamps, normalization)
 *  • the ADAPTER stamp (a quoted accept stores the snapshot, the active rule
 *    set drives the amount, and a later pricing change never rewrites it)
 */

const DEMO_WORKER = "khaled-al-harbi-plumbing";

function khaled() {
  const w = workerBySlug(DEMO_WORKER);
  if (!w) throw new Error("demo worker missing");
  return w;
}

let activityFile: string;

beforeEach(() => {
  resetBookingsStore();
  resetFeeRuleStore();
  activityFile = path.join(tmpdir(), `fee-rules-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("plan tiers", () => {
  it("maps the existing subscription plans onto the monetization tiers", () => {
    expect(planTierFor("basic")).toBe("starter");
    expect(planTierFor("PROFESSIONAL")).toBe("professional");
    expect(planTierFor("premium")).toBe("growth");
    expect(planTierFor("ENTERPRISE")).toBe("business");
    // No subscription = the acquisition tier, never a crash.
    expect(planTierFor(undefined)).toBe("free");
    expect(planTierFor("unknown-plan")).toBe("free");
  });
});

describe("computeFee — the money math", () => {
  const rule = { rateBps: 700, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false };

  it("takes the plain percentage of the quote", () => {
    expect(computeFee(8_000, rule).feeMinor).toBe(560);
    expect(computeFee(100_000, rule).feeMinor).toBe(7_000);
  });

  it("rounds half-up to the nearest minor unit", () => {
    // 0.5% of 2500 = 12.5 → floor applies; use a rate with a true half.
    const half = { ...rule, minMinor: 0 };
    // 123 * 125 / 10000 = 1.5375 → 2
    expect(computeFee(123, { ...half, rateBps: 125 }).feeMinor).toBe(2);
    // 100 * 125 / 10000 = 1.25 → 1
    expect(computeFee(100, { ...half, rateBps: 125 }).feeMinor).toBe(1);
  });

  it("applies the floor and reports that it bit", () => {
    const result = computeFee(1_000, rule); // 7% of $10 = $0.70 → floor $5
    expect(result.feeMinor).toBe(500);
    expect(result.minApplied).toBe(true);
    expect(result.maxApplied).toBe(false);
  });

  it("applies the cap and reports that it bit", () => {
    const result = computeFee(1_000_000, rule); // 7% of $10,000 = $700 → cap $300
    expect(result.feeMinor).toBe(30_000);
    expect(result.maxApplied).toBe(true);
    expect(result.minApplied).toBe(false);
  });

  it("adds the flat component after clamping, but never charges more than the job", () => {
    expect(computeFee(8_000, { ...rule, fixedMinor: 200 }).feeMinor).toBe(760);
    expect(computeFee(300, { ...rule, fixedMinor: 0 }).feeMinor).toBe(300); // floor > quote → capped at the quote
  });

  it("is zero for an exempt rule, a zero/negative quote, or a non-finite quote", () => {
    expect(computeFee(8_000, { ...rule, exempt: true }).feeMinor).toBe(0);
    expect(computeFee(0, rule).feeMinor).toBe(0);
    expect(computeFee(-100, rule).feeMinor).toBe(0);
    expect(computeFee(Number.NaN, rule).feeMinor).toBe(0);
  });

  it("treats a null cap as uncapped", () => {
    const uncapped = computeFee(1_000_000, { ...rule, maxMinor: null });
    expect(uncapped.feeMinor).toBe(70_000);
    expect(uncapped.maxApplied).toBe(false);
  });

  it("never uses floating point drift for large quotes", () => {
    const { feeMinor } = computeFee(999_999_999, { ...rule, maxMinor: null });
    expect(Number.isInteger(feeMinor)).toBe(true);
    expect(feeMinor).toBe(Math.round((999_999_999 * 700) / 10_000));
  });
});

describe("computePlatformFee — backward compatibility", () => {
  it("still answers the shipped M5 numbers (7%, min $5, max $300)", () => {
    expect(computePlatformFee(8_000)).toBe(560);
    expect(computePlatformFee(1_000)).toBe(500);
    expect(computePlatformFee(1_000_000)).toBe(30_000);
    expect(computePlatformFee(8_000, { exempt: true })).toBe(0);
    expect(computePlatformFee(0)).toBe(0);
  });

  it("keeps the legacy exemption truth for enterprise plans", () => {
    expect(isPlanFeeExempt("enterprise")).toBe(true);
    expect(isPlanFeeExempt("ENTERPRISE")).toBe(true);
    expect(isPlanFeeExempt("professional")).toBe(false);
    expect(isPlanFeeExempt(undefined)).toBe(false);
  });
});

describe("resolveFeeRule — layer precedence", () => {
  const ladder: FeeRuleSet = {
    ...DEFAULT_FEE_RULE_SET,
    planTiers: FEE_LADDER_PRESET,
    categories: { plumbing: { rateBps: 600 } },
    emergency: { rateBps: 1000, minMinor: 1000 },
    promotions: [],
  };

  it("uses the default when nothing else applies", () => {
    const base: FeeRuleSet = { ...DEFAULT_FEE_RULE_SET, planTiers: {} };
    const { rule, sources } = resolveFeeRule(base, {});
    expect(rule.rateBps).toBe(700);
    expect(sources).toEqual(["default"]);
  });

  it("applies the plan tier rate", () => {
    const { rule, sources } = resolveFeeRule(ladder, { plan: "premium" }); // premium → growth
    expect(rule.rateBps).toBe(500);
    expect(sources).toContain("plan-tier");
  });

  it("lets a category override beat the plan tier", () => {
    const { rule, sources } = resolveFeeRule(ladder, { plan: "premium", categorySlug: "plumbing" });
    expect(rule.rateBps).toBe(600);
    expect(sources).toEqual(["default", "plan-tier", "category"]);
  });

  it("lets an emergency override beat the category", () => {
    const { rule } = resolveFeeRule(ladder, { plan: "premium", categorySlug: "plumbing", emergency: true });
    expect(rule.rateBps).toBe(1000);
    expect(rule.minMinor).toBe(1000);
  });

  it("lets a matching promotion beat everything but an exemption", () => {
    const set: FeeRuleSet = {
      ...ladder,
      promotions: [
        {
          id: "launch",
          label: "Launch 2%",
          rateBps: 200,
          planTier: "growth",
          categorySlug: "plumbing",
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-12-31T00:00:00.000Z",
        },
      ],
    };
    const { rule, promotionId, sources } = resolveFeeRule(set, {
      plan: "premium",
      categorySlug: "plumbing",
      emergency: true,
      at: "2026-06-01T00:00:00.000Z",
    });
    expect(rule.rateBps).toBe(200);
    expect(promotionId).toBe("launch");
    expect(sources).toContain("promotion");
  });

  it("ignores a promotion outside its window or scope", () => {
    const set: FeeRuleSet = {
      ...ladder,
      promotions: [{ id: "winter", label: "Winter", rateBps: 100, endsAt: "2026-03-01T00:00:00.000Z" }],
    };
    expect(resolveFeeRule(set, { plan: "professional", at: "2026-06-01T00:00:00.000Z" }).rule.rateBps).toBe(700);
    expect(resolveFeeRule(set, { plan: "professional", at: "2026-02-01T00:00:00.000Z" }).rule.rateBps).toBe(100);
  });

  it("keeps the first matching promotion (most specific first) and matches codes case-insensitively", () => {
    const set: FeeRuleSet = {
      ...DEFAULT_FEE_RULE_SET,
      promotions: [
        { id: "narrow", label: "Narrow", rateBps: 100, promoCode: "WELCOME" },
        { id: "broad", label: "Broad", rateBps: 900 },
      ],
    };
    expect(resolveFeeRule(set, { promoCode: "welcome" }).promotionId).toBe("narrow");
    expect(resolveFeeRule(set, { promoCode: "welcome" }).rule.rateBps).toBe(100);
    expect(resolveFeeRule(set, {}).promotionId).toBe("broad");
    // A code-scoped promotion never fires without its code.
    expect(resolveFeeRule(set, { promoCode: "other" }).promotionId).toBe("broad");
  });

  it("treats a plan exemption as absolute — no promotion can re-charge a waived plan", () => {
    const set: FeeRuleSet = {
      ...DEFAULT_FEE_RULE_SET,
      promotions: [{ id: "surge", label: "Surge", rateBps: 2000 }],
    };
    const { rule, sources } = resolveFeeRule(set, { plan: "enterprise", promoCode: "surge" });
    expect(rule.exempt).toBe(true);
    expect(rule.rateBps).toBe(700); // the recorded rate, even though the fee is 0
    expect(sources).toEqual(["plan-exempt"]);
    expect(computeFee(80_000, rule).feeMinor).toBe(0);
  });
});

describe("promotion matching helpers", () => {
  const ctxNow = Date.parse("2026-06-01T00:00:00.000Z");

  it("treats an open-ended window as always active", () => {
    expect(feePromotionActive({ id: "p", label: "p", rateBps: 0 }, ctxNow)).toBe(true);
    expect(feePromotionActive({ id: "p", label: "p", rateBps: 0, startsAt: "2026-07-01" }, ctxNow)).toBe(false);
    expect(feePromotionActive({ id: "p", label: "p", rateBps: 0, endsAt: "2026-07-01" }, ctxNow)).toBe(true);
  });

  it("requires every set scope field to match", () => {
    const promo = { id: "p", label: "p", rateBps: 0, planTier: "growth" as const, categorySlug: "ac" };
    expect(feePromotionMatches(promo, { categorySlug: "ac" }, "growth")).toBe(true);
    expect(feePromotionMatches(promo, { categorySlug: "ac" }, "free")).toBe(false);
    expect(feePromotionMatches(promo, { categorySlug: "plumbing" }, "growth")).toBe(false);
  });
});

describe("mergeFeeRule / normalizeFeeRuleSet — untrusted config", () => {
  it("never lets an override erase a field it does not set", () => {
    const merged = mergeFeeRule({ rateBps: 700, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false }, { rateBps: 900 });
    expect(merged).toEqual({ rateBps: 900, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false });
  });

  it("distinguishes an explicit null cap from 'not overridden'", () => {
    const merged = mergeFeeRule({ rateBps: 700, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false }, { maxMinor: null });
    expect(merged.maxMinor).toBeNull();
  });

  it("clamps absurd stored values and drops malformed promotions", () => {
    const normalized = normalizeFeeRuleSet({
      id: "fee-rules-v9",
      version: 9,
      defaults: { rateBps: 999_999, minMinor: -50, maxMinor: -1, fixedMinor: -3, exempt: false },
      planTiers: { growth: { rateBps: 500 }, bogus: { rateBps: 100 } } as never,
      promotions: [{ id: "", label: "", rateBps: 0 }],
    });
    expect(normalized.defaults.rateBps).toBe(10_000);
    expect(normalized.defaults.minMinor).toBe(0);
    expect(normalized.defaults.fixedMinor).toBe(0);
    expect(normalized.defaults.maxMinor).toBeGreaterThanOrEqual(normalized.defaults.minMinor);
    expect(Object.keys(normalized.planTiers)).toEqual(["growth"]);
    expect(normalized.promotions).toEqual([]);
  });
});

describe("buildFeeSnapshot — the §6 record", () => {
  it("records every input of the calculation, deterministically", () => {
    const { resolved, computation } = priceJob(DEFAULT_FEE_RULE_SET, 8_000, { plan: "professional" });
    const snapshot = buildFeeSnapshot({
      id: "snap-1",
      jobId: "bk-1",
      quoteId: "bk-1",
      workerId: "w-1",
      customerId: "u-1",
      plan: "professional",
      subtotalMinor: 8_000,
      resolved,
      computation,
      computedAt: "2026-09-14T10:00:00.000Z",
    });

    expect(snapshot).toMatchObject({
      id: "snap-1",
      jobId: "bk-1",
      quoteId: "bk-1",
      workerId: "w-1",
      customerId: "u-1",
      plan: "professional",
      planTier: "professional",
      ruleId: DEFAULT_FEE_RULE_SET.id,
      ruleVersion: 1,
      rateBps: 700,
      minMinor: 500,
      maxMinor: 30_000,
      fixedMinor: 0,
      subtotalMinor: 8_000,
      feeMinor: 560,
      netMinor: 7_440,
      minApplied: false,
      maxApplied: false,
      exempt: false,
      currency: "USD",
      computedAt: "2026-09-14T10:00:00.000Z",
    });
    // The documented worked example: $80 quote, Professional, 7% → $5.60 fee.
    expect(snapshot.feeMinor / 100).toBe(5.6);
    expect(snapshot.netMinor / 100).toBe(74.4);
  });

  it("pins the rule version, so a later price change cannot rewrite history", () => {
    const v1 = priceJob(DEFAULT_FEE_RULE_SET, 8_000);
    const newer: FeeRuleSet = { ...DEFAULT_FEE_RULE_SET, id: "fee-rules-v2", version: 2, defaults: { ...DEFAULT_FEE_RULE_SET.defaults, rateBps: 1200 } };
    const v2 = priceJob(newer, 8_000);

    const first = buildFeeSnapshot({
      id: "a",
      jobId: "bk-1",
      quoteId: "bk-1",
      workerId: "w-1",
      subtotalMinor: 8_000,
      resolved: v1.resolved,
      computation: v1.computation,
      computedAt: "2026-09-14T10:00:00.000Z",
    });
    const second = buildFeeSnapshot({
      id: "b",
      jobId: "bk-2",
      quoteId: "bk-2",
      workerId: "w-1",
      subtotalMinor: 8_000,
      resolved: v2.resolved,
      computation: v2.computation,
      computedAt: "2026-10-01T10:00:00.000Z",
    });

    expect(first.ruleVersion).toBe(1);
    expect(first.rateBps).toBe(700);
    expect(first.feeMinor).toBe(560);
    expect(second.ruleVersion).toBe(2);
    expect(second.feeMinor).toBe(960);
    // Re-deriving the old snapshot from its recorded inputs is exact.
    expect(computeFee(first.subtotalMinor, { rateBps: first.rateBps, minMinor: first.minMinor, maxMinor: first.maxMinor, fixedMinor: first.fixedMinor, exempt: first.exempt }).feeMinor).toBe(first.feeMinor);
  });

  it("reports a waiver with the recorded rate", () => {
    const { resolved, computation } = priceJob(DEFAULT_FEE_RULE_SET, 80_000, { plan: "enterprise" });
    const snapshot = buildFeeSnapshot({
      id: "c",
      jobId: "bk-3",
      quoteId: "bk-3",
      workerId: "w-1",
      plan: "enterprise",
      subtotalMinor: 80_000,
      resolved,
      computation,
      computedAt: "2026-09-14T10:00:00.000Z",
    });
    expect(snapshot.exempt).toBe(true);
    expect(snapshot.feeMinor).toBe(0);
    expect(snapshot.netMinor).toBe(80_000);
    expect(snapshot.planTier).toBe("business");
    expect(snapshot.sources).toEqual(["plan-exempt"]);
  });
});

describe("§24 promotion campaigns", () => {
  const promo = { id: "launch", label: "Launch", rateBps: 400, minMinor: 0, maxMinor: null };

  it("ignores a paused campaign", () => {
    const set: FeeRuleSet = { ...DEFAULT_FEE_RULE_SET, promotions: [{ ...promo, enabled: false }] };
    const { rule, promotionId } = resolveFeeRule(set, { plan: "professional" });
    expect(rule.rateBps).toBe(700);
    expect(promotionId).toBeUndefined();
  });

  it("applies a live campaign and records its id on the snapshot", () => {
    const set: FeeRuleSet = { ...DEFAULT_FEE_RULE_SET, promotions: [promo] };
    const { resolved, computation } = priceJob(set, 8_000, { plan: "professional" });
    expect(resolved.rule.rateBps).toBe(400);
    // 4% of $80 = $3.20 — the campaign sets its OWN floor (minMinor: 0), so it
    // overrides the platform's $5. A campaign that only re-rates keeps the
    // default floor (asserted in the panel test).
    expect(computation.feeMinor).toBe(320);

    const snapshot = buildFeeSnapshot({
      id: "fee-bk-promo-v1",
      jobId: "bk-promo",
      quoteId: "bk-promo",
      workerId: "w-1",
      subtotalMinor: 8_000,
      resolved,
      computation,
      computedAt: "2026-09-14T10:00:00.000Z",
    });
    expect(snapshot.promotionId).toBe("launch");
    expect(snapshot.sources).toContain("promotion");
  });

  it("normalizes untrusted campaign lists (clamps bonuses, parses dates, drops junk)", () => {
    const normalized = normalizePromotions([
      { id: " a ", label: " Wide ", rateBps: 99_999, bonusCredits: 99_999_999, startsAt: "2026-09-01", endsAt: "not-a-date", enabled: false },
      { id: "", label: "no id", rateBps: 100 },
      { id: "ok", label: "" },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({ id: "a", label: "Wide", rateBps: 10_000, bonusCredits: 100_000, enabled: false });
    expect(normalized[0]?.startsAt).toBe(new Date("2026-09-01").toISOString());
    expect(normalized[0]?.endsAt).toBeUndefined(); // unparsable → open-ended, not 1970
  });
});

describe("tierRateTable", () => {
  it("shows the effective rate of every tier", () => {
    const rows = tierRateTable({ ...DEFAULT_FEE_RULE_SET, planTiers: FEE_LADDER_PRESET });
    expect(rows.map((r) => [r.tier, r.rule.rateBps])).toEqual([
      ["free", 1200],
      ["starter", 900],
      ["professional", 700],
      ["growth", 500],
      ["business", 400],
    ]);
    expect(rows.every((r) => r.rule.exempt === false)).toBe(true);
  });
});

describe("demo store + adapter stamping", () => {
  it("starts on the shipped default (7%, min $5, max $300, Business waived)", () => {
    const active = activeFeeRuleSetSync();
    expect(active.version).toBe(1);
    expect(active.defaults.rateBps).toBe(700);
    expect(resolveFeeRule(active, { plan: "enterprise" }).rule.exempt).toBe(true);
  });

  it("publishes an appended, audited version on save", async () => {
    const saved = await saveFeeRuleSet(
      { label: "Growth 5%", defaults: { rateBps: 700 }, planTiers: { growth: { rateBps: 500 } } },
      { id: "u-admin", name: "Platform Admin" }
    );
    expect(saved.version).toBe(2);
    expect(activeFeeRuleSetSync().version).toBe(2);

    const feed = await getAdminActivityFeed();
    const entry = feed.find((e) => e.code === "FEE_RULES_UPDATED");
    expect(entry).toBeTruthy();
    expect(entry?.actionEn).toContain("v2");
    expect(entry?.actor).toBe("Platform Admin");
  });

  it("stamps the fee + the immutable snapshot when a worker accepts with a quote", async () => {
    const free = (await getWorkerSlots(khaled().id)).find((s) => s.status === "available")!;
    const request = (await import("../src/lib/data/repo")).createBookingRequest;

    const created = await request({
      workerId: khaled().id,
      slotId: free.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe under the kitchen sink",
    });
    if ("error" in created) throw new Error(created.error);

    await respondToBooking(created.id, { accept: true, quote: 8_000 });

    const booking = (await getWorkerBookings(khaled().id)).find((b) => b.id === created.id)!;
    expect(booking.platformFee).toBe(560);
    expect(booking.platformFeeRateBps).toBe(700);
    expect(booking.feeSnapshot).toBeTruthy();
    expect(booking.feeSnapshot).toMatchObject({
      jobId: booking.id,
      quoteId: booking.id,
      workerId: khaled().id,
      subtotalMinor: 8_000,
      feeMinor: 560,
      netMinor: 7_440,
      ruleVersion: 1,
      rateBps: 700,
      currency: "USD",
    });

    const snapshots = await listFeeSnapshots();
    expect(snapshots.map((s) => s.jobId)).toContain(booking.id);
  });

  it("prices new accepts with the ACTIVE rule set, and leaves stamped fees untouched", async () => {
    // Publish a Growth tier rate of 5% (and no waiver for business).
    await saveFeeRuleSet({ planTiers: { growth: { rateBps: 500 }, business: { exempt: false, rateBps: 300 } } });

    const free = (await getWorkerSlots(khaled().id)).find((s) => s.status === "available")!;
    const { createBookingRequest } = await import("../src/lib/data/repo");
    const created = await createBookingRequest({
      workerId: khaled().id,
      slotId: free.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      jobTitle: "Install a water heater",
    });
    if ("error" in created) throw new Error(created.error);

    await respondToBooking(created.id, { accept: true, quote: 8_000 });
    const first = (await getWorkerBookings(khaled().id)).find((b) => b.id === created.id)!;
    // The demo worker is a Premium subscriber → the growth tier, which v2
    // prices at 5% → $40 on an $80 quote. The point of the assertion is that
    // the ACTIVE configuration (not the built-in constant) drove the fee.
    expect(planTierFor(khaled().subscription.plan)).toBe("growth");
    expect(first.feeSnapshot?.ruleVersion).toBe(2);
    expect(first.feeSnapshot?.planTier).toBe("growth");
    expect(first.feeSnapshot?.rateBps).toBe(500);
    expect(first.platformFee).toBe(500);

    // Re-price the whole platform: the already-stamped fee must not move.
    await saveFeeRuleSet({ defaults: { rateBps: 2_000 } });
    const after = (await getWorkerBookings(khaled().id)).find((b) => b.id === created.id)!;
    expect(after.platformFee).toBe(500);
    expect(after.feeSnapshot?.rateBps).toBe(500);
    expect(after.feeSnapshot?.ruleVersion).toBe(2);
  });

  it("attributes a priced quote to the campaign that priced it", async () => {
    await saveFeeRuleSet({
      promotions: [{ id: "launch", label: "Launch 10%", rateBps: 1_000, endsAt: "2026-12-31T00:00:00.000Z" }],
    });
    const free = (await getWorkerSlots(khaled().id)).find((s) => s.status === "available")!;
    const { createBookingRequest } = await import("../src/lib/data/repo");
    const created = await createBookingRequest({
      workerId: khaled().id,
      slotId: free.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      jobTitle: "Fix a leaking pipe",
    });
    if ("error" in created) throw new Error(created.error);

    await respondToBooking(created.id, { accept: true, quote: 8_000 });
    const booking = (await getWorkerBookings(khaled().id)).find((b) => b.id === created.id)!;
    expect(booking.feeSnapshot?.promotionId).toBe("launch");
    expect(booking.platformFee).toBe(800); // 10% of $80

    // §24 attribution is read from the snapshot, so it can never disagree with
    // what was charged.
    const attribution = await feePromotionAttribution();
    expect(attribution).toEqual([
      { promotionId: "launch", count: 1, feeMinor: 800, gmvMinor: 8_000, lastUsedAt: booking.feeSnapshot?.computedAt },
    ]);
  });

  it("stamps nothing for an accept without a quote", async () => {
    const free = (await getWorkerSlots(khaled().id)).find((s) => s.status === "available")!;
    const { createBookingRequest } = await import("../src/lib/data/repo");
    const created = await createBookingRequest({
      workerId: khaled().id,
      slotId: free.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      jobTitle: "Small fix",
    });
    if ("error" in created) throw new Error(created.error);

    await respondToBooking(created.id, { accept: true });
    const booking = (await getWorkerBookings(khaled().id)).find((b) => b.id === created.id)!;
    expect(booking.platformFee).toBeUndefined();
    expect(booking.feeSnapshot).toBeUndefined();
  });
});
