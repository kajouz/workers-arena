/**
 * ────────────────────────────────────────────────────────────────────────────
 * INSTANT BOOKING — buy the job now, at a price the worker already published
 * ────────────────────────────────────────────────────────────────────────────
 * Every booking on the platform today is a *negotiation*: the customer asks,
 * the worker answers with a price and maybe a deposit, and the customer waits.
 * That is the right shape for custom work, and the wrong shape for the customer
 * with a burst pipe who has already decided to buy. `docs/ENHANCEMENT-PLAN.md`
 * Phase 2 makes that customer the priority, because demand is the scarcer side
 * of this marketplace — and the cheapest way to serve them is to let a worker
 * publish a price up front and sell at it.
 *
 * ── What "instant" means here, precisely ────────────────────────────────────
 * A booking is instant-bookable when ALL of these hold:
 *
 *   1. the worker has opted in (`Worker.instantBook`) — nobody is drafted into
 *      answering a job they never saw;
 *   2. the service the customer picked is sold at a FIXED PRICE
 *      (`ServiceItem.fixedPrice`) — the platform may only charge a card without
 *      a human agreeing a number first;
 *   3. that price is per JOB, not per hour — hourly work has no total until the
 *      work is done, so it cannot be sold before it starts;
 *   4. the slot is still `AVAILABLE` (not reserved, booked, or blocked);
 *   5. it starts at least `INSTANT_BOOK_MIN_LEAD_MINUTES` from now — an instant
 *      booking still has to give the worker time to turn up, and a "book me in
 *      10 minutes" button is a promise the supply side cannot keep.
 *
 * ── Why the deposit equals the price ────────────────────────────────────────
 * A fixed price is the whole point: there is nothing left to negotiate, so the
 * customer pays it up front (`depositMinor === priceMinor`) and the job is
 * *funded* before it starts — which is what `src/lib/data/booking-settlement.ts`
 * credits the worker from. The alternative — confirm now, collect later — is
 * exactly the unfunded accrual Phase 1 removed, so instant booking must not
 * reintroduce it through a second door.
 *
 * Pure by design: same inputs, same verdict. The server action re-runs this
 * decision against live rows, so a stale button in a browser tab can never sell
 * a slot the worker already blocked, nor honour a price they have since changed.
 */

import type { ServiceItem, SlotStatus } from "./types";

/**
 * How far ahead an instant booking must start. Two hours is long enough to
 * finish the job you are on and still turn up — it is the shortest lead time
 * that is not a promise nobody can keep.
 */
export const INSTANT_BOOK_MIN_LEAD_MINUTES = 120;

/** Why a job cannot be bought instantly (the UI localizes each case). */
export type InstantBookRefusal =
  | "worker-off" // the worker has not opted in to instant booking
  | "no-service" // no (or an unknown) service was picked
  | "no-fixed-price" // the service is not sold at a published fixed price
  | "hourly" // priced per hour — there is no total to charge up front
  | "slot-unavailable" // the slot is reserved, booked, or blocked
  | "slot-past" // the slot has already started
  | "too-soon"; // inside the minimum lead time

/**
 * Minor units per major unit. `ServiceItem.price` is stored in MAJOR units
 * (a $150 package is `150` — everywhere: the demo recipes, the seed, the
 * Prisma mapper, and the `<Price>` component that renders it), while a booking
 * `quote`, a payment amount, and every ledger entry are MINOR units (`15000`).
 * Instant booking is the one place the two meet, so the conversion lives here,
 * named, rather than inline at the call site where it would be easy to lose.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

/** What the customer is buying, when the answer is yes. */
export interface InstantBookOffer {
  ok: true;
  /** The published price in MAJOR units — what the surface shows the customer. */
  price: number;
  /** The same price in MINOR units — what the booking is quoted and charged. */
  priceMinor: number;
  /** Collected up front. Equals the price: a fixed price has nothing to negotiate. */
  depositMinor: number;
}

export type InstantBookDecision = InstantBookOffer | { ok: false; reason: InstantBookRefusal };

/** The facts the decision needs — deliberately structural, not the whole rows. */
export interface InstantBookFacts {
  /** `Worker.instantBook` — the worker's opt-in. */
  instantBook?: boolean | null;
  /** The picked service, or null when the customer picked none. */
  service?: Pick<ServiceItem, "price" | "unit"> & { fixedPrice?: boolean | null } | null;
  /** The slot being claimed, or null when it has vanished. */
  slot?: { startAt: string } & { status: SlotStatus } | null;
  /** Injectable clock — the caller passes `Date.now()` (tests pass a fixed one). */
  now?: number;
}

/**
 * The verdict for one (worker, service, slot) triple. Ordered cheapest-first so
 * the *most actionable* refusal is the one the customer sees: "this worker does
 * not take instant bookings" is more useful than "that price is hourly", and
 * both beat "that slot is gone".
 */
