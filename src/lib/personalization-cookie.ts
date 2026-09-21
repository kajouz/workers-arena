// ─────────────────────────────────────────────────────────────────────────────
// Personalization-cookie names — dependency-free on purpose.
//
// NEITHER of these cookies personalizes a document any more, and the list is
// deliberately empty. It is kept because the reasoning is worth not losing:
//
//   • wa_locale used to decide the language of every rendered page. Language
//     now comes from the URL (/en/…, /ar/…), so the cookie only picks where to
//     send a visitor who arrives without a prefix — a redirect decision, not a
//     rendering one. See preferredLocale() in src/proxy.ts.
//   • wa_theme used to stamp <html class="dark"> server-side. The layout no
//     longer reads it; the blocking bootstrap script applies the theme before
//     first paint instead.
//
// Together those two made EVERY returning visitor's document uncacheable: the
// theme script writes wa_theme on the first page view, so from the second view
// on, every request carried a personalization cookie and src/proxy.ts answered
// `private, no-store`. Anonymous traffic — which is all crawler and
// first-visit traffic — now gets a shared-cacheable response.
//
// Edge-safe: cookie NAME knowledge only.
// ─────────────────────────────────────────────────────────────────────────────

/** Locale cookie — the saved language preference; picks a redirect target only. */
export const LOCALE_COOKIE_NAME = "wa_locale";

/** Theme cookie — read only by the pre-hydration bootstrap script, never by SSR. */
export const THEME_COOKIE_NAME = "wa_theme";

/**
 * Cookie names whose presence marks an anonymous request's document as
 * personalized — i.e. names that must defeat shared caching.
 *
 * Empty today, and that is the point: nothing an anonymous visitor carries
 * changes their markup any more. Add a name here the moment some cookie starts
 * influencing SSR output again, and the cache policy follows automatically.
 */
export const PERSONALIZATION_COOKIE_NAMES: readonly string[] = [];

/**
 * True when the raw `Cookie` header carries a personalization cookie — the
 * response document is stamped with that locale/theme and must never be
 * publicly cached.
 *
 * Exact name matching on the `;`-split pairs (NOT a substring test) so a
 * lookalike cookie like `wa_locale_backup` can't flip the cache policy.
 */
export function hasPersonalizationCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const name = part.trim().split("=", 1)[0];
    if (name && PERSONALIZATION_COOKIE_NAMES.includes(name)) return true;
  }
  return false;
}
