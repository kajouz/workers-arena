"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useMemo } from "react";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { useOptionalLocale } from "@/components/providers/locale-provider";
import { isUnprefixedPath, localeFromPath, localePath } from "@/lib/i18n/routing";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LOCALE-AWARE <Link> — a drop-in for next/link
 * ────────────────────────────────────────────────────────────────────────────
 * Every route now lives under `/{locale}/…`, but call sites keep writing
 * plain app paths (`href="/search"`, `` href={`/workers/${slug}`} ``) and this
 * component adds the current locale. That is why the migration touched import
 * lines and almost no hrefs: one place knows the URL shape, and a link cannot
 * silently drop the reader into the other language.
 *
 * The locale comes from the PATHNAME rather than a context, so the component
 * works anywhere in the tree — including above the locale provider, and in
 * error boundaries that render outside it.
 *
 * External links (http…, mailto:, tel:), fragments and already-prefixed paths
 * pass through untouched.
 * ────────────────────────────────────────────────────────────────────────────
 */

type NextLinkProps = React.ComponentProps<typeof NextLink>;

/**
 * The locale currently rendering.
 *
 * Read from the locale context rather than from usePathname(): the context is
 * a plain value the server already resolved from the route segment, whereas
 * usePathname() requires an app-router context that component tests do not
 * mount ("invariant expected app router to be mounted") — and <Link> is in
 * almost every component, so that would have meant mocking the router in
 * ~60 test files. It also saves a hook call per link at runtime.
 *
 * Outside the provider — an error boundary, the skip link — it degrades to the
 * default locale rather than throwing.
 */
export function useCurrentLocale(): Locale {
  return useOptionalLocale()?.locale ?? defaultLocale;
}

/** True for anything that is not an in-app, locale-prefixable path. */
function isExternalHref(href: string): boolean {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#") ||
    href.startsWith("?")
  );
}

/** Add the locale prefix to an in-app path; leave everything else alone. */
export function withLocale(locale: Locale, href: string): string {
  if (isExternalHref(href) || isUnprefixedPath(href)) return href;
  if (!href.startsWith("/")) return href; // relative — resolved by the browser
  if (localeFromPath(href)) return href; // already prefixed
  // Preserve ?query and #hash while prefixing only the path.
  const match = /^([^?#]*)(.*)$/.exec(href);
  const [, path = href, suffix = ""] = match ?? [];
  return localePath(locale, path) + suffix;
}

export const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, ...props },
  ref
) {
  const locale = useCurrentLocale();
  const localized = typeof href === "string" ? withLocale(locale, href) : href;
  return <NextLink ref={ref} href={localized} {...props} />;
});

export default Link;

/**
 * `useRouter` with the same prefixing, for the handful of places that navigate
 * imperatively (search filters writing the canonical URL, dialogs that close
 * onto another route).
 */
export function useLocaleRouter() {
  const router = useRouter();
  const locale = useCurrentLocale();

  // One memo block rather than a useCallback per method: the React Compiler
  // could not preserve the split version ("Existing memoization could not be
  // preserved"), and the identity still has to be stable because call sites
  // put this router in effect dependency arrays.
  return useMemo(
    () => ({
      ...router,
      locale,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(withLocale(locale, href), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(withLocale(locale, href), options),
    }),
    [router, locale]
  );
}
