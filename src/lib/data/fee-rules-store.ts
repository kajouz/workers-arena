/**
 * ────────────────────────────────────────────────────────────────────────────
 * FEE RULE STORE — the persistence half of the platform fee engine (§5/§6)
 * ────────────────────────────────────────────────────────────────────────────
 * `fee-rules.ts` is pure (engine + defaults). THIS module owns the mutable
 * state, following the app's two-adapter convention (src/lib/data/repo.ts):
 *
 *   • real mode (DEMO_MODE=false + DATABASE_URL) → Postgres: the active row of
 *     `FeeRuleSet` (append-only, version++) and `PlatformFeeSnapshot` rows.
 *   • demo mode → a globalThis mirror so the admin UI, the purchase flow and
 *     the booking adapters share one home (same rationale as the campaign and
 *     purchase stores), and nothing needs a database to run the app.
 *
 * Rule sets are APPEND-ONLY: a save inserts version+1 and deactivates the
 * previous one, so the version stamped into an old snapshot always resolves
 * back to the exact rules that produced it.
 */

import { logAdminActivity, ACTION_CODES } from "./activity";
import { normalizeLeadMarketConfig, type LeadMarketConfig } from "./lead-market";
import {
  DEFAULT_FEE_RULE_SET,
  buildFeeSnapshot,
  normalizeFeeRuleSet,
  priceJob,
  type FeeComputation,
  type FeeContext,
  type FeePlanTier,
  type FeeRuleOverride,
  type FeePromotion,
  type FeeRuleSet,
  type PlatformFeeSnapshot,
} from "./fee-rules";

/** Mirrors repo.ts's gate: real data needs both the flag and a live database. */
function realFeeDataEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

/** Lazy-load the Prisma implementations so demo mode never requires a client. */
function feePrisma() {
  return import("./fee-rules-prisma");
}

interface FeeStore {
  /** Active rule set (demo only — real mode reads the DB). */
  active: FeeRuleSet;
  /** Every version ever saved, newest first (admin history). */
  history: FeeRuleSet[];
  /** Snapshots stamped in this process (admin audit list). */
  snapshots: PlatformFeeSnapshot[];
  seq: number;
}

const GLOBAL_KEY = "__workersArenaFeeRuleStore";
const g = globalThis as Record<string, unknown>;
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;
const STORE: FeeStore =
  (g[GLOBAL_KEY] as FeeStore | undefined) ??
  (g[GLOBAL_KEY] = {
    active: DEFAULT_FEE_RULE_SET,
    history: [DEFAULT_FEE_RULE_SET],
    snapshots: [],
    seq: 0,
  } as FeeStore);

if (FIRST_INSTANCE) {
  STORE.active = DEFAULT_FEE_RULE_SET;
  STORE.history = [DEFAULT_FEE_RULE_SET];
  STORE.snapshots = [];
  STORE.seq = 0;
}

/** Reset the demo fee store to its shipped state (tests). */
export function resetFeeRuleStore(): void {
  STORE.active = DEFAULT_FEE_RULE_SET;
  STORE.history = [DEFAULT_FEE_RULE_SET];
  STORE.snapshots = [];
  STORE.seq = 0;
}

/**
 * The rule set in force — synchronous, demo-only. Demo adapters are async but
 * call this inside pure mutation branches; in real mode use
 * `loadActiveFeeRuleSet()` (the DB is the source of truth).
 */
export function activeFeeRuleSetSync(): FeeRuleSet {
  return withLeadMarketConfig(STORE.active);
}

/** The rule set in force, from the right store for the current mode. */
export async function loadActiveFeeRuleSet(): Promise<FeeRuleSet> {
  if (realFeeDataEnabled()) return withLeadMarketConfig(await (await feePrisma()).prismaLoadActiveFeeRuleSet());
  return withLeadMarketConfig(STORE.active);
}

/** Rule-set history, newest first (admin panel). */
export async function listFeeRuleSetVersions(limit = 20): Promise<FeeRuleSet[]> {
  const n = Math.max(1, Math.trunc(limit));
  if (realFeeDataEnabled()) return (await feePrisma()).prismaListFeeRuleSets(n);
  return STORE.history.slice(0, n).map(withLeadMarketConfig);
}

