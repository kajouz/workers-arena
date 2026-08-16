"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import {
  cancelBooking,
  refundBookingDeposit,
  cancelRecurringContract,
  confirmBookingCompletion,
  confirmBookingPayment,
  createBookingCheckout,
  createBookingRequest,
  createQuoteRequest,
  createRecurringRequest,
  generateSlots,
  getAllBookings,
  getBookingById,
  acceptChatQuote,
  markChatRead,
  setChatTyping,
  getChatPresence,
  type ChatPresenceSnapshot,
  getBookingByNumber,
  getWorkerById,
  getWorkerBySlug,
  getWorkerSlots,
  rescheduleBooking,
  respondToBooking,
  respondToRecurring,
  selectQuote,
  sendBookingMessage,
  setSlotBlocked,
  submitQuote,
  transitionBooking,
} from "@/lib/data/repo";
import { MAX_QUOTE_WORKERS } from "@/lib/data/types";
import type { BookingTransitionTarget, RecurringFrequency, Worker } from "@/lib/data/types";
import { renderBookingAuditPrint, renderBookingTrailsPrint } from "@/lib/data/booking-print";
import { buildBookingTrailsCsv } from "@/lib/data/booking-trail-export";
import { PdfRenderError, renderAuditPdf } from "@/lib/data/booking-pdf";
import { dictionaries, translate } from "@/lib/i18n/dictionaries";
import { dispatch } from "@/lib/notifications/dispatcher";

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

const recurringFrequencySchema = z.enum(["weekly", "biweekly", "monthly"]);

/**
 * M1 recurring bookings (§7 #1) — same request shape plus a repeat cadence.
 * The first occurrence claims the slot exactly like a one-shot request; the
 * contract wraps it and the worker's single accept materializes the cadence.
 */
