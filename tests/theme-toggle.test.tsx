// @vitest-environment jsdom
/**
 * ThemeToggle — cycle-position seeding.
 *
 * The toggle's cycle is light → dark → auto. Its position used to be seeded
 * from a hardcoded `initialTheme="light"` prop that no caller ever passed, so a
 * reader who was ALREADY on dark (cookie or OS preference) got a button that
 * said "Switch to dark mode" — a lie about the theme on screen — and whose
 * first click was a no-op (`light → dark` re-applied the dark they were already
 * looking at). These tests pin the seed to the theme actually applied, and to
 * the saved cycle preference when the user has expressed one.
 *
 * The server-render side can't be asserted here: there is no honest
 * server-rendered theme to render (see the component doc — the layout stopped
 * reading the cookie so pages stay prerendered), so the pre-hydration markup is
 * deliberately theme-agnostic and the E2E smoke covers the real first paint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useUiStore } from "@/lib/store";

function button(): HTMLButtonElement {
  return screen.getByRole("button");
}

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ theme: "light" });
  document.documentElement.className = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeToggle — cycle position", () => {
  it("seeds from the theme on screen: a dark reader's first click is not a no-op", () => {
    // The regression: seeded from "light", this click re-applied dark and the
    // label never moved.
    useUiStore.setState({ theme: "dark" });

    render(<ThemeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Switch to light mode");

    fireEvent.click(button());

    // dark → auto, which is the next state in the cycle — visible as the
    // explicit "System" title plus the mode dot, and reachable only if the
    // seed was "dark".
    expect(button().getAttribute("title")).toBe("System");
    expect(button().getAttribute("aria-label")).toContain("Theme: system");
  });

  it("advances light → dark on the first click (the E2E smoke's contract)", () => {
    render(<ThemeToggle />);
    expect(button().getAttribute("aria-label")).toBe("Switch to dark mode");

    fireEvent.click(button());

    expect(useUiStore.getState().theme).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to light mode");
  });

  it("prefers a saved cycle preference over the applied theme", () => {
    // "auto" is only expressible in the cycle preference, so it must win.
    localStorage.setItem("wa_theme_mode", "auto");
    useUiStore.setState({ theme: "dark" });

    render(<ThemeToggle />);

    expect(button().getAttribute("title")).toBe("System");
    expect(button().getAttribute("aria-label")).toContain("Theme: system");
  });

  it("persists the cycle preference so a reload keeps the position", () => {
    render(<ThemeToggle />);
    fireEvent.click(button()); // light → dark

    expect(localStorage.getItem("wa_theme_mode")).toBe("dark");
  });
});
