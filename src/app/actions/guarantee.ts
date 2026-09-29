"use server";

import { revalidatePath } from "next/cache";
import { requireBookingCustomer, requireRole, type GuestProof } from "@/lib/data/authz";
import { getBookingById, getBookingSettlement } from "@/lib/data/repo";
import {
  completedAtOf,
  fileGuaranteeClaim,
  guaranteeCover,
  resolveGuaranteeClaim,
  type GuaranteeOutcome,
} from "@/lib/data/guarantee";
import { sanitizeText } from "@/lib/security";

/**
 * WorkersArena Guarantee actions (src/lib/data/guarantee.ts). The customer
 * files; an admin resolves. Eligibility is re-derived on the server from the
 * booking and its settlement — nothing the form sends decides coverage.
 */

export type GuaranteeActionResult = {
  ok: boolean;
  error?: "unauthorized" | "not-found" | "not-covered" | "already-filed" | "invalid" | "already-resolved" | "invalid-refund";
};

function guestProofFrom(formData: FormData): GuestProof {
  const phone = formData.get("guestPhone");
  return typeof phone === "string" && phone.trim() ? { guestPhone: phone.trim() } : {};
}

/** Customer: report a problem with a completed, platform-paid job. */
export async function fileGuaranteeClaimAction(bookingId: string, formData: FormData): Promise<GuaranteeActionResult> {
  if (!bookingId) return { ok: false, error: "invalid" };
  const party = await requireBookingCustomer(bookingId, guestProofFrom(formData));
  if (!party.ok) return { ok: false, error: "unauthorized" };

  const [booking, settlement] = await Promise.all([getBookingById(bookingId), getBookingSettlement(bookingId)]);
  if (!booking || !settlement) return { ok: false, error: "not-found" };

  const cover = guaranteeCover({
    status: booking.status,
    completedAt: completedAtOf(booking.events),
    settlement,
    nowMs: Date.now(),
  });
  if (!cover.covered) return { ok: false, error: "not-covered" };

  const description = sanitizeText(String(formData.get("description") ?? ""));
  const res = await fileGuaranteeClaim({
    bookingId: booking.id,
    bookingNumber: booking.number,
    workerId: booking.workerId,
    customerName: booking.customerName,
    description,
    coverMinor: cover.coverMinor,
    currency: booking.currency,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/bookings");
  revalidatePath("/admin");
  return { ok: true };
}

/** Admin: resolve an open claim — redo, refund (≤ cover) or reject. */
export async function resolveGuaranteeClaimAction(
  claimId: string,
  outcome: GuaranteeOutcome,
  refundMajor?: number,
  note?: string
): Promise<GuaranteeActionResult> {
  const admin = await requireRole("admin");
  if (!admin.ok) return { ok: false, error: "unauthorized" };
  if (!claimId || !["redo", "refunded", "rejected"].includes(outcome)) return { ok: false, error: "invalid" };

  const res = await resolveGuaranteeClaim({
    claimId,
    outcome,
    // Money arrives in major units from the admin form (×100 → minor).
    refundMinor: outcome === "refunded" ? Math.round(Number(refundMajor) * 100) : undefined,
    note: note ? sanitizeText(note) : undefined,
    adminId: admin.session.id,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin");
  revalidatePath("/bookings");
  return { ok: true };
}
