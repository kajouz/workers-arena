import { appBaseUrl } from "./config";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { formatDate, formatPrice, type CurrencyCode } from "@/lib/utils";
import type { ChannelPayload } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * OUTBOUND TEMPLATES
 * ────────────────────────────────────────────────────────────────────────────
 * Renders a bilingual (EN/AR, LTR/RTL-aware) branded HTML email, a Web Push
 * payload, and compact plain-text SMS / WhatsApp messages from a ChannelPayload.
 * The locale argument picks the primary language; email always includes the
 * other language as a secondary block so recipients get both. All email styles
 * are inline — clients strip <style> blocks. SMS/WhatsApp are single-language
 * (160-char SMS can't carry a bilingual block).
 *
 * Booking-lifecycle payloads (ChannelPayload.booking set) render the
 * booking-confirmation variant (renderBookingEmail): the same chrome plus a
 * details card (booking number, slot date & time, quote, deposit) and a deep
 * link to the admin dispute view (/admin/bookings/{number}) — so the email,
 * the Recent-activity feed and the booking funnel all reference the same
 * booking. Campaign-refund payloads (ChannelPayload.campaignRefund set) render
 * the refund variant (renderCampaignRefundEmail): a card with the campaign
 * name, refunded amount and reason — mirroring the bookingRefund card so the
 * email, the activity feed and the /admin campaign-payments table tell one
 * story. Push/SMS/WhatsApp stay compact for every payload type.
 * ────────────────────────────────────────────────────────────────────────────
 */

const ACCENT = "#f97316"; // WorkersArena brand orange

/** Escapes text for safe HTML embedding (XSS-safe for user-derived strings). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Build the primary + secondary (other-language) copy. */
function copy(payload: ChannelPayload, locale: "en" | "ar") {
  const primary = {
    title: locale === "ar" ? payload.titleAr : payload.titleEn,
    body: locale === "ar" ? payload.bodyAr : payload.bodyEn,
  };
  const secondary = {
    title: locale === "ar" ? payload.titleEn : payload.titleAr,
    body: locale === "ar" ? payload.bodyEn : payload.bodyAr,
  };
  return { primary, secondary };
}

function appName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME ?? "WorkersArena";
}

function headerWord(locale: "en" | "ar"): string {
  return locale === "ar" ? "وركرز أرينا" : "WorkersArena";
}

function greeting(locale: "en" | "ar", name: string): string {
  if (locale === "ar") return name ? `مرحباً ${name}،` : "مرحباً،";
  return name ? `Hi ${name},` : "Hi,";
}

/**
 * Shared branded email chrome — header, greeting, title/body, CTA, an optional
 * extra HTML block (details cards), the other-language block and the footer.
 * Keeps the two renderers (plain + booking variant) byte-identical in chrome.
 */
function emailShell(opts: {
  payload: ChannelPayload;
  locale: "en" | "ar";
  title: string;
  body: string;
  secondaryTitle: string;
  secondaryBody: string;
  greeting: string;
  ctaHref: string;
  ctaLabel: string;
  /** Extra HTML inserted between the CTA and the secondary-language block. */
  extraHtml?: string;
  /** Extra plain-text lines appended to the text version. */
  textExtra?: string[];
  /** Appended to the subject (e.g. a booking number for inbox scanning). */
  subjectSuffix?: string;
}): RenderedEmail {
  const {
    payload,
    locale,
    title,
    body,
    secondaryTitle,
    secondaryBody,
    greeting: greet,
    ctaHref,
    ctaLabel,
    extraHtml = "",
    textExtra = [],
    subjectSuffix,
  } = opts;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const name = appName();

  const secondaryBlock =
    secondaryTitle === title && secondaryBody === body
      ? ""
      : `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding-top:20px;border-top:1px solid #eef0f3;">
        <tr>
          <td dir="${locale === "ar" ? "ltr" : "rtl"}">
            <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:#111827;font-weight:700;direction:${locale === "ar" ? "ltr" : "rtl"};text-align:${locale === "ar" ? "left" : "right"};">${esc(secondaryTitle)}</p>
            <p style="margin:0;font-size:14px;line-height:22px;color:#6b7280;direction:${locale === "ar" ? "ltr" : "rtl"};text-align:${locale === "ar" ? "left" : "right"};">${esc(secondaryBody)}</p>
          </td>
        </tr>
      </table>`;

  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.08);">
            <tr>
              <td style="background:linear-gradient(135deg,${ACCENT} 0%,#f59e0b 100%);padding:28px 32px;">
                <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-.02em;">${esc(headerWord(locale))}</p>
                <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.85);">${locale === "ar" ? "دليل السوق الموثوق للمحترفين" : "The trusted marketplace for professionals"}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">${greet}</p>
                <p style="margin:0 0 14px;font-size:22px;line-height:30px;color:#111827;font-weight:800;letter-spacing:-.01em;">${esc(title)}</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#374151;">${esc(body)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:12px;background-color:${ACCENT};">
                      <a href="${esc(ctaHref)}" style="display:inline-block;padding:12px 28px;border-radius:12px;background-color:${ACCENT};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${esc(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                ${extraHtml}
                ${secondaryBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#fafbfc;border-top:1px solid #eef0f3;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                  ${locale === "ar" ? "تم إرسال هذه الرسالة إليك من " + esc(name) + "." : "You're receiving this email from " + esc(name) + "."}
                  ${locale === "ar" ? "إذا لم تطلب هذا الإشعار، يمكنك تجاهله." : "If this wasn't expected, you can safely ignore it."}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textExtraBlock = textExtra.length ? `\n${textExtra.join("\n")}` : "";
  const text = `${greet}\n\n${title}\n${body}${textExtraBlock}\n\n→ ${ctaHref}\n\n— ${name}`;

  return { subject: `[${name}] ${title}${subjectSuffix ? ` — ${subjectSuffix}` : ""}`, html, text };
}

