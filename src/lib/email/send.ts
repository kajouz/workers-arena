/**
 * Email sending service with SendGrid/Resend integration.
 *
 * Setup:
 * 1. Choose a provider: SendGrid or Resend
 * 2. Add the API key to .env.local:
 *    - SENDGRID_API_KEY=SG.xxx (for SendGrid)
 *    - RESEND_API_KEY=re_xxx (for Resend)
 * 3. Configure sender email:
 *    - EMAIL_FROM=noreply@workersarena.com
 */

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? "resend";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@workersarena.com";

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email using the configured provider
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, replyTo, tags } = options;

  if (EMAIL_PROVIDER === "sendgrid" && SENDGRID_API_KEY) {
    return sendWithSendGrid({ to, subject, html, text, replyTo, tags });
  }

  if (EMAIL_PROVIDER === "resend" && RESEND_API_KEY) {
    return sendWithResend({ to, subject, html, text, replyTo, tags });
  }

  // Fallback: log to console
  console.log("[Email] Would send:", {
    to,
    subject,
    html: html.slice(0, 100) + "...",
  });

  return { success: true, messageId: "console-fallback" };
}

/**
 * Send email using SendGrid
 */
async function sendWithSendGrid(options: EmailOptions): Promise<EmailResult> {
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: Array.isArray(options.to)
              ? options.to.map((email) => ({ email }))
              : [{ email: options.to }],
            subject: options.subject,
          },
        ],
        from: { email: EMAIL_FROM, name: "WorkersArena" },
        content: [
          { type: "text/html", value: options.html },
          ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
        ],
        reply_to: options.replyTo ? { email: options.replyTo } : undefined,
        categories: options.tags?.map((t) => t.value),
      }),
    });

    if (response.ok) {
      const messageId = response.headers.get("x-message-id");
      return { success: true, messageId: messageId ?? undefined };
    }

    const error = await response.text();
    return { success: false, error };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Send email using Resend
 */
async function sendWithResend(options: EmailOptions): Promise<EmailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, messageId: data.id };
    }

    return { success: false, error: data.message ?? "Unknown error" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Send a templated email
 */
export async function sendTemplatedEmail(
  template: "welcome" | "booking-confirmed" | "booking-reminder" | "weekly-digest",
  to: string,
  data: Record<string, any>
): Promise<EmailResult> {
  const templates: Record<string, { subject: string; html: string }> = {
    welcome: {
      subject: "Welcome to WorkersArena! 🎉",
      html: `
        <h1>Welcome, ${data.name}!</h1>
        <p>Thank you for joining WorkersArena. We're excited to have you on board!</p>
        <p>You can now:</p>
        <ul>
          <li>Browse workers in your area</li>
          <li>Book services with trusted professionals</li>
          <li>Leave reviews to help others</li>
        </ul>
        <p><a href="https://workersarena.com/search">Start exploring →</a></p>
      `,
    },
    "booking-confirmed": {
      subject: `Booking Confirmed #${data.bookingNumber}`,
      html: `
        <h1>Booking Confirmed! ✅</h1>
        <p>Your booking with <strong>${data.workerName}</strong> has been confirmed.</p>
        <p><strong>Service:</strong> ${data.jobTitle}</p>
        <p><strong>Date:</strong> ${data.date}</p>
        <p><strong>Time:</strong> ${data.time}</p>
        <p><a href="https://workersarena.com/bookings">View booking details →</a></p>
      `,
    },
    "booking-reminder": {
      subject: `Reminder: Booking tomorrow at ${data.time}`,
      html: `
        <h1>Booking Reminder ⏰</h1>
        <p>You have a booking tomorrow:</p>
        <p><strong>Worker:</strong> ${data.workerName}</p>
        <p><strong>Service:</strong> ${data.jobTitle}</p>
        <p><strong>Time:</strong> ${data.time}</p>
        <p><a href="https://workersarena.com/bookings">View details →</a></p>
      `,
    },
    "weekly-digest": {
      subject: "Your Weekly Summary 📊",
      html: data.html ?? "<h1>Weekly Digest</h1>",
    },
  };

  const templateData = templates[template];
  if (!templateData) {
    return { success: false, error: `Unknown template: ${template}` };
  }

  return sendEmail({
    to,
    subject: templateData.subject,
    html: templateData.html,
    tags: [{ name: "template", value: template }],
  });
}
