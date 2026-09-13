"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { Locale } from "@/lib/i18n/config";
import { dictionaries, translate, type Dictionary } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE_NAME } from "@/lib/personalization-cookie";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** localStorage key — deliberately the SAME name as the cookie, so the two
 * stores can never drift into holding different locales. */
const LOCALE_LS_KEY = LOCALE_COOKIE_NAME;

function readLocaleFromLS(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_LS_KEY);
    return v === "en" || v === "ar" ? v : null;
  } catch {
    return null;
  }
}

/** The `wa_locale` cookie as the CLIENT sees it (it is not httpOnly) — the same
 * value the server read to render `<html lang dir>`. Null when it is absent,
 * which is the only case the localStorage fallback is for. */
function readLocaleCookie(): Locale | null {
  try {
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(`${LOCALE_COOKIE_NAME}=`)) continue;
      const value = decodeURIComponent(trimmed.slice(LOCALE_COOKIE_NAME.length + 1));
      return value === "en" || value === "ar" ? value : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function LocaleProvider({
  locale,
  dir,
  children,
}: {
  locale: Locale;
  dir: "ltr" | "rtl";
  children: React.ReactNode;
}) {
  const dict = dictionaries[locale];

  /**
   * localStorage is a FALLBACK for a missing cookie, never an override of a
   * present one.
   *
   * The first version of this effect reloaded the page whenever localStorage
   * disagreed with the server-rendered locale. That made a stale saved value
   * able to undo an explicit cookie change — e.g. a session set by the e2e
   * harness or a link — and bounce the document back to the old language: the
   * server renders EN from the cookie, hydration then rewrites the cookie to
   * the stale AR value and reloads, so the page ends up in the language nobody
   * asked for (and anything waiting on the just-rendered EN copy never sees
   * it). The cookie is the SSR source of truth, so when it is present its value
   * wins and only the client-side fallback is re-synced.
   */
  useEffect(() => {
    try {
      const saved = readLocaleFromLS();
      const cookieLocale = readLocaleCookie();
      if (cookieLocale) {
        if (saved !== cookieLocale) localStorage.setItem(LOCALE_LS_KEY, cookieLocale);
        return;
      }
      // No cookie (cleared, expired, or a fresh browser): restore the saved
      // choice once, so the preference survives a lost cookie.
      if (saved && saved !== locale) {
        document.cookie = `${LOCALE_COOKIE_NAME}=${saved};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
        window.location.reload();
      }
    } catch { /* ignore */ }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    // Persist to both cookie (SSR source of truth) and localStorage (client fallback)
    document.cookie = `${LOCALE_COOKIE_NAME}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    try { localStorage.setItem(LOCALE_LS_KEY, next); } catch { /* ignore */ }
    window.location.reload();
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
    [dict]
  );

  const value = useMemo(
    () => ({ locale, dir, dict, t, setLocale }),
    [locale, dir, dict, t, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
