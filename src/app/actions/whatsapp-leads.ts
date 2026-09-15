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
import { dispatchLeadNotification, type LeadDispatchInput } from "@/lib/data/lead-notifications-dispatch";
import type { LeadGrade, LeadOffer, NotificationChannelConfig } from "@/lib/data/lead-market";

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
  /** Email/SMS dispatch results (if channels enabled). */
  dispatchResults?: Array<{ channel: string; ok: boolean; provider: string; error?: string }>;
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
  channels?: NotificationChannelConfig;
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
  const locale = worker.languages?.[0]?.code === "ar" ? "ar" : "en";
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
    locale
  );

  // Dispatch email/SMS notifications via the unified notification system
  let dispatchResults: Array<{ channel: string; ok: boolean; provider: string; error?: string }> | undefined;
  if (input.channels) {
    const dispatchInput: LeadDispatchInput = {
      workerName: worker.nameEn,
      workerPhone: worker.phone,
      workerEmail: worker.email,
      workerLocale: locale,
      offer: {
        leadNumber: offer.leadNumber,
        grade: offer.grade as LeadGrade,
        priceCredits: offer.priceCredits,
        matchScore: offer.matchScore,
      },
      adminName,
      channels: input.channels,
    };
    dispatchResults = await dispatchLeadNotification(dispatchInput);
  }

  // Log the activity
  const channelsDesc = input.channels
    ? [input.channels.whatsapp ? "WhatsApp" : null, input.channels.email ? "Email" : null, input.channels.sms ? "SMS" : null].filter(Boolean).join(" + ")
    : "WhatsApp";
  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED,
    actionEn: `${adminName} sent ${channelsDesc} notification to ${worker.nameEn} for lead ${offer.leadNumber} (${offer.grade})`,
    actionAr: `${adminName} أرسل إشعار ${channelsDesc} إلى ${worker.nameAr} للعميل المحتمل ${offer.leadNumber} (${offer.grade})`,
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
    dispatchResults,
  };
}

/**
 * Send WhatsApp notifications to ALL matched workers for a lead offer batch.
 * Admin selects a lead, and all matched workers get notified.
 */
export async function sendBatchWhatsAppNotifications(input: {
  leadId: string;
  customMessage?: string;
  channels?: NotificationChannelConfig;
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
  const allDispatchResults: Array<{ channel: string; ok: boolean; provider: string; error?: string }> = [];

  for (const offer of offers) {
    const worker = await getWorkerById(offer.workerId);
    if (!worker) continue;

    const locale = worker.languages?.[0]?.code === "ar" ? "ar" : "en";

    // WhatsApp deep link (always generated)
    if (worker.phone) {
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
        locale
      );

      notifications.push({
        workerId: worker.id,
        workerName: worker.nameEn,
        phone: worker.phone,
        url: notification.url,
        message: notification.message,
      });
    }

    // Email/SMS dispatch via unified notification system
    if (input.channels) {
      const dispatchInput: LeadDispatchInput = {
        workerName: worker.nameEn,
        workerPhone: worker.phone,
        workerEmail: worker.email,
        workerLocale: locale,
        offer: {
          leadNumber: offer.leadNumber,
          grade: offer.grade as LeadGrade,
          priceCredits: offer.priceCredits,
          matchScore: offer.matchScore,
        },
        adminName,
        channels: input.channels,
      };
      const results = await dispatchLeadNotification(dispatchInput);
      allDispatchResults.push(...results);
    }
  }

  if (notifications.length === 0 && allDispatchResults.length === 0) {
    return { ok: false, error: "No workers with contact details found." };
  }

  // Log the batch activity
  const channelsDesc = input.channels
    ? [input.channels.whatsapp ? "WhatsApp" : null, input.channels.email ? "Email" : null, input.channels.sms ? "SMS" : null].filter(Boolean).join(" + ")
    : "WhatsApp";
  await logAdminActivity({
    code: ACTION_CODES.LEAD_PURCHASED,
    actionEn: `${adminName} sent ${channelsDesc} notifications to ${notifications.length} workers for lead ${input.leadId}`,
    actionAr: `${adminName} أرسل إشعارات ${channelsDesc} إلى ${notifications.length} عمال للعميل المحتمل ${input.leadId}`,
    actor: adminName,
    type: "payment",
  });

  revalidatePath("/admin/revenue-settings");
  revalidatePath("/dashboard/leads");

  return {
    ok: true,
    notifications,
    count: notifications.length,
    dispatchResults: allDispatchResults.length > 0 ? allDispatchResults : undefined,
  };
}
