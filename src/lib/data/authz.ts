/**
 * ────────────────────────────────────────────────────────────────────────────
 * AUTHORIZATION SEAM FOR SERVER ACTIONS
 * ────────────────────────────────────────────────────────────────────────────
 * Server Actions are PUBLIC HTTP endpoints: their action ids ship in the
 * client bundle and anything with the id can POST to them directly. The
 * origin check in src/proxy.ts only fires when an `Origin` header is present
 * (it deliberately allows server-to-server calls, which have none), so a
 * scripted request bypasses it entirely. Validating the shape of the input is
 * therefore NOT a permission check — an action that acts on a caller-supplied
 * id must resolve who is asking on the server, every time.
 *
 * This module is that resolution. Every mutating action routes through one of
 * the `resolve*Party` helpers, which answer a single question: is the current
 * session a party to this record, and in which role? Actions then branch on
 * the resolved actor instead of trusting a client-supplied one.
 *
 * ── Guest bookings ─────────────────────────────────────────────────────────
 * The product lets a signed-out customer book with a name + phone and then
 * manage that booking from /bookings?phone=… . The phone is therefore the
 * ONLY credential a guest has, and `GuestProof` accepts it as one — deliberately
 * matching the strength of the existing READ gate on that page rather than
 * inventing a stronger one here.
 *
 * That is a weak credential: anyone who knows a customer's phone number can
 * present it. It is not a regression (the same string already unlocks the read
 * view) and it is strictly better than the previous state of no check at all,
 * but it is not the end state. The fix is a signed, expiring magic link mailed
 * or texted at booking time, replacing `?phone=` for both reads and writes —
 * tracked as follow-up work, not solved here.
 *
 * ── Identity matching ──────────────────────────────────────────────────────
 * Worker identity resolves through `getWorkerByUserId` (the User→Worker FK in
 * real mode; the `u-worker` alias in demo mode), with two fallbacks for the
 * seeded/test sessions whose ids and emails line up differently. Customer
 * identity matches on `customerId` first and falls back to the booking's
 * email, mirroring the gate that already guards the chat actions.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { getSession, type SessionUser } from "@/lib/auth-demo";
import {
  getBookingById,
  getQuoteRequest,
  getRecurringById,
  getWorkerById,
  getWorkerByUserId,
  getWorkerBySlug,
} from "@/lib/data/repo";
import { normalizePhone } from "@/lib/notifications/types";
import type { Booking, QuoteRequest, RecurringBooking, Worker } from "@/lib/data/types";

/** Which side of a record the caller turned out to be. */
export type PartyActor = "customer" | "worker" | "admin";

/** The shared failure vocabulary — actions map these onto their own results. */
export type AuthzFailure = { ok: false; error: "unauthorized" | "not-found" };

/**
 * What a signed-out guest can present to prove they own a phone-keyed record.
 * See the module header: this is the same credential the /bookings read view
 * already accepts, and no stronger.
 */
export interface GuestProof {
  guestPhone?: string;
}

/** Resolved booking + the actor's role on it. */
export type BookingParty =
  | AuthzFailure
  | {
      ok: true;
      actor: PartyActor;
      session: SessionUser | null;
      booking: Booking;
      worker: Worker | null;
    };

/** Resolved recurring contract + the actor's role on it. */
export type RecurringParty =
  | AuthzFailure
  | {
      ok: true;
      actor: PartyActor;
      session: SessionUser | null;
      recurring: RecurringBooking;
    };

/** Resolved quote job + the actor's role on it. */
export type QuoteRequestParty =
  | AuthzFailure
  | {
      ok: true;
      actor: PartyActor;
      session: SessionUser | null;
      quoteRequest: QuoteRequest;
    };

/** Resolved worker profile the caller is allowed to administer. */
export type WorkerProfileParty =
  | AuthzFailure
  | {
      ok: true;
      actor: Extract<PartyActor, "worker" | "admin">;
      session: SessionUser;
      worker: Worker;
    };

/**
 * True when `session` is the worker that `workerId` belongs to. Three ways to
 * match, in decreasing authority:
 *   1. the session's own worker profile (`getWorkerByUserId` — the User→Worker
 *      FK in real mode, the `u-worker`/`w-khaled` alias in demo mode);
 *   2. the worker row's id equals the session id (sessions seeded straight
 *      onto a worker row, which the action tests use);
 *   3. the worker row's email equals the session email (the demo dataset,
 *      where the session id is `u-worker` but the emails line up).
 */
async function isWorkerOn(session: SessionUser, workerId: string): Promise<boolean> {
  if (session.role !== "worker") return false;

  const profile = await getWorkerByUserId(session.id);
  if (profile && profile.id === workerId) return true;

  if (session.id === workerId) return true;

  const worker = await getWorkerById(workerId);
  return Boolean(worker?.email && session.email && worker.email === session.email);
}

/**
 * True when `session` is the customer on a record carrying these customer
 * fields — matched by user id first, then by the email the record was booked
 * with (a signed-in customer who booked before signing up keeps access).
 */
function isCustomerOn(
  session: SessionUser,
  record: { customerId?: string; customerEmail?: string }
): boolean {
  if (session.role !== "customer") return false;
  if (record.customerId && record.customerId === session.id) return true;
  return Boolean(record.customerEmail && session.email && record.customerEmail === session.email);
}

