import type { Campaign, CampaignPayment, CampaignRefundContext, Notification } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * CAMPAIGN REFUND NOTIFICATION — single source of truth
 * ────────────────────────────────────────────────────────────────────────────
 * The campaignRefunded notification (admin refunds a paid campaign purchase) is
 * built here — mirroring src/lib/data/booking-notifications.ts — so the outbound
 * copy the DEMO and PRISMA refund adapters dispatch and the copy the /admin
 * campaign-payments card PREVIEWS (renderCampaignRefundEmail) can never drift:
 * the preview shows exactly what the company received.
 *
 * The amount + reason ride CampaignRefundContext (rendered as the refund card
 * rows in the email); the body stays amount-bearing so the inbox/bell tells the
 * same story without opening the email.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** A campaign-refund notification input ready for pushNotification. */
export type CampaignRefundNotificationPayload = Omit<Notification, "id" | "time" | "read"> & {
  campaignRefund: CampaignRefundContext;
};

/**
 * Build the payload for the campaign-goes-live notification (the manual/
 * webhook confirm flips the campaign ACTIVE) — the single source of truth for
 * the copy the DEMO and PRISMA confirm adapters dispatch (previously inlined
 * in both). The AR body carries the Arabic campaign name, so the SMS/WhatsApp/
 * push channels (which render these bodies verbatim) never show the EN name
 * inside Arabic copy.
 */
export function campaignActiveNotification(
  campaign: Pick<Campaign, "nameEn" | "nameAr">
): Omit<Notification, "id" | "time" | "read"> {
  return {
    type: "campaign",
    titleEn: "Campaign is live",
    titleAr: "الحملة نشطة الآن",
    bodyEn: `${campaign.nameEn} is now running — ads are being served across your placements.`,
    bodyAr: `${campaign.nameAr} تعمل الآن — يتم عرض الإعلانات في المواضع المحددة.`,
    href: "/company",
  };
}

/** Build the payload for a campaign refund (single source of truth). */
export function campaignRefundNotification(
  campaign: Pick<Campaign, "nameEn" | "nameAr">,
  payment: Pick<CampaignPayment, "amount" | "currency" | "refundReason">,
  href = "/company"
): CampaignRefundNotificationPayload {
  const reason = payment.refundReason?.trim();
  const reasonSuffix = reason ? ` — ${reason}` : "";
  // The body amount is rounded the SAME way the email card formats it
  // (formatPrice rounds to whole major units), so inbox and email never tell
  // different numbers.
  const refundMajor = String(Math.round(payment.amount / 100));
  return {
    type: "campaignRefunded",
    titleEn: "Campaign refunded",
    titleAr: "تم استرداد الحملة",
    bodyEn: `${refundMajor} ${payment.currency} refunded for ${campaign.nameEn}${reasonSuffix}.`,
    bodyAr: `تم استرداد ${refundMajor} ${payment.currency} لحملة ${campaign.nameAr}${reasonSuffix}.`,
    href,
    campaignRefund: {
      // Both names travel in the payload so renderCampaignRefundEmail can
      // render the card + subject in the EMAIL's locale (the AR email shows
      // the Arabic campaign name, not a stray EN one in an RTL card).
      campaignName: campaign.nameEn,
      campaignNameAr: campaign.nameAr,
      amount: payment.amount,
      currency: payment.currency,
      reason: reason || undefined,
    },
  };
}
