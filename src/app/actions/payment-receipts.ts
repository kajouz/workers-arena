"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyManualLink, type ManualLinkParams } from "@/lib/payments/manual-link";
import { savePaymentReceipt, MAX_RECEIPT_BYTES, type ReceiptSaveError } from "@/lib/data/payment-receipts";
import { findManualPayment } from "@/lib/data/payment-workflow-engine";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

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
 *
 * Workflow v2: an upload is refused once the payment is no longer pending
 * ("closed") or its evidence has been frozen by the confirm ("locked"), and is
 * throttled per reference and per client ("rate-limited").
 */
export async function uploadPaymentReceiptAction(
  link: ManualLinkParams,
  dataUrl: string
): Promise<
  { ok: true; uploadedAt: string } | { ok: false; error: "invalid-link" | "closed" | "rate-limited" | ReceiptSaveError }
> {
  const parsedLink = linkSchema.safeParse(link);
  // Base64 inflates by 4/3; anything much longer is refused before parsing.
  if (!parsedLink.success || typeof dataUrl !== "string" || dataUrl.length > MAX_RECEIPT_BYTES * 1.4 + 100) {
    return { ok: false, error: typeof dataUrl === "string" && dataUrl.length > MAX_RECEIPT_BYTES * 1.4 + 100 ? "too-large" : "invalid-link" };
  }
  const verified = await verifyManualLink(parsedLink.data);
  if (!verified.ok) return { ok: false, error: "invalid-link" };
  if (!(await withinUploadLimits(verified.ref))) return { ok: false, error: "rate-limited" };
  const payment = await findManualPayment({ reference: verified.ref });
  if (payment && payment.status !== "pending") return { ok: false, error: "closed" };

  const saved = await savePaymentReceipt({ reference: verified.ref, provider: verified.provider, dataUrl });
  if (!saved.ok) return saved;
  revalidatePath("/admin");
  return { ok: true, uploadedAt: saved.receipt.uploadedAt };
}

/** 10 uploads per reference per hour, 30 per client per hour. Outside a
 * request scope (unit tests) there is no client to throttle. */
async function withinUploadLimits(reference: string): Promise<boolean> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return true;
  let ip: string;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  } catch {
    return true;
  }
  const hour = 60 * 60_000;
  return (await checkRateLimit(`receipt:ref:${reference}`, 10, hour)) && (await checkRateLimit(`receipt:ip:${ip}`, 30, hour));
}
