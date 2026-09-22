"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useUiStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "auto";

/**
 * Theme toggle with system preference support.
 * Cycles through: light → dark → auto (system)
 *
 * There is deliberately NO `initialTheme` prop. The server cannot know the
 * reader's theme: `[locale]/layout.tsx` no longer reads the `wa_theme` cookie
 * (that read made every page dynamic) and restores the scheme with a
 * pre-hydration inline script against the prerendered HTML instead. A prop
 * defaulting to "light" therefore wasn't a server answer — it was a guess that
 * happened to be wrong for every dark-mode reader, who saw a "Switch to dark
 * mode" button while already on dark until hydration landed.
 *
 * So the button renders theme-AGNOSTICALLY until hydration (a neutral label and
 * icon, the same "neutral placeholder, never a claim" convention the header
 * uses for the account area), and after hydration reports the real theme.
 */
export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [hydrated, setHydrated] = useState(false);
  // Cycle position, refined on mount. The initial value is never rendered (see
  // `hydrated` below); the seed that matters reads the theme actually on screen.
  const [mode, setMode] = useState<ThemeMode>("light");
  const seeded = useRef(false);

  useEffect(() => {
    setHydrated(true);
    if (seeded.current) return;
    seeded.current = true;
    // The saved CYCLE preference first (auto is only expressible here).
    const saved = localStorage.getItem("wa_theme_mode") as ThemeMode | null;
    if (saved === "light" || saved === "dark" || saved === "auto") {
      setMode(saved);
      return;
    }
    // No saved cycle preference: seed from the scheme the layout's inline
    // script already resolved (localStorage `wa_theme` → OS preference).
    // Seeding from a hardcoded "light" made the first click a no-op for a
    // reader already on dark — light→dark re-applied dark — so the button
    // claimed a direction it wouldn't take. Read via getState() rather than the
    // hook so this stays a mount-only effect.
    setMode(useUiStore.getState().theme);
  }, []);

  // Apply system preference when in auto mode
  useEffect(() => {
    if (mode === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        setTheme(e.matches ? "dark" : "light");
      };
      handleChange(mediaQuery);
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [mode, setTheme]);

  const cycleTheme = () => {
    const nextMode: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
    setMode(nextMode);
    try {
      localStorage.setItem("wa_theme_mode", nextMode);
    } catch {
      /* ignore */
    }
    if (nextMode !== "auto") {
      setTheme(nextMode);
    }
  };

  // Accessible, mode-aware label. The dark/light states keep the exact
  // "Switch to X mode" wording the E2E smoke (tests/e2e-smoke.test.ts) and
  // keyboard/voice commands key on; auto carries the explicit cycle hint.
  // Pre-hydration the label must not promise a direction, so it describes the
  // control instead of a state.
  const ariaLabel = !hydrated
    ? "Theme: click to cycle through light, dark, and system preference"
    : mode === "auto"
      ? "Theme: system. Click to cycle through light, dark, and system preference"
      : theme === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      onClick={cycleTheme}
      aria-label={ariaLabel}
      title={!hydrated ? "Theme" : mode === "auto" ? "System" : ariaLabel}
      className={cn("relative h-11 w-11 sm:h-10 sm:w-10", hydrated && mode === "auto" && "text-brand-500")}
    >
      {!hydrated ? (
        <Monitor className="size-5" />
      ) : theme === "dark" ? (
        <Sun className="size-5" />
      ) : mode === "auto" ? (
        <Monitor className="size-5" />
      ) : (
        <Moon className="size-5" />
      )}
      {hydrated && mode === "auto" && (
        <span className="absolute -bottom-0.5 -end-0.5 size-2 rounded-full bg-brand-500" />
      )}
    </Button>
  );
}
