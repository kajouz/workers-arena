"use server";

/**
 * WhatsApp Lead Notifications — admin action
 *
 * Admin sends personalized WhatsApp messages to workers about new lead
 * offers. Generates wa.me deep links, logs the action, and returns the
 * links for the admin to open.
 */

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-demo";
import {
  getWorkerById,
  getWorkerBySlug,
  getLeadOffers,
  listLeadOffers,
} from "@/lib/data/repo";
import { logAdminActivity, ACTION_CODES } from "@/lib/data/activity";
import {
  buildWhatsAppLeadNotification,
  buildBatchWhatsAppNotifications,
  type WhatsAppLeadMessage,
} from "@/lib/data/whatsapp-leads";
import type { LeadGrade, LeadOffer } from "@/lib/data/lead-market";

const DEMO_WORKER_SLUG = "khaled-al-harbi-plumbing";

export interface WhatsAppSendResult {
  ok: true;
  /** The wa.me links, one per worker. */
  notifications: Array<{
    workerId: string;
    workerName: string;
    phone: string;
    url: string;
    message: string;
  }>;
  /** How many workers were notified. */
  count: number;
}

export interface WhatsAppSendError {
  ok: false;
  error: string;
}

/**
 * Send WhatsApp notification to a specific worker about a lead offer.
 */
export async function sendWhatsAppLeadNotification(input: {
  workerId: string;
  offerId: string;
  customMessage?: string;
}): Promise<WhatsAppSendResult | WhatsAppSendError> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Only admins can send WhatsApp notifications." };
  }

  const worker = await getWorkerById(input.workerId);
  if (!worker) return { ok: false, error: "Worker not found." };
  if (!worker.phone) return { ok: false, error: "Worker has no phone number." };

  // Find the offer
  const allOffers = await listLeadOffers(200);
  const offer = allOffers.find((o) => o.id === input.offerId);
  if (!offer) return { ok: false, error: "Lead offer not found." };

  const adminName = session.name ?? "Admin";
  const notification = buildWhatsAppLeadNotification(
    {
      workerPhone: worker.phone,
      workerName: worker.nameEn,
      offer: {
        leadNumber: offer.leadNumber,
        grade: offer.grade as LeadGrade,
        priceCredits: offer.priceCredits,
        matchScore: offer.matchScore,
      },
      adminName,
      customMessage: input.customMessage,
    },
    worker.languages?.[0]?.code === "ar" ? "ar" : "en"
  );

  // Log the activity
  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED, // reuse; a more specific code can be added later
    actionEn: `${adminName} sent WhatsApp notification to ${worker.nameEn} for lead ${offer.leadNumber} (${offer.grade})`,
    actionAr: `${adminName} أرسل إشعار واتساب إلى ${worker.nameAr} للعميل المحتمل ${offer.leadNumber} (${offer.grade})`,
    actor: adminName,
    type: "payment",
  });

  revalidatePath("/admin/revenue-settings");
  revalidatePath("/dashboard/leads");

  return {
    ok: true,
    notifications: [
      {
        workerId: worker.id,
        workerName: worker.nameEn,
        phone: worker.phone,
        url: notification.url,
        message: notification.message,
      },
    ],
    count: 1,
  };
}

/**
 * Send WhatsApp notifications to ALL matched workers for a lead offer batch.
 * Admin selects a lead, and all matched workers get notified.
 */
export async function sendBatchWhatsAppNotifications(input: {
  leadId: string;
  customMessage?: string;
}): Promise<WhatsAppSendResult | WhatsAppSendError> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Only admins can send WhatsApp notifications." };
  }

  // Get all offers for this lead
  const offers = await getLeadOffers(input.leadId);
  if (offers.length === 0) return { ok: false, error: "No offers found for this lead." };

  const adminName = session.name ?? "Admin";
  const notifications: WhatsAppSendResult["notifications"] = [];

  for (const offer of offers) {
    const worker = await getWorkerById(offer.workerId);
    if (!worker?.phone) continue;

    const notification = buildWhatsAppLeadNotification(
      {
        workerPhone: worker.phone,
        workerName: worker.nameEn,
        offer: {
          leadNumber: offer.leadNumber,
          grade: offer.grade as LeadGrade,
          priceCredits: offer.priceCredits,
          matchScore: offer.matchScore,
        },
        adminName,
        customMessage: input.customMessage,
      },
      worker.languages?.[0]?.code === "ar" ? "ar" : "en"
    );

    notifications.push({
      workerId: worker.id,
      workerName: worker.nameEn,
      phone: worker.phone,
      url: notification.url,
      message: notification.message,
    });
  }

  if (notifications.length === 0) {
    return { ok: false, error: "No workers with phone numbers found." };
  }

  // Log the batch activity
  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED,
    actionEn: `${adminName} sent WhatsApp notifications to ${notifications.length} workers for lead ${input.leadId}`,
    actionAr: `${adminName} أرسل إشعارات واتساب إلى ${notifications.length} عمال للعميل المحتمل ${input.leadId}`,
    actor: adminName,
    type: "payment",
  });

  revalidatePath("/admin/revenue-settings");
  revalidatePath("/dashboard/leads");

  return {
    ok: true,
    notifications,
    count: notifications.length,
  };
}
