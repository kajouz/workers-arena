// ─────────────────────────────────────────────────────────────────────────────
// Personalization-cookie names — dependency-free on purpose.
//
// The root layout renders <html lang dir class> from the wa_locale and
// wa_theme cookies, so EVERY document response is personalized per browser.
// src/proxy.ts uses these names to decide the Cache-Control policy: a request
// carrying any of them must never be publicly cached (a shared cache or the
// browser's stale-while-revalidate would serve the previous locale/theme's
// document after the user flips the toggle). Edge-safe: cookie NAME knowledge
// only — the values are read server-side via next/headers.
// ─────────────────────────────────────────────────────────────────────────────

/** Locale cookie (src/lib/i18n/server.ts) — the SSR lang/dir source. */
export const LOCALE_COOKIE_NAME = "wa_locale";

/** Theme cookie (src/app/layout.tsx) — the SSR dark-class source. */
export const THEME_COOKIE_NAME = "wa_theme";

/**
 * Cookie names whose presence marks an anonymous request's document as
 * personalized. Deliberately narrow: only the two SSR-personalizing cookies —
 * consent or analytics cookies don't change the rendered markup, so keying on
 * them would needlessly disable public caching for the whole site.
 */
export const PERSONALIZATION_COOKIE_NAMES: readonly string[] = [
  LOCALE_COOKIE_NAME,
  THEME_COOKIE_NAME,
];

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
