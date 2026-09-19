/**
 * ────────────────────────────────────────────────────────────────────────────
 * FEE RULES — PRISMA ADAPTER (real mode)
 * ────────────────────────────────────────────────────────────────────────────
 * Postgres half of the fee-rule store (src/lib/data/fee-rules-store.ts): the
 * append-only `FeeRuleSet` history and the immutable `PlatformFeeSnapshot`
 * rows. Loaded lazily by the store, so a demo build never pulls this module
 * (and with it @prisma/client) in.
 */

import { getPrisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_FEE_RULE_SET,
  normalizeFeeRuleSet,
  type FeePlanTier,
  type FeeRuleOverride,
  type FeePromotion,
  type FeeRuleSet,
  type FeeRuleSource,
  type PlatformFeeSnapshot,
} from "./fee-rules";

/** A `FeeRuleSet` row, structurally typed so tests need no live DB. */
export interface FeeRuleSetRow {
  id: string;
  version: number;
  currency: string;
  config: unknown;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Map a config payload + row metadata back to a domain rule set. */
export function toDomainFeeRuleSet(row: FeeRuleSetRow): FeeRuleSet {
  const config = (row.config ?? {}) as Partial<FeeRuleSet>;
  const normalized = normalizeFeeRuleSet({
    ...config,
    id: config.id ?? row.id,
    version: row.version,
    currency: row.currency as FeeRuleSet["currency"],
    // Row columns win over the payload: they are the indexed truth.
    label: row.label ?? config.label,
    updatedAt: config.updatedAt ?? row.createdAt.toISOString(),
  });
  // normalizeFeeRuleSet deliberately owns only take-rate fields. Preserve the
  // versioned commercial policies carried alongside them so real mode does not
  // silently fall back to demo defaults after an admin edit.
  return {
    ...normalized,
    ...(config.leadMarket ? { leadMarket: config.leadMarket as FeeRuleSet["leadMarket"] } : {}),
    ...(config.planCatalog ? { planCatalog: config.planCatalog as FeeRuleSet["planCatalog"] } : {}),
    ...(config.referralConfig ? { referralConfig: config.referralConfig as FeeRuleSet["referralConfig"] } : {}),
  };
}

/** The Prisma row shape of a snapshot — structural, for test fixtures. */
export interface FeeSnapshotRow {
  id: string;
  bookingId: string;
  jobId: string;
  quoteId: string;
  workerId: string;
  customerId: string | null;
  plan: string | null;
  planTier: string;
  ruleId: string;
  ruleVersion: number;
  rateBps: number;
  minMinor: number;
  maxMinor: number | null;
  fixedMinor: number;
  subtotalMinor: number;
  feeMinor: number;
  netMinor: number;
  minApplied: boolean;
  maxApplied: boolean;
  exempt: boolean;
  sources: string[];
  promotionId: string | null;
  currency: string;
  computedAt: Date;
}

/** Map a snapshot row to the domain record (drops the DB-only bookingId). */
export function toDomainFeeSnapshot(row: FeeSnapshotRow): PlatformFeeSnapshot {
  return {
    id: row.id,
    jobId: row.jobId,
    quoteId: row.quoteId,
    workerId: row.workerId,
    ...(row.customerId ? { customerId: row.customerId } : {}),
    ...(row.plan ? { plan: row.plan } : {}),
    planTier: row.planTier as FeePlanTier,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    rateBps: row.rateBps,
    minMinor: row.minMinor,
    maxMinor: row.maxMinor,
    fixedMinor: row.fixedMinor,
    subtotalMinor: row.subtotalMinor,
    feeMinor: row.feeMinor,
    netMinor: row.netMinor,
    minApplied: row.minApplied,
    maxApplied: row.maxApplied,
    exempt: row.exempt,
    sources: (row.sources ?? []) as FeeRuleSource[],
    ...(row.promotionId ? { promotionId: row.promotionId } : {}),
    currency: row.currency as PlatformFeeSnapshot["currency"],
    computedAt: row.computedAt.toISOString(),
  };
}

/**
 * The insert payload for a snapshot — used inside the accept transaction. The
 * record is written ONCE per booking (`bookingId @unique`): a retried accept
 * can never double-charge, and nothing ever updates the row afterwards.
 */
export function feeSnapshotCreateData(
  snapshot: PlatformFeeSnapshot,
  bookingId: string
): Prisma.PlatformFeeSnapshotUncheckedCreateInput {
  return {
    bookingId,
    jobId: snapshot.jobId,
    quoteId: snapshot.quoteId,
    workerId: snapshot.workerId,
    customerId: snapshot.customerId ?? null,
    plan: snapshot.plan ?? null,
    planTier: snapshot.planTier,
    ruleId: snapshot.ruleId,
    ruleVersion: snapshot.ruleVersion,
    rateBps: snapshot.rateBps,
    minMinor: snapshot.minMinor,
    maxMinor: snapshot.maxMinor,
    fixedMinor: snapshot.fixedMinor,
    subtotalMinor: snapshot.subtotalMinor,
    feeMinor: snapshot.feeMinor,
    netMinor: snapshot.netMinor,
    minApplied: snapshot.minApplied,
    maxApplied: snapshot.maxApplied,
    exempt: snapshot.exempt,
    sources: snapshot.sources,
    promotionId: snapshot.promotionId ?? null,
    currency: snapshot.currency,
    computedAt: new Date(snapshot.computedAt),
  };
}

/**
 * The active rule set. An empty table (a fresh database that has never had its
 * pricing edited) resolves to the shipped DEFAULT — the 7% / min $5 / max $300
 * take rate — without writing a row: a read must never mutate.
 */
export async function prismaLoadActiveFeeRuleSet(): Promise<FeeRuleSet> {
  const row = await getPrisma().feeRuleSet.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  return row ? toDomainFeeRuleSet(row) : DEFAULT_FEE_RULE_SET;
}

/** Rule-set history, newest first. */
export async function prismaListFeeRuleSets(limit = 20): Promise<FeeRuleSet[]> {
  const rows = await getPrisma().feeRuleSet.findMany({
    orderBy: { version: "desc" },
    take: limit,
  });
  return rows.map(toDomainFeeRuleSet);
}

/**
 * Append a new version: insert version+1, deactivate every earlier row, in one
 * transaction. The previous version stays readable forever — that is what lets
 * an old snapshot's ruleVersion resolve back to its exact rules.
 */
export async function prismaSaveFeeRuleSet(
  ruleSet: FeeRuleSet,
  actor: { id?: string; name?: string } = {}
): Promise<FeeRuleSet> {
  const prisma = getPrisma();
  const row = await prisma.$transaction(async (tx) => {
    await tx.feeRuleSet.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.feeRuleSet.create({
      data: {
        version: ruleSet.version,
        currency: ruleSet.currency,
        // Typed domain objects are not `InputJsonValue` (interfaces have no
        // index signature) — the payload is plain JSON by construction.
        config: {
          id: ruleSet.id,
          defaults: ruleSet.defaults,
          planTiers: ruleSet.planTiers,
          categories: ruleSet.categories,
          emergency: ruleSet.emergency,
          promotions: ruleSet.promotions,
          // Ride-along configs (lead-market policy, plan-catalog overrides):
          // these MUST be in the payload or the next read silently resets the
          // marketplace / plan pricing to the shipped defaults in real mode.
          ...(ruleSet.leadMarket ? { leadMarket: ruleSet.leadMarket } : {}),
          ...(ruleSet.planCatalog ? { planCatalog: ruleSet.planCatalog } : {}),
          ...(ruleSet.referralConfig ? { referralConfig: ruleSet.referralConfig } : {}),
          updatedAt: ruleSet.updatedAt,
          updatedBy: ruleSet.updatedBy,
        } as unknown as Prisma.InputJsonValue,
        label: ruleSet.label ?? null,
        isActive: true,
        note: null,
        createdById: actor.id ?? null,
      },
    });
  });
  return toDomainFeeRuleSet(row);
}

/** Fee snapshots, newest first (admin audit list). */
export async function prismaListFeeSnapshots(limit = 50): Promise<PlatformFeeSnapshot[]> {
  const rows = await getPrisma().platformFeeSnapshot.findMany({
    orderBy: { computedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => toDomainFeeSnapshot(r as FeeSnapshotRow));
}

/** The snapshot for one booking, if the fee was ever stamped. */
export async function prismaGetFeeSnapshot(bookingId: string): Promise<PlatformFeeSnapshot | null> {
  const row = await getPrisma().platformFeeSnapshot.findUnique({ where: { bookingId } });
  return row ? toDomainFeeSnapshot(row as FeeSnapshotRow) : null;
}

/** Re-export for callers that only need the config types. */
export type { FeeRuleOverride, FeePromotion };
