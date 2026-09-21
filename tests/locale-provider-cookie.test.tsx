// @vitest-environment jsdom
/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE URL IS THE SOURCE OF TRUTH FOR LANGUAGE
 * ────────────────────────────────────────────────────────────────────────────
 * The locale comes from the path — `/en/search`, `/ar/search` — and the
 * provider simply renders whatever the route segment resolved to.
 *
 * It used to come from the `wa_locale` cookie, with localStorage as a fallback
 * and an effect reconciling the two. That reconciliation was a real source of
 * bugs: a STALE saved value could override an explicit cookie, so the server
 * would render EN, hydration would rewrite the cookie to an older AR choice
 * and reload, and the reader landed in a language nobody asked for. The e2e
 * smoke hit exactly that — a booking flow set `wa_locale=en` after an earlier
 * UI switch had saved `ar`, and the page stayed Arabic, so the English control
 * the test waited for never appeared.
 *
 * None of that machinery exists now. There is nothing to reconcile: the path
 * decides, and the tests below pin the three properties that replaced it.
 *
 * The cookie survives as a PREFERENCE only — it picks where a prefix-less
 * visit lands (see preferredLocale() in src/proxy.ts) and never overrides a
 * URL. localStorage is gone entirely.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LocaleProvider, useLocale, useSetLocale } from "@/components/providers/locale-provider";

const LOCALE_COOKIE = "wa_locale";
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

const { pushMock, refreshMock, pathnameMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  pathnameMock: vi.fn<() => string>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => pathnameMock(),
}));

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

/** Mounts the provider and exposes both hooks to the test. */
function renderProbe(locale: "en" | "ar") {
  const api: { locale?: ReturnType<typeof useLocale>; setLocale?: (l: "en" | "ar") => void } = {};
  function Probe() {
    api.locale = useLocale();
    api.setLocale = useSetLocale();
    return null;
  }
  render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <Probe />
    </LocaleProvider>
  );
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  pathnameMock.mockReturnValue("/en/search");
  localStorage.clear();
  clearCookie();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  clearCookie();
});

describe("LocaleProvider — the route segment decides", () => {
  it("renders the locale it was given, even when a stale cookie disagrees", async () => {
    setCookie("ar"); // an older preference
    const api = renderProbe("en"); // …but /en/… is what is being rendered
    await tick();

    expect(api.locale!.locale, "the URL's locale wins over the cookie").toBe("en");
    expect(api.locale!.dir).toBe("ltr");
    expect(cookieValue(), "and the provider does not rewrite the cookie behind the reader").toBe("ar");
  });

  it("never reloads or navigates on mount", async () => {
    setCookie("ar");
    localStorage.setItem(LOCALE_COOKIE, "ar");
    renderProbe("en");
    await tick();

    // The old reconciliation effect called window.location.reload() here.
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("writes no localStorage at all", async () => {
    renderProbe("en");
    await tick();
    expect(localStorage.getItem(LOCALE_COOKIE)).toBeNull();
  });
});

describe("useSetLocale — switching language is a navigation", () => {
  it("navigates to the same page in the other language and keeps the query", async () => {
    pathnameMock.mockReturnValue("/en/search");
    window.history.replaceState({}, "", "/en/search?q=plumber&city=beirut");

    const api = renderProbe("en");
    await tick();
    api.setLocale!("ar");

    expect(pushMock).toHaveBeenCalledWith("/ar/search?q=plumber&city=beirut");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("maps the site root onto the other language's root", async () => {
    pathnameMock.mockReturnValue("/en");
    window.history.replaceState({}, "", "/en");

    const api = renderProbe("en");
    await tick();
    api.setLocale!("ar");

    expect(pushMock).toHaveBeenCalledWith("/ar");
  });

  it("records the choice under the cookie name the proxy reads", async () => {
    // The client and the proxy must agree on the NAME — a rename on one side
    // would silently stop the preference from sticking, and a prefix-less
    // visit would keep landing in the old language.
    const api = renderProbe("en");
    await tick();
    api.setLocale!("ar");

    expect(cookieValue()).toBe("ar");
  });
});
