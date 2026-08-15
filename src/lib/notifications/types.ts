import type { BookingEmailContext, CampaignRefundContext, Notification } from "@/lib/data/types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * NOTIFICATION CHANNEL ABSTRACTION
 * ────────────────────────────────────────────────────────────────────────────
 * Every outbound notification fans out through a set of `NotificationChannel`s
 * (in-app inbox is persisted separately by src/lib/data/notifications.ts).
 *
 * Supported channels (mirrors the prisma `NotificationChannel` enum
 * EMAIL/SMS/PUSH/WHATSAPP — IN_APP is the inbox record itself):
 *   - in-app   → inbox record (demo: in-memory · production: prisma.notification)
 *   - email    → console (dev) · SMTP via nodemailer · Resend API
 *   - sms      → console (dev) · Twilio SMS API
 *   - push     → console (dev) · Web Push via web-push (VAPID)
 *   - whatsapp → console (dev) · Meta WhatsApp Cloud API (Graph API via fetch)
 *
 * Providers are selected from env (see src/lib/notifications/config.ts) and are
 * loaded lazily so the app builds and runs without any provider SDK installed —
 * the console providers are the always-available dev fallback.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Who receives the notification (used by outbound channels for addressing). */
export interface NotificationRecipient {
  name?: string;
  email?: string;
  phone?: string;
  /** Preferred language — outbound templates render in it (default: "en"). */
  locale?: "en" | "ar";
}

/**
 * Strip display formatting (spaces, dashes, parentheses) from a phone number.
 * Real carriers — Twilio and especially the WhatsApp Cloud API — require clean
 * E.164, and the demo dataset stores formatted numbers like "+966 55 123 4871".
 */
export function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const clean = phone.replace(/[\s\-()]/g, "");
  return clean || undefined;
}

/** A fully materialized notification ready for outbound dispatch. */
export interface ChannelPayload {
  id: string;
  type: Notification["type"];
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  href?: string;
  time: string; // ISO
  recipient?: NotificationRecipient;
  /** Optional structured extras (e.g. campaignId) for future providers. */
  meta?: Record<string, string>;
  /**
   * Present on booking-lifecycle notifications: lets the email channel render
   * the booking-confirmation variant (details card + admin dispute-view link).
   */
  booking?: BookingEmailContext;
  /**
   * Present on campaign-refund notifications (admin refunds a paid campaign):
   * lets the email channel render the refund card (campaign name, refunded
   * amount, reason) — mirroring the bookingRefund email variant.
   */
  campaignRefund?: CampaignRefundContext;
  /**
   * Optional email attachments (e.g. the on-demand booking-audit PDF from
   * emailBookingAuditAction). Threaded to the real providers (nodemailer /
   * Resend); the console provider logs the filenames so dev stays observable.
   */
  attachments?: EmailAttachment[];
}

/** A binary email attachment (Buffer content — utf8 bytes for the JSON-ish
 * console log, raw bytes for the SMTP/Resend transports). */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Outcome of a single channel send. `ok: false` never throws upstream. */
export interface DispatchResult {
  channel: string;
  ok: boolean;
  provider: string;
  error?: string;
}

/** A pluggable outbound channel. */
export interface NotificationChannel {
  readonly id: string;
  readonly provider: string;
  send(payload: ChannelPayload): Promise<DispatchResult>;
}
