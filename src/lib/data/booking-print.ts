import { dictionaries, translate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { Booking, BookingStatus } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PRINTABLE BOOKING AUDIT TRAIL (docs/ENHANCEMENT-PLAN.md §2.4)
 * ────────────────────────────────────────────────────────────────────────────
 * The PDF/print view of a booking's event trail, shared by the customer
 * booking row, the worker dashboard row, and the admin dispute page
 * (/admin/bookings/[number]). A standalone HTML document (doctype + inline
 * print-friendly CSS — no app stylesheet dependency, so the print output is
 * deterministic), rendered in a sandboxed iframe by BookingPrintButton: the
 * browser's print dialog then saves exactly this document as PDF, and
 * renderAuditPdf (booking-pdf.ts) turns the SAME bytes into the attachment
 * for emailBookingAuditAction.
 *
 * Two builders share every label, formatter and the CSS:
 *   • renderBookingAuditPrint  — ONE booking (the per-booking view);
 *   • renderBookingTrailsPrint — ALL bookings (the admin export, one section
 *     per booking, byte-identical styling) — "mirroring the per-booking view".
 *
 * The documents tell the SAME story the on-screen timeline tells: the booking
 * facts + every BookingEvent (exact localized timestamp, status label,
 * acting party, reason), resolved through the shared i18n dictionaries so the
 * print output can never drift from the UI. All user-provided strings are
 * HTML-escaped.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Escape user-provided text before it lands in the HTML document. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** localStorage key remembering the last language chosen for the audit
 * document — shared by the print dialog (BookingPrintButton) and the email
 * dialog (BookingEmailButton), so one preference drives both surfaces. */
export const AUDIT_DOC_LOCALE_KEY = "wa_print_locale";

/** The remembered audit-document language, falling back to the page locale
 * when nothing is stored (or when there is no window, e.g. SSR). */
export function readAuditDocLocale(fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(AUDIT_DOC_LOCALE_KEY);
  return stored === "en" || stored === "ar" ? stored : fallback;
}

/** Persist the audit-document language choice. Never throws — if storage is
 * unavailable (private mode) the choice still applies for the session. */
export function writeAuditDocLocale(next: Locale): void {
  try {
    window.localStorage.setItem(AUDIT_DOC_LOCALE_KEY, next);
  } catch {
    // Storage unavailable — ignore.
  }
}

/** Forget the remembered audit-document language, so the next open falls
 * back to following the current page locale again. Never throws. */
export function clearAuditDocLocale(): void {
  try {
    window.localStorage.removeItem(AUDIT_DOC_LOCALE_KEY);
  } catch {
    // Storage unavailable — ignore.
  }
}

/** Localized status label (shared by the single + combined documents). */
export function auditStatusLabel(dict: Dictionary, status: BookingStatus): string {
  return translate(dict, `booking.status.${status}`);
}

/** Localized acting-party label (customer / worker / system / admin). */
export function auditActorLabel(dict: Dictionary, actor: string): string {
  return translate(
    dict,
    ({
      customer: "booking.disputeActorCustomer",
      worker: "booking.disputeActorWorker",
      system: "booking.disputeActorSystem",
      admin: "booking.disputeActorAdmin",
    })[actor] ?? "booking.disputeActorSystem"
  );
}

export function auditFmtDate(locale: Locale, iso: string): string {
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" });
}

export function auditFmtTime(locale: Locale, iso: string): string {
  return new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { timeStyle: "short" });
}

export function auditFmtDateTime(locale: Locale, iso: string): string {
  return `${auditFmtDate(locale, iso)}, ${auditFmtTime(locale, iso)}`;
}

