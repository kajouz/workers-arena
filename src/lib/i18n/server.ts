import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeDir, type Locale } from "./config";
import { dictionaries, translate, type Dictionary } from "./dictionaries";

export const LOCALE_COOKIE = "wa_locale";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHERE THE LOCALE COMES FROM
 * ────────────────────────────────────────────────────────────────────────────
 * The URL — `/en/search`, `/ar/workers/[slug]` — via the `[locale]` root
 * segment, read through `next/root-params`.
 *
 * It used to come from the `wa_locale` cookie. That one choice cost the whole
 * site its cacheability and its Arabic SEO: reading a cookie makes a route
 * dynamic, so all ~40 public pages server-rendered on every request (the
 * build prerendered exactly three), and because the document was stamped with
 * the cookie's language, src/proxy.ts had to mark every personalized request
 * `private, no-store`. Arabic also had no URL of its own, so it could not be
 * linked, shared or indexed.
 *
 * `next/root-params` is the Next 16 way to read a root segment from any Server
 * Component without threading it through every page's props. It is NOT
 * available in Server Actions, Route Handlers, or `app/global-error.tsx`
 * (which sits outside the `[locale]` segment), so those fall back to the
 * cookie — they are dynamic by nature and nothing is lost there.
 *
 * The cookie still exists, but only as a PREFERENCE: src/proxy.ts reads it to
 * decide which locale to send a visitor to when they arrive without one in the
 * path. It no longer decides what any page renders.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * The locale of the `[locale]` segment currently rendering, or null when the
 * caller is outside the segment (an action, a route handler, global-error).
 */
async function localeFromRouteSegment(): Promise<Locale | null> {
  try {
    const rootParams = await import("next/root-params");
    const value = await rootParams.locale();
    return isLocale(value) ? value : null;
  } catch {
    // Outside a [locale] route, or the module is unavailable.
    return null;
  }
}

/** The saved preference — set when a visitor picks a language. */
async function localeFromCookie(): Promise<Locale | null> {
  try {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : null;
  } catch {
    // cookies() throws during static generation — expected, fall through.
    return null;
  }
}

/**
 * Negotiate from `Accept-Language`. Only reached outside the `[locale]`
 * segment; inside it the URL has already decided.
 */
async function localeFromAcceptLanguage(): Promise<Locale | null> {
  try {
    const hdrs = await headers();
    const accept = hdrs.get("accept-language") ?? "";
    for (const pref of accept.split(",").map((s) => s.split(";")[0].trim().toLowerCase())) {
      if (pref.startsWith("ar")) return "ar";
      if (pref.startsWith("en")) return "en";
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Resolve the active locale. Inside a `[locale]` route this reads the URL and
 * nothing else — which is what keeps those routes statically renderable.
 */
export async function getLocale(): Promise<Locale> {
  return (
    (await localeFromRouteSegment()) ??
    (await localeFromCookie()) ??
    (await localeFromAcceptLanguage()) ??
    defaultLocale
  );
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

export async function getDir(): Promise<"ltr" | "rtl"> {
  return localeDir[await getLocale()];
}

/** Small SSR helper bundling locale + dictionary + dir for page props. */
export async function getI18n() {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return {
    locale,
    dir: localeDir[locale],
    t: (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
  };
}
