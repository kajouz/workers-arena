// @vitest-environment jsdom
/**
 * Bottom tab bar visibility.
 *
 * The bar is `fixed inset-x-0 bottom-0` and is only compensated for by the
 * root layout's `pb-20` on <main> — which clears the bar at the END of that
 * element, not for content sitting at the viewport bottom at first paint. The
 * auth screens are taller than a phone viewport, so the bar's overlay landed
 * on the login card's tail: the one-click demo sign-in row (measured at
 * 416×748 — button row y 711–755, bar y 683–748, so elementFromPoint at the
 * button's centre returned the bar). Tapping there navigated to /search
 * instead of signing in.
 *
 * The bar therefore does not render on the auth routes. This pins that
 * decision in BOTH directions, so neither "hide it everywhere" nor "show it
 * again on login" can slip through as an unremarked change.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LocaleProvider } from "@/components/providers/locale-provider";

const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

// The bar animates the active indicator with framer-motion's `layoutId`, which
// needs a real layout pass; the visibility contract under test does not.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      layoutId: _layoutId,
      ...rest
    }: { children?: React.ReactNode; layoutId?: string }) => <div {...rest}>{children}</div>,
  },
}));

import { BottomTabs } from "@/components/layout/bottom-tabs";

afterEach(cleanup);
beforeEach(() => {
  pathnameRef.current = "/";
});

function renderAt(pathname: string) {
  pathnameRef.current = pathname;
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <BottomTabs />
    </LocaleProvider>
  );
}

const nav = () => screen.queryByRole("navigation", { name: "Main navigation" });

describe("BottomTabs — auth screens yield the viewport", () => {
  it("hides the bar on the login page, where it covered the demo sign-in row", () => {
    renderAt("/auth/login");
    expect(nav()).toBeNull();
  });

  it("hides the bar on the register page (the taller card)", () => {
    renderAt("/auth/register");
    expect(nav()).toBeNull();
  });

  it("hides it on nested auth routes too, so a sub-step keeps the card clear", () => {
    renderAt("/auth/login/reset");
    expect(nav()).toBeNull();
  });

  it("still renders the bar on the app routes it exists for", () => {
    for (const path of ["/", "/search", "/bookings", "/favorites", "/dashboard"]) {
      cleanup();
      renderAt(path);
      expect(nav(), `the bar must render on ${path}`).not.toBeNull();
    }
  });

  it("does not treat a lookalike prefix as an auth route", () => {
    // "/auth/loginX" is not under "/auth/login/" — a substring test would hide
    // the bar on a future route that merely starts with the same characters.
    cleanup();
    renderAt("/auth/loginfo");
    expect(nav()).not.toBeNull();
  });

  it("keeps the five app destinations when it does render", () => {
    renderAt("/");
    for (const label of ["Home", "Find workers", "My bookings", "Favorites", "Dashboard"]) {
      expect(screen.getByRole("link", { name: label }), `${label} tab missing`).toBeInTheDocument();
    }
  });
});
