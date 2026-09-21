"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { dictionaries, translate, type Dictionary } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE_NAME } from "@/lib/personalization-cookie";
import { localePath } from "@/lib/i18n/routing";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  dict: Dictionary;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

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

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
    [dict]
  );

  const value = useMemo(() => ({ locale, dir, dict, t }), [locale, dir, dict, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Switch language: a NAVIGATION to the same page in the other language
 * (/ar/search?q=… → /en/search?q=…).
 *
 * It used to be `setLocale` on the context, writing a cookie and calling
 * window.location.reload() — which threw away scroll position, form state and
 * in-flight search results, and left the URL unchanged so the reader could not
 * link anyone to what they were looking at.
 *
 * It lives in a hook rather than on the provider so the provider stays free of
 * router hooks. The provider wraps the whole app, including component tests
 * that mount without an app-router context, and useRouter() there throws
 * "invariant expected app router to be mounted". Only the two components that
 * actually switch language pay for the router.
 *
 * The cookie is still written, as a preference only: it decides where a later
 * prefix-less visit (a bare bookmark, a shared "/" link) lands. localStorage is
 * gone — it existed to survive a lost cookie, and its reconciliation effect
 * could bounce a reader into a language they had not chosen. The URL is the
 * source of truth now and nothing overrides it.
 */
export function useSetLocale(): (locale: Locale) => void {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (next: Locale) => {
      try {
        document.cookie = `${LOCALE_COOKIE_NAME}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      } catch {
        /* a blocked cookie only costs the remembered preference */
      }
      // Query read from the live URL at click time, not via useSearchParams():
      // that hook opts its whole subtree out of static rendering, and this
      // module is imported by every page in the app.
      const query = typeof window === "undefined" ? "" : window.location.search;
      router.push(localePath(next, pathname ?? "/") + query);
      router.refresh();
    },
    [router, pathname]
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

/**
 * The locale context if there is one, else null — for components that legally
 * render outside the provider (error boundaries, the skip link) and must not
 * throw there.
 */
export function useOptionalLocale(): LocaleContextValue | null {
  return useContext(LocaleContext);
}
