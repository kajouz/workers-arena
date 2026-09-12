"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useUiStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Theme toggle with system preference support.
 * Cycles through: light → dark → auto (system)
 *
 * `initialTheme` is the server-rendered theme (from the layout's
 * cookie check) so the first paint matches SSR exactly — no hydration flash.
 */
export function ThemeToggle({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [hydrated, setHydrated] = useState(false);
  // Seed the mode from the SSR theme (not "auto"): auto would immediately
  // overwrite the cookie-restored theme with the OS preference on mount —
  // the flash/hydration-mismatch class of bug the layout's inline script and
  // the E2E dark-reload contract exist to prevent. It also made the first
  // click cycle auto→light instead of light→dark.
  const [mode, setMode] = useState<"light" | "dark" | "auto">(initialTheme);

  useEffect(() => {
    setHydrated(true);
    // Check if user has a saved preference
    const saved = localStorage.getItem("wa_theme_mode") as "light" | "dark" | "auto" | null;
    if (saved === "light" || saved === "dark" || saved === "auto") {
      setMode(saved);
    }
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
    const nextMode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
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

  const current = hydrated ? theme : initialTheme;

  // Accessible, mode-aware label. The dark/light states keep the exact
  // "Switch to X mode" wording the E2E smoke (tests/e2e-smoke.test.ts) and
  // keyboard/voice commands key on; auto carries the explicit cycle hint.
  const ariaLabel =
    mode === "auto"
      ? `Theme: system. Click to cycle through light, dark, and system preference`
      : current === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={ariaLabel}
      title={mode === "auto" ? "System" : ariaLabel}
      className={cn(
        "relative",
        mode === "auto" && "text-brand-500"
      )}
    >
      {current === "dark" ? (
        <Sun className="size-5" />
      ) : mode === "auto" ? (
        <Monitor className="size-5" />
      ) : (
        <Moon className="size-5" />
      )}
      {mode === "auto" && (
        <span className="absolute -bottom-0.5 -end-0.5 size-2 rounded-full bg-brand-500" />
      )}
    </Button>
  );
}