/** Shared inline print CSS — one source for the single + combined documents. */
export const AUDIT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a202c; margin: 0; padding: 40px 48px; }
  .brand { margin: 0 0 2px; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #718096; }
  h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.3; }
  .number { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #4a5568; font-weight: 700; }
  .status { display: inline-block; margin-top: 6px; padding: 3px 10px; border: 1px solid #cbd5e0; border-radius: 999px; font-size: 12px; font-weight: 700; }
  h2 { margin: 28px 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 24px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; }
  .fact span { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #718096; }
  .fact strong { display: block; margin-top: 2px; font-size: 13px; font-weight: 600; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: start; padding: 7px 10px; border-bottom: 2px solid #cbd5e0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #718096; }
  td { padding: 8px 10px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
  td.num, th.num { text-align: center; width: 28px; }
  td.time { white-space: nowrap; }
  td.status { font-weight: 700; }
  td.actor { white-space: nowrap; }
  td.empty { text-align: center; color: #718096; padding: 18px 10px; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #718096; }
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid; }
    tr { break-inside: avoid; }
  }
`;

/** Booking facts (job / worker / customer / slot / quote / deposit / note /
 * invoice) — shared by the single + combined documents. */
function bookingFacts(
  booking: Booking,
  dict: Dictionary,
  locale: Locale,
  workerName?: string
): { label: string; value: string }[] {
  const t = (key: string) => translate(dict, key);
  const fmtMoney = (minor: number) => `${(minor / 100).toFixed(2)} ${booking.currency}`;
  const slot = booking.startAt
    ? booking.endAt
      ? `${auditFmtDate(locale, booking.startAt)}, ${auditFmtTime(locale, booking.startAt)} – ${auditFmtTime(locale, booking.endAt)}`
      : auditFmtDateTime(locale, booking.startAt)
    : "—";

  const facts: { label: string; value: string }[] = [
    { label: t("booking.disputeJob"), value: booking.jobTitle },
    { label: t("booking.disputeWorker"), value: workerName ?? booking.workerId },
    {
      label: t("booking.disputeCustomer"),
      value: [booking.customerName, booking.customerPhone, booking.customerEmail].filter(Boolean).join(" · "),
    },
    { label: t("booking.disputeSlot"), value: slot },
  ];
  if (booking.quote !== undefined) facts.push({ label: t("booking.quote"), value: fmtMoney(booking.quote) });
  if (booking.deposit !== undefined) facts.push({ label: t("booking.deposit"), value: fmtMoney(booking.deposit) });
  if (booking.note) facts.push({ label: t("booking.jobNote"), value: booking.note });
  if (booking.invoice) facts.push({ label: t("booking.invoice"), value: booking.invoice.number });
  return facts;
}

/** The events table body rows for one booking (shared by both documents). */
function eventRows(booking: Booking, dict: Dictionary, locale: Locale, num: Intl.NumberFormat): string {
  const rows = booking.events.map((e, i) => {
    const cols = [
      String(i + 1),
      auditFmtDateTime(locale, e.time),
      auditStatusLabel(dict, e.status),
      auditActorLabel(dict, e.actorType),
      e.reason ?? "—",
    ];
    return `<tr>${cols.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
  });
  return rows.length
    ? rows.join("\n      ")
    : `<tr><td colspan="5" class="empty">${escapeHtml(translate(dict, "booking.disputeNoEvents"))}</td></tr>`;
}

/** The facts grid HTML for one booking (shared by both documents). */
function factsHtml(
  booking: Booking,
  dict: Dictionary,
  locale: Locale,
  workerName?: string
): string {
  return `    <section class="facts">
      ${bookingFacts(booking, dict, locale, workerName)
        .map((f) => `<div class="fact"><span>${escapeHtml(f.label)}</span><strong>${escapeHtml(f.value)}</strong></div>`)
        .join("")}
    </section>`;
}

/** The events table HTML for one booking (shared by both documents). */
function eventsHtml(
  booking: Booking,
  dict: Dictionary,
  locale: Locale,
  num: Intl.NumberFormat
): string {
  const t = (key: string) => translate(dict, key);
  return `    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>${escapeHtml(t("booking.printTime"))}</th>
          <th>${escapeHtml(t("booking.printStatus"))}</th>
          <th>${escapeHtml(t("booking.printActor"))}</th>
          <th>${escapeHtml(t("booking.printReason"))}</th>
        </tr>
      </thead>
      <tbody>
        ${eventRows(booking, dict, locale, num)}
      </tbody>
    </table>`;
}

/** Document shell shared by the single + combined builders. */
function documentShell(opts: {
  locale: Locale;
  title: string;
  headerHtml: string;
  bodyHtml: string;
}): string {
  const { locale, title, headerHtml, bodyHtml } = opts;
  return `<!doctype html>
<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${AUDIT_PRINT_CSS}</style>
</head>
<body>
${headerHtml}
${bodyHtml}
<footer>${escapeHtml(translate(dictionaries[locale], "booking.printGenerated"))} ${escapeHtml(auditFmtDateTime(locale, new Date().toISOString()))} · WorkersArena</footer>
</body>
</html>`;
}

/** ONE booking's printable audit trail — the per-booking view (customer row,
 * worker row, admin dispute page). */
export function renderBookingAuditPrint(
  booking: Booking,
  opts: { locale: Locale; workerName?: string }
): string {
  const { locale, workerName } = opts;
  const dict = dictionaries[locale];
  const t = (key: string) => translate(dict, key);
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");

  return documentShell({
    locale,
    title: `${booking.number} — ${t("booking.printTitle")}`,
    headerHtml: `  <header>
    <p class="brand">WorkersArena</p>
    <h1>${escapeHtml(t("booking.printTitle"))} <span class="number" dir="ltr">${escapeHtml(booking.number)}</span></h1>
    <span class="status">${escapeHtml(auditStatusLabel(dict, booking.status))}</span>
  </header>

  <h2>${escapeHtml(t("booking.disputeDetails"))}</h2>
  ${factsHtml(booking, dict, locale, workerName)}
  ${eventsHtml(booking, dict, locale, num)}`,
    bodyHtml: "",
  });
}

/**
 * ALL bookings' event trails in ONE document — the admin export that mirrors
 * the per-booking print view: a header (title + generated-at + booking
 * count), then one section per booking with the exact same facts grid and
 * events table the single document renders. `workerNames` maps workerId →
 * localized display name (resolved by the caller), so the worker fact reads
 * like the per-booking view.
 */
export function renderBookingTrailsPrint(
  bookings: Booking[],
  opts: { locale: Locale; workerNames?: Record<string, string> }
): string {
  const { locale, workerNames = {} } = opts;
  const dict = dictionaries[locale];
  const t = (key: string) => translate(dict, key);
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");

  const sections = bookings
    .map(
      (b) => `  <section class="booking">
    <h2>${escapeHtml(t("booking.printTitle"))} <span class="number" dir="ltr">${escapeHtml(b.number)}</span> <span class="status">${escapeHtml(
        auditStatusLabel(dict, b.status)
      )}</span></h2>
    ${factsHtml(b, dict, locale, workerNames[b.workerId])}
    ${eventsHtml(b, dict, locale, num)}
  </section>`
    )
    .join("\n");

  return documentShell({
    locale,
    title: t("admin.exportTrailsDocTitle"),
    headerHtml: `  <header>
    <p class="brand">WorkersArena</p>
    <h1>${escapeHtml(t("admin.exportTrailsDocTitle"))}</h1>
    <p class="meta">${escapeHtml(t("booking.printGenerated"))} ${escapeHtml(auditFmtDateTime(locale, new Date().toISOString()))} · ${escapeHtml(
      t("admin.exportTrailsBookingsCount").replace("{count}", num.format(bookings.length))
    )}</p>
  </header>`,
    bodyHtml: sections,
  });
}
