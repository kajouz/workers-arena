/**
 * ────────────────────────────────────────────────────────────────────────────
 * GUEST → ACCOUNT CLAIM — give a phone-keyed booking a home
 * ────────────────────────────────────────────────────────────────────────────
 * The product lets a signed-out customer book with a name and a phone. That
 * booking is keyed on the phone (`customerId` is null), the customer manages it
 * from `/bookings?phone=…`, and every notification reaches them by SMS/WhatsApp.
 * It works — and it has no future: the second purchase starts from zero, the
 * history is invisible the moment they sign in, and the only way back in is to
 * remember which number they typed.
 *
 * This module is the claim: when a customer creates an account (or signs in)
 * with the phone their guest bookings were made with, those records are linked
 * to the account. `docs/ENHANCEMENT-PLAN.md` Phase 2 puts this directly after
 * instant booking, because demand-side growth needs the SECOND purchase to be
 * cheaper than the first, and a customer who cannot see their own history can
 * never get there.
 *
 * ── What the claim will and will not do ─────────────────────────────────────
 * 1. **The phone is the credential.** Registration collects a phone; the claim
 *    matches on it, normalized through the same `normalizePhone` the SMS and
 *    WhatsApp providers use, so "+961 70 123 456" and "+96170123456" are one
 *    identity — exactly as they are one handset in reality.
 * 2. **An email alone never claims.** Registration does not verify email, so
 *    treating a matching address as proof would let anyone claim a stranger's
 *    booking history by typing their address. An email match is reported, never
 *    acted on.
 * 3. **An owned record is never taken.** If `customerId` already points at
 *    somebody else, the record is reported as `other-account` and left alone —
 *    the claim can only ever fill a hole, never move a booking between people.
 * 4. **Re-running is free.** A record already owned by this same account is
 *    `already-owned`: no write, no second "we linked your bookings" event.
 *
 * Pure: same records + same identity ⇒ same plan. The adapters only marshal rows.
 */

import type { Booking, QuoteRequest, RecurringBooking } from "./types";

/**
 * The fields a claimable record must expose. Bookings, quote requests and
 * recurring contracts all carry the same three customer columns, so the same
 * plan applies to all three — a guest who posted a quote request should not
 * lose it by signing up.
 */
export interface ClaimableRecord {
  id: string;
  customerId?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}

/** Strip display formatting — the shared phone identity rule (see module header). */
export function normalizeClaimPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[\s\-()]/g, "");
  return clean || null;
}

/** The identity a signed-in customer presents when asking for their history. */
export interface ClaimIdentity {
  /** The account the records would be linked to. */
  userId: string;
  /** The phone registered on the account — the credential. */
  phone?: string | null;
  /** Reported for adjudication, never used to claim on its own. */
  email?: string | null;
}

/**
 * Why a record is NOT being linked. Each case wants a different sentence on the
 * surface, so they are not collapsed into a boolean:
 *   • `already-owned` — ours; nothing to do, and saying "linked!" again would be
 *     a lie about work that happened on the previous sign-in;
 *   • `other-account` — the one case worth telling the customer about, because
 *     it means the number they just registered with is not the one they booked
 *     with (or they have two accounts);
 *   • `phone-mismatch` — a different phone, including the email-only near-miss
 *     the module header explains.
 */
export type ClaimSkipReason = "already-owned" | "other-account" | "phone-mismatch";

export interface GuestClaimPlan<Id extends string = string> {
  /** Records to link, in input order. */
  claimable: Id[];
  /** `already-owned` ids — owned by THIS account already (idempotent no-ops). */
  alreadyOwned: Id[];
  /** `other-account` ids — owned by somebody else; never touched. */
  foreign: Id[];
  skipReasons: Record<Id, ClaimSkipReason>;
}

/** Normalize an email the same way the lookup adapters do (trim + lowercase). */
function normEmail(email?: string | null): string | null {
  const clean = email?.trim().toLowerCase();
  return clean || null;
}

/**
 * Decide which records an identity may claim.
 *
 * `claimable` is what a caller should write; `alreadyOwned` / `foreign` exist so
 * the surface can be specific ("2 bookings linked, 1 belongs to another account")
 * instead of reporting a single number that hides the interesting case.
 */
