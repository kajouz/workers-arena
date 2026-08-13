"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useUiStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Theme toggle. `initialTheme` is the server-rendered theme (from the layout's
 * cookie check) so the first paint matches SSR exactly — no hydration flash.
 */
export function ThemeToggle({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const current = hydrated ? theme : initialTheme;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={current === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={current === "dark" ? "Light mode" : "Dark mode"}
    >
      {current === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
