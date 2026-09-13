// @vitest-environment jsdom
/**
 * LocaleProvider's cookie ↔ localStorage precedence.
 *
 * The provider keeps the locale in BOTH stores: the `wa_locale` cookie (what
 * the root layout reads to render `<html lang dir>`, so it is the SSR source of
 * truth) and localStorage (a client-side fallback for when the cookie is gone).
 *
 * Its first version reloaded the page whenever localStorage disagreed with the
 * server-rendered locale, which let a STALE saved value override an explicit
 * cookie: the server renders EN from the cookie, hydration rewrites the cookie
 * to the old saved AR value and reloads, so the document lands in the language
 * nobody asked for. The e2e smoke hit exactly this — the booking flow sets
 * `wa_locale=en` after an earlier UI switch had saved `ar`, and 20 s later the
 * page was still an Arabic `/dashboard`, so the English control it waited for
 * never appeared.
 *
 * The rule these tests pin: a PRESENT cookie always wins (localStorage is only
 * re-synced); a MISSING cookie is the one case where the saved value is
 * restored, and that path reloads once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/components/providers/locale-provider";

const LOCALE_COOKIE = "wa_locale";
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every Set-Cookie the provider wrote, in order (jsdom keeps one per name). */
function cookieValue(): string | null {
  const hit = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LOCALE_COOKIE}=`));
  return hit ? hit.slice(LOCALE_COOKIE.length + 1) : null;
}

function setCookie(value: string): void {
  document.cookie = `${LOCALE_COOKIE}=${value};path=/`;
}

function clearCookie(): void {
  document.cookie = `${LOCALE_COOKIE}=;path=/;max-age=0`;
}

/** Renders the provider and reports the locale it handed to children. */
function renderProvider(locale: "en" | "ar") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <span data-testid="child">child</span>
    </LocaleProvider>
  );
}

describe("LocaleProvider — the cookie is the source of truth", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    // jsdom's location.reload is not implemented (it warns and does nothing),
    // so replace the object to observe the call instead.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { reload },
    });
    localStorage.clear();
    clearCookie();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    clearCookie();
  });

  it("keeps a present cookie and re-syncs a stale localStorage instead of reloading", async () => {
    setCookie("en");
    localStorage.setItem(LOCALE_COOKIE, "ar"); // stale saved value
    renderProvider("en");
    await tick();

    expect(reload, "a stale saved locale must not reload the page").not.toHaveBeenCalled();
    expect(cookieValue(), "the cookie keeps its explicit value").toBe("en");
    expect(localStorage.getItem(LOCALE_COOKIE), "the fallback is re-synced to the cookie").toBe("en");
  });

  it("restores the saved locale once when the cookie is absent", async () => {
    localStorage.setItem(LOCALE_COOKIE, "ar");
    renderProvider("en");
    await tick();

    expect(cookieValue(), "the saved choice is written back to the cookie").toBe("ar");
    expect(reload, "restoring the cookie needs the reload").toHaveBeenCalledTimes(1);
  });

  it("is a no-op when both stores already agree", async () => {
    setCookie("en");
    localStorage.setItem(LOCALE_COOKIE, "en");
    renderProvider("en");
    await tick();

    expect(reload).not.toHaveBeenCalled();
    expect(cookieValue()).toBe("en");
    expect(localStorage.getItem(LOCALE_COOKIE)).toBe("en");
  });

  it("writes the cookie name the server reads when the user switches language", async () => {
    // The provider and the server must agree on the NAME (a rename on one side
    // would silently stop the switch from sticking). `setLocale` writes both
    // stores; the cookie is asserted through the literal the SSR reader uses.
    localStorage.setItem(LOCALE_COOKIE, "en");
    let api: ReturnType<typeof useLocale> | null = null;
    function Probe() {
      api = useLocale();
      return null;
    }
    render(
      <LocaleProvider locale="en" dir="ltr">
        <Probe />
      </LocaleProvider>
    );
    await tick();

    api!.setLocale("ar");
    expect(cookieValue()).toBe("ar");
    expect(localStorage.getItem(LOCALE_COOKIE)).toBe("ar");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