/**
 * True when a signed-out caller presented the phone a guest record is keyed
 * on. Only applies to genuine guest records: once a record carries a
 * `customerId` it belongs to an account and the phone stops being a credential
 * for it.
 */
function guestPhoneMatches(
  record: { customerId?: string; customerPhone: string },
  proof: GuestProof
): boolean {
  if (record.customerId) return false;
  const presented = normalizePhone(proof.guestPhone);
  if (!presented) return false;
  return presented === normalizePhone(record.customerPhone);
}

/**
 * Resolve who is acting on a booking. Admins always pass; the booking's worker
 * and its customer pass on their own records; a signed-out caller passes only
 * by presenting the guest phone the booking is keyed on.
 */
export async function resolveBookingParty(
  bookingId: string,
  proof: GuestProof = {}
): Promise<BookingParty> {
  if (!bookingId) return { ok: false, error: "not-found" };
  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "not-found" };

  const session = await getSession();

  if (session?.role === "admin") {
    return { ok: true, actor: "admin", session, booking, worker: await getWorkerById(booking.workerId) };
  }
  if (session && (await isWorkerOn(session, booking.workerId))) {
    return { ok: true, actor: "worker", session, booking, worker: await getWorkerById(booking.workerId) };
  }
  if (session && isCustomerOn(session, booking)) {
    return { ok: true, actor: "customer", session, booking, worker: await getWorkerById(booking.workerId) };
  }
  if (!session && guestPhoneMatches(booking, proof)) {
    return { ok: true, actor: "customer", session: null, booking, worker: await getWorkerById(booking.workerId) };
  }
  return { ok: false, error: "unauthorized" };
}

/** `resolveBookingParty`, narrowed to the booking's worker (or an admin). */
export async function requireBookingWorker(bookingId: string): Promise<BookingParty> {
  const party = await resolveBookingParty(bookingId);
  if (!party.ok) return party;
  if (party.actor === "customer") return { ok: false, error: "unauthorized" };
  return party;
}

/** `resolveBookingParty`, narrowed to the booking's customer (or an admin). */
export async function requireBookingCustomer(
  bookingId: string,
  proof: GuestProof = {}
): Promise<BookingParty> {
  const party = await resolveBookingParty(bookingId, proof);
  if (!party.ok) return party;
  if (party.actor === "worker") return { ok: false, error: "unauthorized" };
  return party;
}

/** Resolve who is acting on a recurring contract — same rules as a booking. */
export async function resolveRecurringParty(
  recurringId: string,
  proof: GuestProof = {}
): Promise<RecurringParty> {
  if (!recurringId) return { ok: false, error: "not-found" };
  const recurring = await getRecurringById(recurringId);
  if (!recurring) return { ok: false, error: "not-found" };

  const session = await getSession();

  if (session?.role === "admin") return { ok: true, actor: "admin", session, recurring };
  if (session && (await isWorkerOn(session, recurring.workerId))) {
    return { ok: true, actor: "worker", session, recurring };
  }
  if (session && isCustomerOn(session, recurring)) {
    return { ok: true, actor: "customer", session, recurring };
  }
  if (!session && guestPhoneMatches(recurring, proof)) {
    return { ok: true, actor: "customer", session: null, recurring };
  }
  return { ok: false, error: "unauthorized" };
}

/**
 * Resolve who is acting on a quote job. The customer owns the job; a worker is
 * a party only through the candidate booking they were invited on, so the
 * worker branch checks every invited booking's workerId.
 */
export async function resolveQuoteRequestParty(
  quoteRequestId: string,
  proof: GuestProof = {}
): Promise<QuoteRequestParty> {
  if (!quoteRequestId) return { ok: false, error: "not-found" };
  const quoteRequest = await getQuoteRequest(quoteRequestId);
  if (!quoteRequest) return { ok: false, error: "not-found" };

  const session = await getSession();

  if (session?.role === "admin") return { ok: true, actor: "admin", session, quoteRequest };
  if (session && isCustomerOn(session, quoteRequest)) {
    return { ok: true, actor: "customer", session, quoteRequest };
  }
  if (session?.role === "worker") {
    for (const candidate of quoteRequest.bookings) {
      if (await isWorkerOn(session, candidate.workerId)) {
        return { ok: true, actor: "worker", session, quoteRequest };
      }
    }
  }
  if (!session && guestPhoneMatches(quoteRequest, proof)) {
    return { ok: true, actor: "customer", session: null, quoteRequest };
  }
  return { ok: false, error: "unauthorized" };
}

/**
 * Resolve the worker profile a caller may administer (availability, slot
 * blocking). Only the worker who owns the profile, or an admin — there is no
 * guest path onto a worker's calendar.
 */
export async function requireWorkerProfile(slug: string): Promise<WorkerProfileParty> {
  if (!slug) return { ok: false, error: "not-found" };
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };

  const worker = await getWorkerBySlug(slug);
  if (!worker) return { ok: false, error: "not-found" };

  if (session.role === "admin") return { ok: true, actor: "admin", session, worker };
  if (await isWorkerOn(session, worker.id)) return { ok: true, actor: "worker", session, worker };
  return { ok: false, error: "unauthorized" };
}

/** Require a signed-in session in one of `roles`. */
export async function requireRole(
  ...roles: SessionUser["role"][]
): Promise<{ ok: true; session: SessionUser } | AuthzFailure> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (!roles.includes(session.role)) return { ok: false, error: "unauthorized" };
  return { ok: true, session };
}