export async function requestRecurringBookingAction(
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
  const frequency = recurringFrequencySchema.safeParse(formData.get("frequency"));
  if (!parsed.success || !frequency.success) return { ok: false, error: "invalid" };

  const worker = await getWorkerBySlug(workerSlug);
  if (!worker) return { ok: false, error: "invalid" };

  const result = await createRecurringRequest({
    workerId: worker.id,
    slotId: parsed.data.slotId,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
    customerEmail: parsed.data.customerEmail || undefined,
    jobTitle: parsed.data.jobTitle,
    note: parsed.data.note || undefined,
    serviceItem: worker.services.find((s) => s.nameEn === parsed.data.serviceItemName),
    frequency: frequency.data as RecurringFrequency,
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

/** M1 — worker accepts (quote/deposit) or declines a whole recurring contract. */
export async function respondRecurringBookingAction(
  recurringId: string,
  formData: FormData
): Promise<BookingActionResult> {
  const parsed = respondSchema.safeParse({
    accept: formData.get("accept"),
    quote: formData.get("quote") || undefined,
    deposit: formData.get("deposit") || undefined,
    declineReason: formData.get("declineReason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const accept = parsed.data.accept === "true";
  const toMinor = (v?: string) => (v ? Math.round(Number(v) * 100) : undefined);

  const recurring = await respondToRecurring(recurringId, {
    accept,
    quote: toMinor(parsed.data.quote),
    deposit: toMinor(parsed.data.deposit),
    declineReason: parsed.data.declineReason || undefined,
  });
  if (!recurring) return { ok: false, error: "not-found" };

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

/** Customer side: cancel an active recurring contract — future visits stop. */
export async function cancelRecurringContractAction(
  recurringId: string,
  formData: FormData
): Promise<BookingActionResult> {
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const recurring = await cancelRecurringContract(recurringId, reason || undefined);
  if (!recurring) return { ok: false, error: "not-found" };
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

/**
 * §2.3 customer-confirms-completion — the customer confirms a staged
 * completion (completionPending → completed; earnings credit + worker
 * notified). Returns not-found unless the booking is staged.
 */
export async function confirmCompletionAction(bookingId: string): Promise<BookingActionResult> {
  if (!bookingId) return { ok: false, error: "invalid" };
  const booking = await confirmBookingCompletion(bookingId);
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

/**
 * §2.4 admin dispute view — cancel a booking as the platform (actor = admin):
 * the slot is freed, a CANCELLED audit event lands with the admin actor +
 * reason, BOTH the customer and the worker are notified (a platform action
 * tells both sides, unlike a party cancel which tells only the other), and a
 * paid deposit is always refunded (the window policy applies only to worker
 * cancels). The reason is required (an admin cancellation without one is
 * refused). Revalidates the dispute page + the two party surfaces.
 */
export async function adminCancelBookingAction(
  bookingId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: "invalid" | "not-found" | "unauthorized" | "reason" }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "reason" };
  const booking = await cancelBooking(bookingId, { by: "admin", reason, adminName: session.name });
  if (!booking) return { ok: false, error: "not-found" };
  revalidatePath(`/admin/bookings/${booking.number}`);
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  return { ok: true };
}

/**
 * §2.4 admin dispute view — refund the booking's PAID deposit WITHOUT
 * cancelling it (a money-only correction). Requires the deposit payment to be
 * PAID (idempotent — an already-refunded payment is a no-op), appends a
 * REFUNDED audit event, and emails the customer the refund. The reason is
 * required (mirrors the campaign-refund action). Admin-only.
 */
export async function refundBookingDepositAction(
  bookingId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: "invalid" | "not-found" | "unauthorized" | "reason" }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { ok: false, error: "reason" };
  const booking = await refundBookingDeposit(bookingId, { reason, adminName: session.name });
  if (!booking) return { ok: false, error: "not-found" };
  revalidatePath(`/admin/bookings/${booking.number}`);
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

/** The customer-facing payment methods — lowercase domain values; the seam
 * expects the provider casing ("STRIPE" | "OMT" | "WHISH"). */
const paymentMethodSchema = z.enum(["stripe", "omt", "whish"]);
const toProviderMethod = (m: "stripe" | "omt" | "whish") => (m === "omt" ? "OMT" : m === "whish" ? "WHISH" : "STRIPE");

/**
 * M3 — start the deposit checkout for a PENDING_PAYMENT booking. Returns the
 * provider redirect URL — Stripe's hosted checkout (or the local simulated
 * checkout when no keys are set), or the signed OMT/Whish instructions page
 * for the Lebanon-first manual methods — so the client can redirect the
 * customer. The chosen method is stamped on the Payment row at mint time.
 */
export async function payBookingAction(
  bookingId: string,
  method: "stripe" | "omt" | "whish" = "stripe"
): Promise<{ ok: boolean; url?: string; error?: "invalid" | "not-found" }> {
  if (!bookingId) return { ok: false, error: "invalid" };
  const parsed = paymentMethodSchema.safeParse(method);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const checkout = await createBookingCheckout(bookingId, toProviderMethod(parsed.data));
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

/* ─────────── Multi-candidate quotes (docs/multi-candidate-quotes.md) ─────────── */

/** Result shape for the quote-request action (rule 1 errors included). */
export type QuoteActionResult = {
  ok: boolean;
  error?: "invalid" | "too-many" | "duplicate" | "unknown-worker";
};

const quoteRequestSchema = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().min(8),
  customerEmail: z.string().email().optional().or(z.literal("")),
  jobTitle: z.string().min(3),
  note: z.string().optional(),
  serviceItemName: z.string().optional(),
});

/**
 * Customer side: post a job and invite up to MAX_QUOTE_WORKERS workers to
 * quote it (multi-candidate quotes — docs/multi-candidate-quotes.md). The
 * customer picks the workers (their profile slugs); category/city hints are
 * derived from the first picked worker (explicit-pick v1 scope — platform
 * matching is a thin extension of searchWorkers, deferred).
 */
export async function createQuoteRequestAction(
  workerSlugs: string[],
  formData: FormData
): Promise<QuoteActionResult> {
  const parsed = quoteRequestSchema.safeParse({
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    // formData.get() returns null for absent fields, but the optional fields
    // only accept undefined — normalize (the respondSchema pattern).
    customerEmail: formData.get("customerEmail") || undefined,
    jobTitle: formData.get("jobTitle"),
    note: formData.get("note") || undefined,
    serviceItemName: formData.get("serviceItemName") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (workerSlugs.length < 1 || workerSlugs.length > MAX_QUOTE_WORKERS) return { ok: false, error: "too-many" };

  const workers: { id: string; categorySlug: string; citySlug: string; services: Worker["services"] }[] = [];
  for (const slug of workerSlugs) {
    const w = await getWorkerBySlug(slug);
    if (!w) return { ok: false, error: "unknown-worker" };
    workers.push(w);
  }

  const session = await getSession();
  const first = workers[0]!;
  const serviceItem = parsed.data.serviceItemName
    ? first.services.find((s) => s.nameEn === parsed.data.serviceItemName)
    : undefined;

  const result = await createQuoteRequest(
    {
      customerId: session?.id,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail || undefined,
      jobTitle: parsed.data.jobTitle,
      note: parsed.data.note || undefined,
      serviceItem,
      categorySlug: first.categorySlug,
      citySlug: first.citySlug,
    },
    workers.map((w) => w.id)
  );

  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Worker side: submit a bid on a quote invite (rule 3 — bids are NOT
 * commitments: no slot is claimed). Money arrives in MAJOR units and is
 * converted to MINOR units (×100) before reaching the repo, like every other
 * quote/deposit in the app.
 */
export async function submitQuoteAction(
  bookingId: string,
  formData: FormData
): Promise<{ ok: boolean }> {
  const quoteRaw = formData.get("quote");
  const quote = typeof quoteRaw === "string" && quoteRaw.trim() ? Number(quoteRaw) : NaN;
  if (!Number.isFinite(quote) || quote <= 0) return { ok: false };
  const depositRaw = formData.get("deposit");
  const deposit =
    typeof depositRaw === "string" && depositRaw.trim() ? Number(depositRaw) : undefined;
  if (deposit !== undefined && (!Number.isFinite(deposit) || deposit < 0)) return { ok: false };

  const result = await submitQuote(bookingId, {
    quote: Math.round(quote * 100),
    deposit: deposit !== undefined ? Math.round(deposit * 100) : undefined,
  });
  if (!result) return { ok: false };
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Customer side: pick the winner + a slot from the winner's availability. The
 * winner's slot is claimed with the existing atomic CAS (rule 4); the losers
 * are DECLINED and the job flips to SELECTED in the same transaction.
 */
export async function selectQuoteAction(
  quoteRequestId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: "slot-taken" | "invalid" | "not-quoted" | "closed" }> {
  const winnerBookingId = formData.get("winnerBookingId");
  const slotId = formData.get("slotId");
  if (
    typeof winnerBookingId !== "string" ||
    !winnerBookingId ||
    typeof slotId !== "string" ||
    !slotId
  ) {
    return { ok: false, error: "invalid" };
  }

  const result = await selectQuote(quoteRequestId, winnerBookingId, slotId);
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* ─────────── §2.4 audit-trail email (PDF attachment on demand) ─────────── */

/** Result shape for the audit-email action. */
export type EmailAuditResult = {
  ok: boolean;
  error?: "invalid" | "unauthorized" | "not-found" | "no-email" | "render-failed" | "send-failed";
};

/** Who can receive the audit PDF: the customer and/or the worker. */
export type AuditRecipientKind = "customer" | "worker";

const auditRecipientSchema = z.enum(["customer", "worker"]);
const auditLocaleSchema = z.enum(["en", "ar"]);

/**
 * §2.4 — email the printable booking audit trail (BK-XXXX-audit.pdf) to the
 * customer and/or worker on demand. Renders the SAME standalone audit
 * document the print dialog shows (renderBookingAuditPrint) into a real PDF
 * via system Chrome (renderAuditPdf — the server-side twin of the browser's
 * print dialog), then dispatches one email per recipient through the channel
 * dispatcher with the PDF attached.
 *
 * Permission: admins always; the customer who owns the booking (matched by
 * customerId or email); the worker on the booking (matched by worker id or
 * the worker record's email).
 */
export async function emailBookingAuditAction(
  bookingNumber: string,
  recipients: AuditRecipientKind[],
  locale: "en" | "ar"
): Promise<EmailAuditResult> {
  if (!bookingNumber) return { ok: false, error: "invalid" };
  if (!recipients.length || recipients.some((r) => !auditRecipientSchema.safeParse(r).success))
    return { ok: false, error: "invalid" };
  if (!auditLocaleSchema.safeParse(locale).success) return { ok: false, error: "invalid" };

  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };

  const booking = await getBookingByNumber(bookingNumber);
  if (!booking) return { ok: false, error: "not-found" };

  const worker = await getWorkerById(booking.workerId);

  const isAdmin = session.role === "admin";
  const isOwner =
    session.role === "customer" &&
    Boolean(
      (booking.customerId && booking.customerId === session.id) ||
        (booking.customerEmail && booking.customerEmail === session.email)
    );
  const isWorker =
    session.role === "worker" &&
    Boolean((worker && worker.id === session.id) || (worker?.email && worker.email === session.email));
  if (!isAdmin && !isOwner && !isWorker) return { ok: false, error: "unauthorized" };

  const workerName = worker ? (locale === "ar" ? worker.nameAr : worker.nameEn) : undefined;
  const resolved = recipients.map((kind) =>
    kind === "customer"
      ? { kind, name: booking.customerName, email: booking.customerEmail }
      : { kind, name: workerName ?? booking.workerId, email: worker?.email }
  );
  if (resolved.some((r) => !r.email)) return { ok: false, error: "no-email" };

  // Render the audit document ONCE (the same bytes the print dialog shows) and
  // turn it into a real PDF — the attachment every recipient receives.
  let pdf: Buffer;
  try {
    pdf = await renderAuditPdf(renderBookingAuditPrint(booking, { locale, workerName }));
  } catch (err) {
    if (err instanceof PdfRenderError) return { ok: false, error: "render-failed" };
    throw err;
  }

  const subject = (l: "en" | "ar") =>
    `${translate(dictionaries[l], "booking.printTitle")} — ${booking.number}`;
  const body = (l: "en" | "ar") =>
    translate(dictionaries[l], "booking.emailAuditBody").replace("{number}", booking.number);

  // One email per recipient; a failing provider reports in its result without
  // throwing, so an SMTP hiccup surfaces as send-failed, not a 500.
  const results = (await Promise.all(
    resolved.map((r) =>
      dispatch({
        id: `email-audit-${booking.number}-${r.kind}-${Date.now()}`,
        type: "system",
        titleEn: subject("en"),
        titleAr: subject("ar"),
        bodyEn: body("en"),
        bodyAr: body("ar"),
        href: "/bookings",
        time: new Date().toISOString(),
        recipient: { name: r.name, email: r.email, locale },
        attachments: [
          { filename: `${booking.number}-audit.pdf`, content: pdf, contentType: "application/pdf" },
        ],
      })
    )
  )).flat();
  if (results.some((r) => !r.ok)) return { ok: false, error: "send-failed" };
  return { ok: true };
}

/* ─────────── §2.4 admin export: all bookings' event trails (CSV/PDF) ─────────── */

/** Result shape for the all-bookings trails export. */
export type TrailsExportResult = {
  ok: boolean;
  error?: "invalid" | "unauthorized" | "no-data" | "render-failed";
  count?: number;
  csv?: string;
  pdfBase64?: string;
};

const trailsExportFormatSchema = z.enum(["csv", "pdf"]);

/**
 * §2.4 — the admin export that mirrors the per-booking print view: every
 * booking's event trail in ONE CSV or PDF file (docs/ENHANCEMENT-PLAN.md
 * §2.4). Admin-only. CSV is the flat-table twin (one row per event, booking
 * facts prefixed); PDF renders the combined audit document
 * (renderBookingTrailsPrint) through system Chrome — the same renderer the
 * per-booking email uses. Returns the payload as text/base64 so the client
 * can trigger the download.
 */
export async function exportBookingTrailsAction(
  format: "csv" | "pdf",
  locale: "en" | "ar"
): Promise<TrailsExportResult> {
  if (!trailsExportFormatSchema.safeParse(format).success) return { ok: false, error: "invalid" };
  if (locale !== "en" && locale !== "ar") return { ok: false, error: "invalid" };

  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };

  const bookings = await getAllBookings();
  if (bookings.length === 0) return { ok: false, error: "no-data" };

  // Resolve the worker display names so the worker fact reads exactly like
  // the per-booking print view (localized name, not the raw worker id).
  const workerNames: Record<string, string> = {};
  for (const id of new Set(bookings.map((b) => b.workerId))) {
    const w = await getWorkerById(id);
    if (w) workerNames[id] = locale === "ar" ? w.nameAr : w.nameEn;
  }

  if (format === "csv") {
    return {
      ok: true,
      count: bookings.length,
      csv: buildBookingTrailsCsv(bookings, { locale, workerNames }),
    };
  }

  try {
    const pdf = await renderAuditPdf(renderBookingTrailsPrint(bookings, { locale, workerNames }));
    return { ok: true, count: bookings.length, pdfBase64: pdf.toString("base64") };
  } catch (err) {
    if (err instanceof PdfRenderError) return { ok: false, error: "render-failed" };
    throw err;
  }
}

/* ─────────── §2.3 booking chat (customer ⇄ worker thread) ─────────── */

/** Result shape for the chat-send action. */
export type ChatSendResult = {
  ok: boolean;
  error?: "invalid" | "unauthorized" | "not-found";
};

const chatTextSchema = z.string().min(1).max(4000);

/**
 * §2.3 — append a message to the booking's negotiation thread. The worker's
 * optional `quote` (major units from the form) is converted to minor (×100)
 * before the seam, matching the schema convention; the seam stamps the
 * sender role + real user id like an audit entry, so the negotiation stays
 * inside the booking's record.
 *
 * Permission: the customer who owns the booking (matched by customerId or
 * email), the worker on the booking (matched by worker id or the worker
 * record's email), or a platform admin — the same gate as the audit-email
 * action. Guests (phone-keyed bookings) cannot send from a signed-out session.
 */
export async function sendBookingMessageAction(
  bookingId: string,
  formData: FormData
): Promise<ChatSendResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };

  const text = String(formData.get("text") ?? "").trim();
  if (!chatTextSchema.safeParse(text).success) return { ok: false, error: "invalid" };
  // Optional in-thread quote — major units from the form, ×100 to minor.
  const rawQuote = String(formData.get("quote") ?? "").trim();
  let quoteMinor: number | undefined;
  if (rawQuote) {
    const parsed = Number(rawQuote);
    if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, error: "invalid" };
    quoteMinor = Math.round(parsed * 100);
  }

  // Permission gate — the same ownership rules as the audit-email action: the
  // booking's customer (customerId or email), its worker (id or email), or a
  // platform admin. Guests (phone-keyed, no session) cannot send.
  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "not-found" };
  const worker = await getWorkerById(booking.workerId);
  const isAdmin = session.role === "admin";
  const isOwner =
    session.role === "customer" &&
    Boolean(
      (booking.customerId && booking.customerId === session.id) ||
        (booking.customerEmail && booking.customerEmail === session.email)
    );
  const isWorker =
    session.role === "worker" &&
    Boolean((worker && worker.id === session.id) || (worker?.email && worker.email === session.email));
  if (!isAdmin && !isOwner && !isWorker) return { ok: false, error: "unauthorized" };

  const message = await sendBookingMessage(bookingId, {
    senderRole: isAdmin ? "admin" : isWorker ? "worker" : "customer",
    ...(session.id ? { senderId: session.id } : {}),
    text,
    ...(quoteMinor !== undefined ? { quote: quoteMinor } : {}),
  });
  if (!message) return { ok: false, error: "not-found" };

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/bookings/${booking.number}`);
  return { ok: true };
}

/**
 * §2.3 chat — the customer accepts the worker's quoted price straight from
 * the thread: the REQUESTED booking converts to CONFIRMED with the message's
 * quote, the slot is booked, the take-rate fee is stamped, and a customer
 * audit event lands in the trail. Permission: ONLY the booking's customer
 * (matched by customerId or email — the same ownership rule as the audit-email
 * action). Workers don't accept their own quote; admins stay read-only on the
 * thread. The state + message checks happen in the adapter (returns null →
 * "not-found" when the booking isn't negotiable or the message isn't a
 * worker quote).
 */
export async function acceptChatQuoteAction(
  bookingId: string,
  messageId: string
): Promise<ChatSendResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };

  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "not-found" };
  const isOwner =
    session.role === "customer" &&
    Boolean(
      (booking.customerId && booking.customerId === session.id) ||
        (booking.customerEmail && booking.customerEmail === session.email)
    );
  if (!isOwner) return { ok: false, error: "unauthorized" };

  const accepted = await acceptChatQuote(bookingId, messageId);
  if (!accepted) return { ok: false, error: "not-found" };

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/bookings/${booking.number}`);
  return { ok: true };
}

/* ─────────── §2.3 chat presence — read receipts + typing indicators ─────────── */

/** Result of the presence/read actions (share the chat error vocabulary). */
export type ChatPresenceResult = ChatSendResult | { ok: true; count?: number; presence?: ChatPresenceSnapshot };

/**
 * Shared party gate for the presence/read actions: the booking's customer or
 * its worker (admins are excluded — they read the thread read-only and never
 * mark messages seen or broadcast typing). Returns the resolved session +
 * booking (+ worker for the worker branch), or an error result.
 */
async function resolveChatParty(bookingId: string): Promise<
  | { ok: false; error: ChatSendResult["error"] }
  | {
      ok: true;
      session: { role: "customer" | "worker" };
      booking: NonNullable<Awaited<ReturnType<typeof getBookingById>>>;
    }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthorized" };
  if (session.role !== "customer" && session.role !== "worker") return { ok: false, error: "unauthorized" };
  // The role guard above narrows `role` for the rest of the call — capture it
  // so the return type stays literal (the poll/read seams want the exact role).
  const role = session.role;

  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false, error: "not-found" };
  const worker = await getWorkerById(booking.workerId);
  const isOwner =
    role === "customer" &&
    Boolean(
      (booking.customerId && booking.customerId === session.id) ||
        (booking.customerEmail && booking.customerEmail === session.email)
    );
  const isWorker =
    role === "worker" &&
    Boolean((worker && worker.id === session.id) || (worker?.email && worker.email === session.email));
  if (!isOwner && !isWorker) return { ok: false, error: "unauthorized" };
  return { ok: true, session: { role }, booking };
}

/**
 * §2.3 read receipt — the viewer opened the thread: every message the OTHER
 * party sent is stamped readAt (idempotent). The sender's own bubbles then
 * show "Seen" via the presence poll, so the receipt lands without a refresh.
 * Revalidates so the sender's row reflects the receipt on their next load.
 */
export async function markChatReadAction(bookingId: string): Promise<ChatPresenceResult> {
  const party = await resolveChatParty(bookingId);
  if (!party.ok) return party;
  const count = await markChatRead(bookingId, party.session.role);
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/bookings/${party.booking.number}`);
  return { ok: true, count };
}

/**
 * §2.3 typing indicator — set/clear the ephemeral "who is composing" flag.
 * The client calls it on the first keystroke of a burst and again when the
 * burst goes idle (2.5s) or the message is sent. No revalidate — the flag is
 * process-local and read by the other party's presence poll.
 */
export async function setChatTypingAction(
  bookingId: string,
  active: boolean
): Promise<ChatPresenceResult> {
  const party = await resolveChatParty(bookingId);
  if (!party.ok) return party;
  setChatTyping(bookingId, party.session.role, active);
  return { ok: true };
}

/**
 * §2.3 presence poll — who is typing (TTL-guarded) + the readAt per message
 * id. The expanded thread polls every ~3s while open; the readAt map is what
 * turns the sender's own bubbles into "Seen" without a page refresh.
 */
export async function getChatPresenceAction(bookingId: string): Promise<ChatPresenceResult> {
  const party = await resolveChatParty(bookingId);
  if (!party.ok) return party;
  const presence = await getChatPresence(bookingId);
  return { ok: true, presence };
}
