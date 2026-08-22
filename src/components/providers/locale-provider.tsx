"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { Locale } from "@/lib/i18n/config";
import { dictionaries, translate, type Dictionary } from "@/lib/i18n/dictionaries";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const LOCALE_LS_KEY = "wa_locale";

function readLocaleFromLS(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_LS_KEY);
    return v === "en" || v === "ar" ? v : null;
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

  // On first client render, if localStorage has a saved locale that differs
  // from the server-rendered one (cookie was lost / cleared), sync the cookie
  // and reload so the page renders with the correct locale.
  useEffect(() => {
    try {
      const saved = readLocaleFromLS();
      if (saved && saved !== locale) {
        document.cookie = `wa_locale=${saved};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
        window.location.reload();
      }
    } catch { /* ignore */ }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    // Persist to both cookie (SSR source of truth) and localStorage (client fallback)
    document.cookie = `wa_locale=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
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
