/**
 * WorkersArena Guarantee — claim storage (demo ⇄ Prisma). The terms and the
 * pure eligibility rule live in `guarantee-terms.ts` (safe for client
 * components); this module re-exports them so server code has one import.
 */

import {
  validateResolution,
  MAX_CLAIM_DESCRIPTION,
  type GuaranteeClaim,
  type GuaranteeClaimStatus,
  type GuaranteeOutcome,
} from "./guarantee-terms";

export * from "./guarantee-terms";

/* ───────────────────────────── Adapter selection ───────────────────────────── */

function realClaimsEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

async function prisma() {
  return (await import("@/lib/server/prisma")).getPrisma();
}

const GLOBAL_KEY = "__workersArenaGuaranteeClaims";
const g = globalThis as Record<string, unknown>;
const STORE: Map<string, GuaranteeClaim> =
  (g[GLOBAL_KEY] as Map<string, GuaranteeClaim> | undefined) ?? (g[GLOBAL_KEY] = new Map<string, GuaranteeClaim>());

/** Reset the demo store (tests). */
export function resetGuaranteeClaimStore(): void {
  STORE.clear();
}

type ClaimRow = {
  id: string;
  bookingId: string;
  bookingNumber: string;
  workerId: string;
  customerName: string;
  description: string;
  coverMinor: number;
  currency: string;
  status: string;
  refundMinor: number | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

function fromRow(row: ClaimRow): GuaranteeClaim {
  return {
    id: row.id,
    bookingId: row.bookingId,
    bookingNumber: row.bookingNumber,
    workerId: row.workerId,
    customerName: row.customerName,
    description: row.description,
    coverMinor: row.coverMinor,
    currency: row.currency,
    status: row.status as GuaranteeClaimStatus,
    refundMinor: row.refundMinor ?? undefined,
    resolutionNote: row.resolutionNote ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
  };
}

/* ─────────────────────────────── Public API ─────────────────────────────── */

/**
 * File a claim. The caller has already checked who is asking and that the job
 * is covered (`guaranteeCover`); one claim per booking — a second is refused.
 */
export async function fileGuaranteeClaim(input: {
  bookingId: string;
  bookingNumber: string;
  workerId: string;
  customerName: string;
  description: string;
  coverMinor: number;
  currency: string;
  at?: string;
}): Promise<{ ok: true; claim: GuaranteeClaim } | { ok: false; error: "already-filed" | "invalid" }> {
  const description = input.description.trim().slice(0, MAX_CLAIM_DESCRIPTION);
  if (description.length < 10) return { ok: false, error: "invalid" };
  if (realClaimsEnabled()) {
    try {
      const row = await (await prisma()).guaranteeClaim.create({
        data: {
          bookingId: input.bookingId,
          bookingNumber: input.bookingNumber,
          workerId: input.workerId,
          customerName: input.customerName,
          description,
          coverMinor: input.coverMinor,
          currency: input.currency,
        },
      });
      return { ok: true, claim: fromRow(row) };
    } catch (error) {
      // The unique bookingId index is the one-claim-per-booking guard.
      if ((error as { code?: string }).code === "P2002") return { ok: false, error: "already-filed" };
      throw error;
    }
  }
  if ([...STORE.values()].some((c) => c.bookingId === input.bookingId)) return { ok: false, error: "already-filed" };
  const claim: GuaranteeClaim = {
    id: `gc_${STORE.size + 1}_${input.bookingId}`,
    bookingId: input.bookingId,
    bookingNumber: input.bookingNumber,
    workerId: input.workerId,
    customerName: input.customerName,
    description,
    coverMinor: input.coverMinor,
    currency: input.currency,
    status: "open",
    createdAt: input.at ?? new Date().toISOString(),
  };
  STORE.set(claim.id, claim);
  return { ok: true, claim };
}

/** The claim filed on each of these bookings, if any. */
export async function guaranteeClaimsForBookings(bookingIds: string[]): Promise<Map<string, GuaranteeClaim>> {
  const ids = [...new Set(bookingIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  if (realClaimsEnabled()) {
    const rows = await (await prisma()).guaranteeClaim.findMany({ where: { bookingId: { in: ids } } });
    return new Map(rows.map((r) => [r.bookingId, fromRow(r)]));
  }
  return new Map([...STORE.values()].filter((c) => ids.includes(c.bookingId)).map((c) => [c.bookingId, c]));
}

/** The admin queue: open claims oldest first, then the latest resolved ones. */
export async function listGuaranteeClaims(limit = 50): Promise<GuaranteeClaim[]> {
  if (realClaimsEnabled()) {
    const db = await prisma();
    const [open, resolved] = await Promise.all([
      db.guaranteeClaim.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" }, take: limit }),
      db.guaranteeClaim.findMany({ where: { status: { not: "open" } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
    ]);
    return [...open, ...resolved].map(fromRow);
  }
  const all = [...STORE.values()];
  return [
    ...all.filter((c) => c.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, limit),
    ...all
      .filter((c) => c.status !== "open")
      .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
      .slice(0, 10),
  ];
}

/**
 * Resolve an open claim. Compare-and-swap on `status: "open"`, so two admins
 * clicking at once resolve it once.
 */
export async function resolveGuaranteeClaim(input: {
  claimId: string;
  outcome: GuaranteeOutcome;
  refundMinor?: number;
  note?: string;
  adminId: string;
  at?: string;
}): Promise<{ ok: true; claim: GuaranteeClaim } | { ok: false; error: "not-found" | "already-resolved" | "invalid-refund" }> {
  const at = input.at ?? new Date().toISOString();
  const note = input.note?.trim().slice(0, 500) || undefined;
  if (realClaimsEnabled()) {
    const db = await prisma();
    const row = await db.guaranteeClaim.findUnique({ where: { id: input.claimId } });
    if (!row) return { ok: false, error: "not-found" };
    const check = validateResolution(fromRow(row), input.outcome, input.refundMinor);
    if (!check.ok) return check;
    const updated = await db.guaranteeClaim.updateMany({
      where: { id: input.claimId, status: "open" },
      data: {
        status: input.outcome,
        refundMinor: check.refundMinor ?? null,
        resolutionNote: note ?? null,
        resolvedBy: input.adminId,
        resolvedAt: new Date(at),
      },
    });
    if (updated.count !== 1) return { ok: false, error: "already-resolved" };
    return { ok: true, claim: fromRow((await db.guaranteeClaim.findUnique({ where: { id: input.claimId } }))!) };
  }
  const claim = STORE.get(input.claimId);
  if (!claim) return { ok: false, error: "not-found" };
  const check = validateResolution(claim, input.outcome, input.refundMinor);
  if (!check.ok) return check;
  const resolved: GuaranteeClaim = {
    ...claim,
    status: input.outcome,
    refundMinor: check.refundMinor,
    resolutionNote: note,
    resolvedBy: input.adminId,
    resolvedAt: at,
  };
  STORE.set(claim.id, resolved);
  return { ok: true, claim: resolved };
}
