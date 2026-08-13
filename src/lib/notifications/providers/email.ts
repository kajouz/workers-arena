import { emailProviderName, type EmailProviderName } from "../config";
import { renderBookingEmail, renderCampaignRefundEmail, renderEmail, type RenderedEmail } from "../templates";
import type { ChannelPayload, DispatchResult, NotificationChannel } from "../types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * EMAIL CHANNEL
 * ────────────────────────────────────────────────────────────────────────────
 * Providers (NOTIFY_EMAIL_PROVIDER):
 *   console → structured dev log (always available, no deps)
 *   smtp    → nodemailer (dynamically imported — install via `npm i nodemailer`)
 *   resend  → Resend REST SDK (dynamically imported — install via `npm i resend`)
 *
 * The SDK imports are lazy and failure-tolerant: if the package isn't installed
 * or the credentials are missing, the channel reports a non-throwing error
 * instead of crashing the action that triggered the notification.
 * ────────────────────────────────────────────────────────────────────────────
 */

const FROM_FALLBACK = "WorkersArena <no-reply@workersarena.com>";

/**
 * Pick the renderer — booking-lifecycle payloads get the confirmation variant
 * (details card + admin dispute-view link), campaign refunds the refund card,
 * everything else the standard email.
 */
function renderForChannel(payload: ChannelPayload, locale: "en" | "ar"): RenderedEmail {
  if (payload.booking) return renderBookingEmail(payload, locale);
  if (payload.campaignRefund) return renderCampaignRefundEmail(payload, locale);
  return renderEmail(payload, locale);
}

/**
 * Dev-only structured log. Visible in the terminal while developing. Card
 * variants (booking confirmation + campaign refund) additionally print the
 * FULL rendered message (plain text + HTML) so the details card — number,
 * slot, quote, admin dispute-view link / refund amount + reason — is visible
 * in the terminal without opening a mail client.
 */
function logEmail(payload: ChannelPayload, rendered: RenderedEmail, provider: string): DispatchResult {
  const to = payload.recipient
    ? `${payload.recipient.name ?? ""} <${payload.recipient.email ?? "no-email"}>`.trim()
    : "unknown recipient";
  console.log(
    `\n📧 [notify:email:${provider}] → ${to}\n` +
      `   Subject: ${rendered.subject}\n` +
      `   Title:   ${payload.titleEn}${payload.titleAr !== payload.titleEn ? " | " + payload.titleAr : ""}\n` +
      `   Body:    ${payload.bodyEn}${payload.bodyAr !== payload.bodyEn ? " | " + payload.bodyAr : ""}\n` +
      `   Href:    ${payload.href ?? "—"}`
  );
  if (payload.booking || payload.campaignRefund) {
    console.log(`   ── plain text ──────────────────────────────\n${rendered.text}`);
    console.log(`   ── html ────────────────────────────────────\n${rendered.html}`);
  }
  return { channel: "email", ok: true, provider };
}

class ConsoleEmailChannel implements NotificationChannel {
  readonly id = "email";
  readonly provider = "console";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    const rendered = renderForChannel(payload, payload.recipient?.locale ?? "en");
    return logEmail(payload, rendered, this.provider);
  }
}

class SmtpEmailChannel implements NotificationChannel {
  readonly id = "email";
  readonly provider = "smtp";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      // Lazy import keeps the bundle dependency-free until SMTP is configured.
      const mod = await import(/* webpackIgnore: true */ "nodemailer");
      const nodemailer = mod.default ?? mod;
      const host = process.env.NOTIFY_SMTP_HOST;
      if (!host) throw new Error("NOTIFY_SMTP_HOST is not configured");

      const { subject, html, text } = renderForChannel(payload, payload.recipient?.locale ?? "en");
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.NOTIFY_SMTP_PORT ?? 587),
        secure: process.env.NOTIFY_SMTP_PORT === "465",
        auth:
          process.env.NOTIFY_SMTP_USER
            ? { user: process.env.NOTIFY_SMTP_USER, pass: process.env.NOTIFY_SMTP_PASS }
            : undefined,
      });
      await transporter.sendMail({
        from: process.env.NOTIFY_MAIL_FROM ?? FROM_FALLBACK,
        to: payload.recipient?.email,
        subject,
        html,
        text,
      });
      return { channel: "email", ok: true, provider: "smtp" };
    } catch (err) {
      return {
        channel: "email",
        ok: false,
        provider: "smtp",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

class ResendEmailChannel implements NotificationChannel {
  readonly id = "email";
  readonly provider = "resend";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
      if (!payload.recipient?.email) throw new Error("recipient has no email address");

      const mod = await import(/* webpackIgnore: true */ "resend");
      const { Resend } = mod;
      const resend = new Resend(apiKey);
      const { subject, html, text } = renderForChannel(payload, payload.recipient?.locale ?? "en");
      await resend.emails.send({
        from: process.env.NOTIFY_MAIL_FROM ?? FROM_FALLBACK,
        to: [payload.recipient.email],
        subject,
        html,
        text,
      });
      return { channel: "email", ok: true, provider: "resend" };
    } catch (err) {
      return {
        channel: "email",
        ok: false,
        provider: "resend",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createEmailChannel(name: EmailProviderName = emailProviderName()): NotificationChannel {
  switch (name) {
    case "smtp":
      return new SmtpEmailChannel();
    case "resend":
      return new ResendEmailChannel();
    default:
      return new ConsoleEmailChannel();
  }
}