export function instantBookDecision(facts: InstantBookFacts): InstantBookDecision {
  if (!facts.instantBook) return { ok: false, reason: "worker-off" };

  const service = facts.service;
  if (!service) return { ok: false, reason: "no-service" };
  if (!service.fixedPrice) return { ok: false, reason: "no-fixed-price" };
  // Hourly comes before the price check: an hourly item with a number on it is
  // a RATE, and charging it as a total would overcharge the customer outright.
  if (service.unit !== "job") return { ok: false, reason: "hourly" };

  // MAJOR units (see MINOR_UNITS_PER_MAJOR) — rounded before the conversion so
  // a fractional catalog price cannot produce half a cent.
  const price = Number.isFinite(service.price) ? Math.round(service.price) : 0;
  if (price <= 0) return { ok: false, reason: "no-fixed-price" };
  const priceMinor = price * MINOR_UNITS_PER_MAJOR;

  const slot = facts.slot;
  if (!slot) return { ok: false, reason: "slot-unavailable" };
  if (slot.status !== "available") return { ok: false, reason: "slot-unavailable" };

  const startMs = Date.parse(slot.startAt);
  if (!Number.isFinite(startMs)) return { ok: false, reason: "slot-unavailable" };
  const now = Number.isFinite(facts.now) ? (facts.now as number) : Date.now();
  if (startMs <= now) return { ok: false, reason: "slot-past" };
  if (startMs - now < INSTANT_BOOK_MIN_LEAD_MINUTES * 60_000) return { ok: false, reason: "too-soon" };

  return { ok: true, price, priceMinor, depositMinor: priceMinor };
}

/**
 * Can this worker's service be sold instantly *at all* (worker opted in, and the
 * service is a fixed-price job)? Slot-independent, so a surface can decide
 * whether to advertise the feature before a slot is even chosen — the dialog
 * shows "instant" on the service step, then checks the slot.
 */
export function instantBookableService(
  facts: Pick<InstantBookFacts, "instantBook" | "service" | "now">
): boolean {
  const now = Number.isFinite(facts.now) ? (facts.now as number) : Date.now();
  // A slot a day out, so only the worker/service rules decide.
  const decision = instantBookDecision({
    ...facts,
    slot: { startAt: new Date(now + 86_400_000).toISOString(), status: "available" },
  });
  return decision.ok;
}

/** The subset of a worker's services that can be sold instantly. */
export function instantServices<T extends ServiceItem>(
  services: T[],
  instantBook?: boolean | null,
  now?: number
): T[] {
  return services.filter((service) => instantBookableService({ instantBook, service, now }));
}

/**
 * ── Publishing the package ──────────────────────────────────────────────────
 * Instant booking is unreachable unless a worker can actually *publish* a
 * package: the opt-in flag is consent to sell, not a price. Before this existed
 * `fixedPrice` was only ever true on seeded rows, so the feature was live for
 * nobody real — a demand-side feature with no supply.
 *
 * The worker keeps the services they already have (that list is the catalog the
 * customer sees) and decides which of them carries a buy-now price. Naming and
 * unit come from the existing row, so the only free input is the number.
 */

/** A price that a human can plausibly mean, in MAJOR units. */
export const MAX_PACKAGE_PRICE = 100_000;

export type PackageRefusal =
  | "unknown-service" // the named service is not on this worker's catalog
  | "hourly" // per-hour work has no total to publish
  | "invalid-price"; // missing, non-numeric, negative, or absurd

export interface PackageDraft {
  ok: true;
  /** The catalog row to update, by its stable join key. */
  nameEn: string;
  /** The published buy-now price, MAJOR units (see MINOR_UNITS_PER_MAJOR). */
  price: number;
  /** End of the decision: publishing a package IS the fixed-price flag. */
  fixedPrice: true;
}

export type PackageDecision = PackageDraft | { ok: false; reason: PackageRefusal };

/**
 * Turn (catalog row, worker-typed price) into a writable draft. Rejecting is
 * the job here — a package published at 0 or on an hourly row would surface
 * later as a customer being charged a rate as if it were a total.
 */
export function publishablePackage(
  service: Pick<ServiceItem, "nameEn" | "unit"> | null | undefined,
  priceMajor: number
): PackageDecision {
  if (!service?.nameEn) return { ok: false, reason: "unknown-service" };
  if (service.unit !== "job") return { ok: false, reason: "hourly" };

  const price = Number(priceMajor);
  if (!Number.isFinite(price)) return { ok: false, reason: "invalid-price" };
  const rounded = Math.round(price);
  if (rounded <= 0) return { ok: false, reason: "invalid-price" };
  if (rounded > MAX_PACKAGE_PRICE) return { ok: false, reason: "invalid-price" };

  return { ok: true, nameEn: service.nameEn, price: rounded, fixedPrice: true };
}
