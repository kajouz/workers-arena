"use server";

/**
 * WhatsApp delivery audit — admin actions.
 *
 * The re-send operates on the delivery-ledger row: it re-dispatches the
 * stored ChannelPayload through the WhatsApp channel (recording suppressed —
 * the outcome is stamped on the SAME row so the attempt count stays honest)
 * and leaves an admin-activity trail of who intervened.
 */

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-demo";
import { logAdminActivity, ACTION_CODES } from "@/lib/data/activity";
import { resendWhatsAppDelivery } from "@/lib/data/whatsapp-delivery-store";

export interface WhatsAppResendResult {
  ok: boolean;
  error?: "unauthorized" | "not-found" | "already-delivered" | "no-payload" | "delivery-failed" | string;
}

export async function resendWhatsAppDeliveryAction(deliveryId: string): Promise<WhatsAppResendResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  if (!deliveryId) return { ok: false, error: "not-found" };

  const result = await resendWhatsAppDelivery(deliveryId);

  if (result.ok) {
    await logAdminActivity({
      code: ACTION_CODES.WHATSAPP_DELIVERY_RESENT,
      actionEn: `${session.name} re-sent WhatsApp delivery ${deliveryId}`,
      actionAr: `${session.name} أعاد إرسال رسالة واتساب ${deliveryId}`,
      actor: session.name ?? "Admin",
      type: "system",
    });
    revalidatePath("/admin");
  }

  return result;
}
