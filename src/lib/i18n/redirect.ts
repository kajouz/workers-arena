import { redirect } from "next/navigation";
import { getLocale } from "./server";
import { localePath } from "./routing";

/**
 * `redirect()` that lands in the caller's language.
 *
 * A bare `redirect("/auth/login")` would now 404 — there is no unprefixed
 * route — and even once the proxy caught it, the visitor would take an extra
 * hop and could surface in the wrong language. This resolves the locale the
 * same way pages do (the `[locale]` segment when the caller is inside one, the
 * saved preference otherwise) and redirects straight to the localized path.
 *
 * Like `redirect()`, this never returns.
 */
/** next/navigation exports RedirectType as a const object, not a type. */
type RedirectKind = "push" | "replace";

export async function localeRedirect(pathname: string, type?: RedirectKind): Promise<never> {
  const locale = await getLocale();
  redirect(localePath(locale, pathname), type);
}