export function planGuestClaim<Id extends string = string>(
  records: readonly (ClaimableRecord & { id: Id })[],
  identity: ClaimIdentity
): GuestClaimPlan<Id> {
  const plan: GuestClaimPlan<Id> = {
    claimable: [],
    alreadyOwned: [],
    foreign: [],
    skipReasons: {} as Record<Id, ClaimSkipReason>,
  };
  const userId = identity.userId?.trim();
  const phone = normalizeClaimPhone(identity.phone);

  for (const record of records) {
    // No account to link to, or no phone to match on: nothing can be claimed.
    // (Recorded as phone-mismatch so the caller still gets a reason per record.)
    if (!userId || !phone) {
      plan.skipReasons[record.id] = "phone-mismatch";
      continue;
    }
    // The phone is the CANDIDACY test and it comes first: a record made with a
    // different number is not this customer's business at all, so it must not be
    // counted as "owned elsewhere" either — that tally would otherwise include
    // every stranger's record in the store (and leak its existence).
    if (normalizeClaimPhone(record.customerPhone) !== phone) {
      plan.skipReasons[record.id] = "phone-mismatch";
      continue;
    }
    // Now the candidate is genuinely theirs-by-phone; ownership decides.
    const owner = record.customerId ?? null;
    if (owner === userId) {
      plan.alreadyOwned.push(record.id);
      plan.skipReasons[record.id] = "already-owned";
      continue;
    }
    if (owner) {
      plan.foreign.push(record.id);
      plan.skipReasons[record.id] = "other-account";
      continue;
    }
    plan.claimable.push(record.id);
  }

  return plan;
}

/** The three record families a claim covers, each with its own plan. */
export interface GuestClaimPlans {
  bookings: GuestClaimPlan;
  quoteRequests: GuestClaimPlan;
  recurrings: GuestClaimPlan;
}

/** Everything a claim touched, as the surface reports it. */
export interface GuestClaimResult extends GuestClaimPlans {
  /** Total records actually linked by this run. */
  linked: number;
  /** Records already this account's — reported, not re-linked. */
  alreadyLinked: number;
  /** Records belonging to a different account — never touched. */
  ownedElsewhere: number;
}

/** Build all three plans at once (the shape both adapters hand to `applyClaim`). */
export function planGuestClaimAll(input: {
  bookings: readonly Booking[];
  quoteRequests?: readonly QuoteRequest[];
  recurrings?: readonly RecurringBooking[];
  identity: ClaimIdentity;
}): GuestClaimPlans {
  const asRecord = (r: {
    id: string;
    customerId?: string;
    customerPhone: string;
    customerEmail?: string;
  }): ClaimableRecord & { id: string } => ({
    id: r.id,
    customerId: r.customerId ?? null,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail ?? null,
  });
  return {
    bookings: planGuestClaim(input.bookings.map(asRecord), input.identity),
    quoteRequests: planGuestClaim((input.quoteRequests ?? []).map(asRecord), input.identity),
    recurrings: planGuestClaim((input.recurrings ?? []).map(asRecord), input.identity),
  };
}

/** Tally the plans into the numbers the surface shows. */
export function summarizeGuestClaim(plans: GuestClaimPlans): GuestClaimResult {
  const all = [plans.bookings, plans.quoteRequests, plans.recurrings];
  return {
    ...plans,
    linked: all.reduce((n, p) => n + p.claimable.length, 0),
    alreadyLinked: all.reduce((n, p) => n + p.alreadyOwned.length, 0),
    ownedElsewhere: all.reduce((n, p) => n + p.foreign.length, 0),
  };
}

/**
 * Is an email match worth flagging to an administrator? True when a record looks
 * like the customer's by email but carried a different (or absent) phone, so the
 * claim refused it. This is the honest middle: the platform says "we see a
 * booking that might be yours" without handing over a record it cannot prove.
 */
export function emailOnlyMatches(
  records: readonly ClaimableRecord[],
  identity: ClaimIdentity
): string[] {
  const email = normEmail(identity.email);
  const phone = normalizeClaimPhone(identity.phone);
  if (!email) return [];
  return records
    .filter((r) => {
      if ((r.customerId ?? null) !== null) return false; // owned records are not ambiguous
      if (normEmail(r.customerEmail) !== email) return false;
      return phone === null || normalizeClaimPhone(r.customerPhone) !== phone;
    })
    .map((r) => r.id);
}
