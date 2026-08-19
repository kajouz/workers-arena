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
  const [mode, setMode] = useState<"light" | "dark" | "auto">("auto");
  
  useEffect(() => {
    setHydrated(true);
    // Check if user has a saved preference
    const saved = localStorage.getItem("wa_theme_mode") as "light" | "dark" | "auto" | null;
    if (saved) {
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
    localStorage.setItem("wa_theme_mode", nextMode);
    if (nextMode !== "auto") {
      setTheme(nextMode);
    }
  };

  const current = hydrated ? theme : initialTheme;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Theme: ${mode}. Click to cycle through light, dark, and system preference`}
      title={`Theme: ${mode === "auto" ? "System" : mode}`}
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
