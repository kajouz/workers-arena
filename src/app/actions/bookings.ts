"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import {
  cancelBooking,
  confirmBookingPayment,
  createBookingCheckout,
  createBookingRequest,
  generateSlots,
  getWorkerBySlug,
  getWorkerSlots,
  rescheduleBooking,
  respondToBooking,
  setSlotBlocked,
  transitionBooking,
} from "@/lib/data/repo";
import type { BookingTransitionTarget } from "@/lib/data/types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING SERVER ACTIONS (M1 — docs/booking-scheduling.md §5)
 * ────────────────────────────────────────────────────────────────────────────
 * Each action: validate input → repo call → revalidate the affected routes →
 * return { ok, error? }. Money arrives in MAJOR units from the client form
 * and is converted to MINOR units (×100) before reaching the repo — the schema
 * convention (Subscription.price / Payment.amount / Booking.quote all ×100).
 * ────────────────────────────────────────────────────────────────────────────
 */

export type BookingActionResult = { ok: boolean; error?: "slot-taken" | "invalid" | "not-found" };

const requestSchema = z.object({
  slotId: z.string().min(1),
  customerName: z.string().min(2),
  customerPhone: z.string().min(8),
  customerEmail: z.string().email().optional().or(z.literal("")),
  jobTitle: z.string().min(3),
  note: z.string().optional(),
  serviceItemName: z.string().optional(),
});

