"use client";

import { useEffect } from "react";
import { applyTheme, useUiStore } from "@/lib/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUiStore((s) => s.theme);

  // Hydrate the server-rendered class + persist the theme cookie on first paint.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return <>{children}</>;
}
