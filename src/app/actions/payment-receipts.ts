"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyManualLink, type ManualLinkParams } from "@/lib/payments/manual-link";
import { savePaymentReceipt, MAX_RECEIPT_BYTES, type ReceiptImageError } from "@/lib/data/payment-receipts";

const linkSchema = z.object({
  provider: z.string().max(10).nullable().optional(),
  bookingId: z.string().max(120).nullable().optional(),
  campaignId: z.string().max(120).nullable().optional(),
  paymentId: z.string().max(120).nullable().optional(),
  ref: z.string().max(200).nullable().optional(),
  amount: z.union([z.string().max(20), z.number()]).nullable().optional(),
  sig: z.string().max(200).nullable().optional(),
});

/**
 * Step 3 — the payer attaches a photo of their OMT/Whish receipt from the
 * signed instructions page. Authorization is the link itself: its HMAC is
 * re-verified here (never trusted from the page), and the photo is stored for
 * THAT link's reference only. This is how a guest who booked without an
 * account can still send a receipt. The browser compresses the image first;
 * the server re-checks type, size and the file signature.
 */
export async function uploadPaymentReceiptAction(
  link: ManualLinkParams,
  dataUrl: string
): Promise<{ ok: true; uploadedAt: string } | { ok: false; error: "invalid-link" | ReceiptImageError }> {
  const parsedLink = linkSchema.safeParse(link);
  // Base64 inflates by 4/3; anything much longer is refused before parsing.
  if (!parsedLink.success || typeof dataUrl !== "string" || dataUrl.length > MAX_RECEIPT_BYTES * 1.4 + 100) {
    return { ok: false, error: typeof dataUrl === "string" && dataUrl.length > MAX_RECEIPT_BYTES * 1.4 + 100 ? "too-large" : "invalid-link" };
  }
  const verified = await verifyManualLink(parsedLink.data);
  if (!verified.ok) return { ok: false, error: "invalid-link" };

  const saved = await savePaymentReceipt({ reference: verified.ref, provider: verified.provider, dataUrl });
  if (!saved.ok) return saved;
  revalidatePath("/admin");
  return { ok: true, uploadedAt: saved.receipt.uploadedAt };
}