/** Customer side: request a booking on a specific slot of a worker's profile. */
export async function requestBookingAction(
  workerSlug: string,
  formData: FormData
): Promise<BookingActionResult> {
  const parsed = requestSchema.safeParse({
    slotId: formData.get("slotId"),
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    customerEmail: formData.get("customerEmail"),
    jobTitle: formData.get("jobTitle"),
    note: formData.get("note"),
    serviceItemName: formData.get("serviceItemName"),
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const worker = await getWorkerBySlug(workerSlug);
  if (!worker) return { ok: false, error: "invalid" };

  // Resolve the picked service item (by nameEn) so the booking carries pricing.
  const serviceItem = parsed.data.serviceItemName
    ? worker.services.find((s) => s.nameEn === parsed.data.serviceItemName)
    : undefined;

  // Signed-in customers carry their user id onto the booking — the M3 confirm
  // path uses it to mint the receipt (Invoice row / Booking.invoice). Guests
  // (no session) stay phone-keyed and get no invoice.
  const session = await getSession();

  const result = await createBookingRequest({
    workerId: worker.id,
    slotId: parsed.data.slotId,
    customerId: session?.id,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    customerEmail: parsed.data.customerEmail || undefined,
    jobTitle: parsed.data.jobTitle,
    note: parsed.data.note || undefined,
    serviceItem,
  });

  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/workers/${workerSlug}`);
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

/** Money in major units from the form — must parse to a finite number (×100 → minor). */
const moneyField = z
  .string()
  .regex(/^\d*\.?\d*$/)
  .refine((v) => v === "" || Number.isFinite(Number(v)), { message: "not-a-number" })
  .optional();

const respondSchema = z.object({
  accept: z.enum(["true", "false"]),
  quote: moneyField,
  deposit: moneyField,
  declineReason: z.string().optional(),
});

/** Worker side: accept (with optional quote/deposit) or decline a request. */
export async function respondBookingAction(
  bookingId: string,
  formData: FormData
): Promise<BookingActionResult> {
  const parsed = respondSchema.safeParse({
    accept: formData.get("accept"),
    // formData.get() returns null for absent fields, but the optional fields
    // only accept undefined — normalize all three so accept-without-deposit
    // and decline-without-quote/reason validate (regression: the RespondDialog
    // only sets a field when it applies, so null was failing EVERY default
    // accept and decline).
    quote: formData.get("quote") || undefined,
    deposit: formData.get("deposit") || undefined,
    declineReason: formData.get("declineReason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const accept = parsed.data.accept === "true";
  const toMinor = (v?: string) => (v ? Math.round(Number(v) * 100) : undefined);

  const booking = await respondToBooking(bookingId, {
    accept,
    quote: toMinor(parsed.data.quote),
    deposit: toMinor(parsed.data.deposit),
    declineReason: parsed.data.declineReason || undefined,
  });
  if (!booking) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

/** Worker side: generate AVAILABLE slots from the weekly hours template (M2). */
export async function generateSlotsAction(
  workerSlug: string,
  formData: FormData
): Promise<{ ok: boolean; created?: number; error?: "invalid" }> {
  const worker = await getWorkerBySlug(workerSlug);
  if (!worker) return { ok: false, error: "invalid" };

  // Window defaults to the next 14 days (the customer-facing picker range).
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 13 * 24 * 60 * 60 * 1000);

  const created = await generateSlots(worker.id, {
    from: from.toISOString(),
    to: to.toISOString(),
  });

  revalidatePath("/dashboard");
  revalidatePath(`/workers/${workerSlug}`);
  return { ok: true, created };
}

const transitionSchema = z.object({
  to: z.enum(["inProgress", "completed", "noShow"]),
});

/**
 * Worker side: move a scheduled booking forward (M4) — inProgress /
 * completed / noShow. `to` arrives as a plain serializable arg (the doc's
 * signature); the state machine (BOOKING_TRANSITION_FROM) rejects illegal
 * moves in the repo layer.
 */
export async function transitionBookingAction(
  bookingId: string,
  to: BookingTransitionTarget
): Promise<BookingActionResult> {
  const parsed = transitionSchema.safeParse({ to });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const booking = await transitionBooking(bookingId, parsed.data.to);
  if (!booking) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

const cancelSchema = z.object({
  by: z.enum(["customer", "worker", "system"]).default("worker"),
  reason: z.string().max(500).optional(),
});

/**
 * Worker or customer side: cancel a booking (M4) — frees the slot, stores
 * the reason + actor, and notifies the other party.
 */
export async function cancelBookingAction(
  bookingId: string,
  formData: FormData
): Promise<BookingActionResult> {
  const parsed = cancelSchema.safeParse({
    by: (formData.get("by") as string | null) ?? undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const booking = await cancelBooking(bookingId, parsed.data);
  if (!booking) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

const setSlotBlockedSchema = z.object({
  slotId: z.string().min(1),
  blocked: z.enum(["true", "false"]),
  note: z.string().max(200).optional(),
});

/** Worker side: block/unblock a slot in the availability editor (M2). */
export async function setSlotBlockedAction(
  workerSlug: string,
  formData: FormData
): Promise<{ ok: boolean; error?: "invalid" | "not-found" }> {
  const parsed = setSlotBlockedSchema.safeParse({
    slotId: formData.get("slotId"),
    blocked: formData.get("blocked"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const worker = await getWorkerBySlug(workerSlug);
  if (!worker) return { ok: false, error: "invalid" };

  const slot = await setSlotBlocked(
    worker.id,
    parsed.data.slotId,
    parsed.data.blocked === "true",
    parsed.data.note
  );
  if (!slot) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath(`/workers/${workerSlug}`);
  return { ok: true };
}

/**
 * M4 — the RescheduleDialog's slot list: AVAILABLE slots of the worker that
 * are still in the future (a booking can only move to a slot that hasn't
 * started). Returns an empty array when none exist.
 */
export async function availableSlotsAction(
  workerId: string
): Promise<{ ok: boolean; slots?: { id: string; startAt: string; endAt: string }[]; error?: "invalid" }> {
  if (!workerId) return { ok: false, error: "invalid" };
  const from = new Date();
  const slots = await getWorkerSlots(workerId, { from: from.toISOString() });
  return {
    ok: true,
    slots: slots
      .filter((s) => s.status === "available" && new Date(s.startAt).getTime() > Date.now())
      .map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt })),
  };
}

const rescheduleSchema = z.object({
  targetSlotId: z.string().min(1),
  by: z.enum(["customer", "worker"]),
  reason: z.string().max(500).optional(),
});

/**
 * M4 — move a scheduled booking to a new slot (worker or customer side).
 * Submits the target slot + who's asking; the repo validates the status and
 * performs the atomic slot swap.
 */
export async function rescheduleBookingAction(
  bookingId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: "invalid" | "not-found" }> {
  const parsed = rescheduleSchema.safeParse({
    targetSlotId: formData.get("targetSlotId"),
    by: formData.get("by") || "worker",
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const booking = await rescheduleBooking(bookingId, parsed.data.targetSlotId, {
    by: parsed.data.by,
    reason: parsed.data.reason,
  });
  if (!booking) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

/**
 * M3 — start the deposit checkout for a PENDING_PAYMENT booking. Returns the
 * provider redirect URL (Stripe hosted checkout, or the local simulated
 * checkout when no keys are set) so the client can redirect the customer.
 */
export async function payBookingAction(
  bookingId: string
): Promise<{ ok: boolean; url?: string; error?: "invalid" | "not-found" }> {
  if (!bookingId) return { ok: false, error: "invalid" };
  const checkout = await createBookingCheckout(bookingId);
  if (!checkout) return { ok: false, error: "not-found" };
  return { ok: true, url: checkout.url };
}

/**
 * M3 — the payment webhook/simulated callback runs the same confirm path as
 * the repo; this action exists so the success page can reflect the outcome.
 * Returns ok when the booking is confirmed.
 */
export async function confirmPaymentAction(
  bookingId: string,
  providerRef: string
): Promise<{ ok: boolean; error?: "invalid" | "not-found" }> {
  if (!bookingId || !providerRef) return { ok: false, error: "invalid" };
  const booking = await confirmBookingPayment(bookingId, providerRef);
  if (!booking) return { ok: false, error: "not-found" };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}