export interface SaveFeeRuleSetInput {
  label?: string;
  currency?: "USD";
  /** What changed, for the audit entry ("platform fee rules" by default; the
   * promotions editor passes "promotion campaigns" so the feed reads true). */
  change?: string;
  /** Omitted fields keep the current version's values (partial edits). */
  defaults?: FeeRuleOverride;
  planTiers?: Partial<Record<FeePlanTier, FeeRuleOverride>>;
  categories?: Record<string, FeeRuleOverride>;
  emergency?: FeeRuleOverride;
  promotions?: FeePromotion[];
  /** §7–§10 lead-market policy (prices, matching weights, ownership, reveal). */
  leadMarket?: Partial<LeadMarketConfig>;
}

/**
 * Every rule set the app hands out carries a CONCRETE lead-market policy:
 * prices, weights, caps and the reveal policy are clamped by the engine's
 * normalizer, so a hand-edited jsonb row (or an old version that predates the
 * lead marketplace) can never charge a nonsense price or reveal more than the
 * policy allows.
 */
function withLeadMarketConfig(ruleSet: FeeRuleSet): FeeRuleSet {
  return { ...ruleSet, leadMarket: normalizeLeadMarketConfig(ruleSet.leadMarket) };
}

/**
 * Save a new rule-set version. Validated + normalized first (a stored jsonb
 * payload is untrusted: a 100 000% rate or a floor above the cap must never
 * reach a live quote), then appended as the new active version. Pricing is
 * reported in bps and minor units throughout.
 */
export async function saveFeeRuleSet(
  input: SaveFeeRuleSetInput,
  actor: { id?: string; name?: string } = {}
): Promise<FeeRuleSet> {
  const current = await loadActiveFeeRuleSet();
  const version = current.version + 1;
  const normalized = normalizeFeeRuleSet({
    id: `fee-rules-v${version}`,
    version,
    currency: input.currency ?? current.currency,
    label: input.label ?? `Fee rules v${version}`,
    defaults: { ...current.defaults, ...input.defaults },
    planTiers: input.planTiers ?? current.planTiers,
    categories: input.categories ?? current.categories,
    emergency: input.emergency ?? current.emergency,
    promotions: input.promotions ?? current.promotions,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name ?? "Platform Admin",
  });
  // The lead-market policy is attached AFTER the take-rate normalizer, which
  // deliberately knows nothing about the marketplace (the two engines must not
  // import each other). Spread over its result so a publish carries the policy
  // forward — `normalizeFeeRuleSet` would otherwise drop the field and silently
  // reset the marketplace to the shipped defaults on the next save. Clamped on
  // every write, so a stored version is always a usable policy.
  const next: FeeRuleSet = {
    ...normalized,
    leadMarket: normalizeLeadMarketConfig({ ...current.leadMarket, ...input.leadMarket }),
  };

  let saved: FeeRuleSet;
  if (realFeeDataEnabled()) {
    saved = await (await feePrisma()).prismaSaveFeeRuleSet(next, actor);
  } else {
    STORE.active = next;
    STORE.history = [next, ...STORE.history];
    saved = next;
  }

  const who = actor.name ?? "Platform Admin";
  await logAdminActivity({
    code: ACTION_CODES.FEE_RULES_UPDATED,
    actionEn: input.change
      ? `${who} published ${input.change} (fee rules v${saved.version})`
      : `${who} published platform fee rules v${saved.version} (${saved.defaults.rateBps / 100}% take rate, min $${saved.defaults.minMinor / 100})`,
    actionAr: input.change
      ? `${who} نشر ${input.change} (الإصدار ${saved.version})`
      : `${who} نشر قواعد رسوم المنصة الإصدار ${saved.version} (${saved.defaults.rateBps / 100}%)`,
    actor: who,
    ...(actor.id ? { actorId: actor.id } : {}),
    type: "payment",
  });

  return saved;
}

/**
 * THE stamp helper — price a quoted accept and build its §6 snapshot. Shared
 * by the demo and Prisma adapters so both produce an identical record from
 * identical inputs (the "no drift" rule the take rate already follows).
 * Persistence is the caller's job: demo pushes to the store, Prisma writes the
 * row inside its accept transaction.
 */
