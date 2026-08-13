import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeDir, type Locale } from "./config";
import { dictionaries, translate, type Dictionary } from "./dictionaries";

export const LOCALE_COOKIE = "wa_locale";

/** Resolve the active locale from cookie or Accept-Language header. */
export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const cookieVal = store.get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieVal)) return cookieVal;
  } catch {
    // cookies() may throw during static generation — fall through.
  }

  try {
    const hdrs = await headers();
    const accept = hdrs.get("accept-language") ?? "";
    const prefs = accept
      .split(",")
      .map((s) => s.split(";")[0].trim().toLowerCase())
      .filter(Boolean);
    for (const pref of prefs) {
      if (pref.startsWith("ar")) return "ar";
      if (pref.startsWith("en")) return "en";
    }
  } catch {
    // ignore
  }
  return defaultLocale;
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