export function renderEmail(
  payload: ChannelPayload,
  locale: "en" | "ar"
): RenderedEmail {
  const { primary, secondary } = copy(payload, locale);
  const name = payload.recipient?.name ? esc(payload.recipient.name) : "";
  const baseUrl = appBaseUrl();
  const ctaHref = payload.href ? `${baseUrl}${payload.href}` : baseUrl;
  const ctaLabel = locale === "ar" ? "عرض التفاصيل" : "View details";

  return emailShell({
    payload,
    locale,
    title: primary.title,
    body: primary.body,
    secondaryTitle: secondary.title,
    secondaryBody: secondary.body,
    greeting: greeting(locale, name),
    ctaHref,
    ctaLabel,
  });
}

/**
 * Booking-confirmation email variant (used when ChannelPayload.booking is set):
 * the shared chrome plus a receipt-style details card — booking number, slot
 * date & time, quote, deposit, service — and a deep link to the admin dispute
 * view (/admin/bookings/{number}). The primary CTA keeps the recipient's own
 * deep link (customer /bookings, worker /dashboard) from the payload.
 */
export function renderBookingEmail(
  payload: ChannelPayload,
  locale: "en" | "ar"
): RenderedEmail {
  const { primary, secondary } = copy(payload, locale);
  const booking = payload.booking!;
  const name = payload.recipient?.name ? esc(payload.recipient.name) : "";
  const baseUrl = appBaseUrl();
  const ctaHref = `${baseUrl}${payload.href ?? "/bookings"}`;
  const ctaLabel = locale === "ar" ? "عرض حجزك" : "View your booking";
  const currency = (booking.currency as CurrencyCode) ?? "SAR";

  const l = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const price = (minor: number) => formatPrice(minor / 100, currency, locale);

  const rows: { label: string; value: string; ltr?: boolean }[] = [
    { label: l("Booking no.", "رقم الحجز"), value: booking.number, ltr: true },
    {
      label: l("Date & time", "التاريخ والوقت"),
      value: `${formatDate(booking.startAt, locale)} · ${formatSlotRange(booking, locale)}`,
    },
  ];
  if (booking.quote != null) rows.push({ label: l("Quote", "السعر"), value: price(booking.quote), ltr: true });
  // M5 take rate — the fee snapshot rides the payload (bookingEmailContext) so
  // the emailed receipt matches the customer booking row: the amount when
  // charged, or a "fee waived" line when the worker's plan is exempt (fee 0).
  if (booking.quote != null && booking.platformFee != null) {
    rows.push(
      booking.platformFee > 0
        ? { label: l("Platform fee", "رسوم المنصة"), value: price(booking.platformFee), ltr: true }
        : { label: l("Platform fee", "رسوم المنصة"), value: l("Waived by the worker's plan", "معفاة بموجب خطة العامل") }
    );
  }
  if (booking.deposit != null) rows.push({ label: l("Deposit", "الدفعة المقدمة"), value: price(booking.deposit), ltr: true });
  if (booking.refund) {
    rows.push({ label: l("Refunded", "المبلغ المسترد"), value: price(booking.refund.amount), ltr: true });
    if (booking.refund.reason) rows.push({ label: l("Reason", "السبب"), value: booking.refund.reason });
  }
  // The Service row renders the locale-appropriate catalog name when the
  // booking was created off the worker's service list (serviceItem.nameEn /
  // nameAr — same as the booking rows UI), falling back to the free-text
  // jobTitle (user-typed, single-locale — can't be translated; the campaign
  // campaignName/nameAr locale fix, mirrored for bookings).
  if (booking.jobTitle || booking.serviceItem) {
    const serviceName =
      booking.serviceItem && locale === "ar"
        ? booking.serviceItem.nameAr
        : booking.serviceItem?.nameEn ?? booking.jobTitle ?? "";
    rows.push({ label: l("Service", "الخدمة"), value: serviceName });
  }

  const card = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #eef0f3;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#fafbfc;border-bottom:1px solid #eef0f3;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;">${l("Booking details", "تفاصيل الحجز")}</td>
        </tr>
        ${rows
          .map(
            (r) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #eef0f3;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#6b7280;font-weight:600;">${esc(r.label)}</td>
                <td${r.ltr ? ' dir="ltr"' : ""} style="text-align:${locale === "ar" ? "left" : "right"};font-size:13px;font-weight:700;color:#111827;">${esc(r.value)}</td>
              </tr>
            </table>
          </td>
        </tr>`
          )
          .join("")}
      </table>`;

  // Admin dispute-view deep link — the same /admin/bookings/{number} route the
  // Recent-activity feed's booking entries link to.
  const adminHref = `${baseUrl}/admin/bookings/${booking.number}`;
  const adminLabel = l("Admin: booking details", "المشرف: تفاصيل الحجز");
  const adminLink = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
        <tr>
          <td style="font-size:12px;color:#9ca3af;">
            ${esc(adminLabel)}: <a href="${esc(adminHref)}" style="color:${ACCENT};text-decoration:underline;font-weight:600;">${esc(booking.number)}</a>
          </td>
        </tr>
      </table>`;

  const textExtra = [
    "",
    l("Booking details", "تفاصيل الحجز"),
    `${l("Booking", "الحجز")}: ${booking.number}`,
    `${l("When", "الموعد")}: ${formatDate(booking.startAt, locale)} · ${formatSlotRange(booking, locale)}`,
    ...(booking.quote != null ? [`${l("Quote", "السعر")}: ${price(booking.quote)}`] : []),
    ...(booking.quote != null && booking.platformFee != null
      ? [
          booking.platformFee > 0
            ? `${l("Platform fee", "رسوم المنصة")}: ${price(booking.platformFee)}`
            : `${l("Platform fee", "رسوم المنصة")}: ${l("Waived by the worker's plan", "معفاة بموجب خطة العامل")}`,
        ]
      : []),
    ...(booking.deposit != null ? [`${l("Deposit", "الدفعة المقدمة")}: ${price(booking.deposit)}`] : []),
    ...(booking.refund ? [`${l("Refunded", "المبلغ المسترد")}: ${price(booking.refund.amount)}`] : []),
    ...(booking.refund?.reason ? [`${l("Reason", "السبب")}: ${booking.refund.reason}`] : []),
    `${adminLabel}: ${adminHref}`,
  ];

  return emailShell({
    payload,
    locale,
    title: primary.title,
    body: primary.body,
    secondaryTitle: secondary.title,
    secondaryBody: secondary.body,
    greeting: greeting(locale, name),
    ctaHref,
    ctaLabel,
    extraHtml: card + adminLink,
    textExtra,
    subjectSuffix: booking.number,
  });
}

/**
 * Campaign-refund email variant (used when ChannelPayload.campaignRefund is
 * set): the shared chrome plus a refund card — campaign name, refunded amount,
 * reason — mirroring the bookingRefund details card so the email, the activity
 * feed and the /admin campaign-payments table tell one story. The CTA keeps
 * the company's deep link (/company) from the payload.
 */
export function renderCampaignRefundEmail(
  payload: ChannelPayload,
  locale: "en" | "ar"
): RenderedEmail {
  const { primary, secondary } = copy(payload, locale);
  const refund = payload.campaignRefund!;
  const name = payload.recipient?.name ? esc(payload.recipient.name) : "";
  const baseUrl = appBaseUrl();
  const ctaHref = `${baseUrl}${payload.href ?? "/company"}`;
  const ctaLabel = locale === "ar" ? "عرض حملاتك" : "View your campaigns";
  const currency = (refund.currency as CurrencyCode) ?? "USD";

  const l = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const price = (minor: number) => formatPrice(minor / 100, currency, locale);
  // The campaign name follows the EMAIL's locale (AR emails show the Arabic
  // name in the subject + card; the body headline already embeds it).
  const campaignName = locale === "ar" ? refund.campaignNameAr : refund.campaignName;

  const rows: { label: string; value: string; ltr?: boolean; auto?: boolean }[] = [
    { label: l("Campaign", "الحملة"), value: campaignName, ltr: false },
    { label: l("Refunded", "المبلغ المسترد"), value: price(refund.amount), ltr: true },
  ];
  // The reason is admin-typed free text that may be in either language —
  // dir="auto" renders it correctly in an RTL (Arabic) email.
  if (refund.reason) rows.push({ label: l("Reason", "السبب"), value: refund.reason, auto: true });

  const card = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #eef0f3;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#fafbfc;border-bottom:1px solid #eef0f3;font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;">${l("Refund details", "تفاصيل الاسترداد")}</td>
        </tr>
        ${rows
          .map(
            (r) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #eef0f3;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#6b7280;font-weight:600;">${esc(r.label)}</td>
                <td${r.ltr ? ' dir="ltr"' : r.auto ? ' dir="auto"' : ""} style="text-align:${locale === "ar" ? "left" : "right"};font-size:13px;font-weight:700;color:#111827;">${esc(r.value)}</td>
              </tr>
            </table>
          </td>
        </tr>`
          )
          .join("")}
      </table>`;

  const textExtra = [
    "",
    l("Refund details", "تفاصيل الاسترداد"),
    `${l("Campaign", "الحملة")}: ${campaignName}`,
    `${l("Refunded", "المبلغ المسترد")}: ${price(refund.amount)}`,
    ...(refund.reason ? [`${l("Reason", "السبب")}: ${refund.reason}`] : []),
  ];

  return emailShell({
    payload,
    locale,
    title: primary.title,
    body: primary.body,
    secondaryTitle: secondary.title,
    secondaryBody: secondary.body,
    greeting: greeting(locale, name),
    ctaHref,
    ctaLabel,
    extraHtml: card,
    textExtra,
    subjectSuffix: campaignName,
  });
}

/** Web Push payload (per the web-push spec) — compact JSON string. */
export function renderPushPayload(payload: ChannelPayload, locale: "en" | "ar"): string {
  const { primary } = copy(payload, locale);
  const baseUrl = appBaseUrl();
  const url = payload.href ? `${baseUrl}${payload.href}` : baseUrl;
  return JSON.stringify({
    title: primary.title,
    body: primary.body,
    url,
    icon: `${baseUrl}/icon.svg`,
    badge: `${baseUrl}/icon.svg`,
    tag: `workersarena:${payload.id}`,
    // RTL-aware notifications: the service worker (public/sw.js) reads these.
    dir: locale === "ar" ? "rtl" : "ltr",
    lang: locale,
    data: { type: payload.type, id: payload.id, time: payload.time, url },
  });
}

/**
 * Compact single-language SMS body (primary locale). Plain text, prefixed with
 * the app name and suffixed with a tap-to-open link when the payload has one.
 */
export function renderSmsText(payload: ChannelPayload, locale: "en" | "ar"): string {
  const { primary } = copy(payload, locale);
  const baseUrl = appBaseUrl();
  const href = payload.href ? `${baseUrl}${payload.href}` : "";
  const app = appName();
  return `[${app}] ${primary.title} — ${primary.body}${href ? ` ${href}` : ""}`;
}

/** WhatsApp message body (primary locale) with a labelled tap-to-open link. */
export function renderWhatsAppText(payload: ChannelPayload, locale: "en" | "ar"): string {
  const { primary } = copy(payload, locale);
  const baseUrl = appBaseUrl();
  const href = payload.href ? `${baseUrl}${payload.href}` : "";
  const viewLabel = locale === "ar" ? "عرض التفاصيل" : "View details";
  return `${primary.title}\n\n${primary.body}${href ? `\n${viewLabel}: ${href}` : ""}`;
}
