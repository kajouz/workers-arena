"use client";

import { create } from "zustand";
import type { Worker } from "@/lib/data/types";

type Theme = "light" | "dark";

interface UiStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  // The server-rendered <html> class is the source of truth for hydration.
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("wa_theme="))
    ?.split("=")[1];
  if (cookie === "light" || cookie === "dark") return cookie;
  const stored = localStorage.getItem("wa_theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Applies the theme class to <html> and persists it (localStorage + cookie). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem("wa_theme", theme);
    document.cookie = `wa_theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  } catch {
    /* ignore */
  }
}

export const useUiStore = create<UiStore>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));

/* ---------------- Favorites (persisted to localStorage) ---------------- */

interface FavoritesStore {
  ids: string[];
  toggle: (worker: Worker) => void;
  has: (id: string) => boolean;
  clear: () => void;
}

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("wa_favorites");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  ids: loadFavorites(),
  toggle: (worker) => {
    const { ids } = get();
    const next = ids.includes(worker.id) ? ids.filter((i) => i !== worker.id) : [...ids, worker.id];
    set({ ids: next });
    try {
      localStorage.setItem("wa_favorites", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },
  has: (id) => get().ids.includes(id),
  clear: () => {
    set({ ids: [] });
    try {
      localStorage.removeItem("wa_favorites");
    } catch {
      /* ignore */
    }
  },
}));