export async function priceQuoteForSnapshot(input: {
  jobId: string;
  quoteId: string;
  workerId: string;
  customerId?: string;
  plan?: string | null;
  subtotalMinor: number;
  context?: Omit<FeeContext, "plan">;
  computedAt?: string;
  ruleSet?: FeeRuleSet;
}): Promise<{ snapshot: PlatformFeeSnapshot; computation: FeeComputation }> {
  const ruleSet = input.ruleSet ?? (await loadActiveFeeRuleSet());
  const { resolved, computation } = priceJob(ruleSet, input.subtotalMinor, {
    ...input.context,
    plan: input.plan ?? undefined,
  });
  const snapshot = buildFeeSnapshot({
    id: `fee-${input.jobId}-v${resolved.ruleVersion}`,
    jobId: input.jobId,
    quoteId: input.quoteId,
    workerId: input.workerId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    plan: input.plan ?? undefined,
    subtotalMinor: input.subtotalMinor,
    resolved,
    computation,
    computedAt: input.computedAt ?? new Date().toISOString(),
    currency: ruleSet.currency,
  });
  return { snapshot, computation };
}

/** Persist a snapshot in the demo store (real mode writes it in the tx). */
export function recordDemoFeeSnapshot(snapshot: PlatformFeeSnapshot): void {
  STORE.seq += 1;
  // Append-only and idempotent per booking: the demo accept branches can be
  // re-entered by a retried action, and one fee per booking is the invariant
  // the DB enforces with `bookingId @unique`.
  const existing = STORE.snapshots.findIndex((s) => s.jobId === snapshot.jobId);
  if (existing >= 0) return;
  STORE.snapshots.unshift(snapshot);
}

/** Fee snapshots, newest first (admin audit list). */
export async function listFeeSnapshots(limit = 50): Promise<PlatformFeeSnapshot[]> {
  const n = Math.max(1, Math.trunc(limit));
  if (realFeeDataEnabled()) return (await feePrisma()).prismaListFeeSnapshots(n);
  return STORE.snapshots.slice(0, n);
}

/**
 * §24 — how much each campaign actually priced. Aggregated from the fee
 * snapshots (the immutable record), so attribution can never disagree with
 * what was charged: a quote counts for a promotion only if its snapshot was
 * stamped with that promotionId.
 *
 * Reads the most recent `scan` snapshots — an admin audit view, not a revenue
 * report; a SQL groupBy takes over when snapshot volume warrants it.
 */
export interface PromotionAttribution {
  promotionId: string;
  /** Quotes priced by this promotion. */
  count: number;
  /** Platform fee those quotes produced (minor units). */
  feeMinor: number;
  /** Job value those quotes represent (minor units). */
  gmvMinor: number;
  lastUsedAt?: string;
}

export async function feePromotionAttribution(scan = 500): Promise<PromotionAttribution[]> {
  const snapshots = await listFeeSnapshots(scan);
  const byPromotion = new Map<string, PromotionAttribution>();
  for (const snapshot of snapshots) {
    if (!snapshot.promotionId) continue;
    const row = byPromotion.get(snapshot.promotionId) ?? {
      promotionId: snapshot.promotionId,
      count: 0,
      feeMinor: 0,
      gmvMinor: 0,
    };
    row.count += 1;
    row.feeMinor += snapshot.feeMinor;
    row.gmvMinor += snapshot.subtotalMinor;
    if (!row.lastUsedAt || snapshot.computedAt > row.lastUsedAt) row.lastUsedAt = snapshot.computedAt;
    byPromotion.set(snapshot.promotionId, row);
  }
  return [...byPromotion.values()].sort((a, b) => b.feeMinor - a.feeMinor);
}

/** The snapshot for one booking (detail views / dispute lookup). */
export async function getFeeSnapshotForBooking(bookingId: string): Promise<PlatformFeeSnapshot | null> {
  if (realFeeDataEnabled()) return (await feePrisma()).prismaGetFeeSnapshot(bookingId);
  return STORE.snapshots.find((s) => s.jobId === bookingId) ?? null;
}
