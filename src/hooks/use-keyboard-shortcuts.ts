"use client";

import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  descriptionAr: string;
  category: "navigation" | "action" | "search" | "settings";
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts hook
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Default keyboard shortcuts for WorkersArena
 */
export const defaultShortcuts: KeyboardShortcut[] = [
  // Navigation
  {
    key: "g",
    action: () => { window.location.href = "/"; },
    description: "Go to Home",
    descriptionAr: "الذهاب للرئيسية",
    category: "navigation",
  },
  {
    key: "s",
    action: () => { window.location.href = "/search"; },
    description: "Go to Search",
    descriptionAr: "الذهاب للبحث",
    category: "navigation",
  },
  {
    key: "b",
    action: () => { window.location.href = "/bookings"; },
    description: "Go to Bookings",
    descriptionAr: "الذهاب للحجوزات",
    category: "navigation",
  },
  {
    key: "d",
    action: () => { window.location.href = "/dashboard"; },
    description: "Go to Dashboard",
    descriptionAr: "الذهاب للوحة التحكم",
    category: "navigation",
  },

  // Search
  {
    key: "/",
    action: () => {
      const searchInput = document.querySelector('[type="search"], input[name="q"], input[placeholder*="Search"]') as HTMLInputElement;
      searchInput?.focus();
    },
    description: "Focus search",
    descriptionAr: "التركيز على البحث",
    category: "search",
  },
  {
    key: "Escape",
    action: () => {
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
    },
    description: "Clear focus",
    descriptionAr: "مسح التركيز",
    category: "search",
  },

  // Actions
  {
    key: "?",
    shift: true,
    action: () => {
      // Toggle shortcuts help modal
      document.dispatchEvent(new CustomEvent("toggle-shortcuts-help"));
    },
    description: "Show keyboard shortcuts",
    descriptionAr: "عرض اختصارات لوحة المفاتيح",
    category: "settings",
  },
  {
    key: "t",
    action: () => {
      document.documentElement.classList.toggle("dark");
      const isDark = document.documentElement.classList.contains("dark");
      localStorage.setItem("wa_theme", isDark ? "dark" : "light");
    },
    description: "Toggle dark mode",
    descriptionAr: "تبديل الوضع الداكن",
    category: "settings",
  },
];

/**
 * Keyboard shortcuts help modal component props
 */
export interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  shortcuts?: KeyboardShortcut[];
}

/**
 * Format shortcut key for display
 */
export function formatShortcutKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.meta) parts.push("⌘");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt) parts.push("Alt");
  parts.push(shortcut.key.toUpperCase());
  return parts.join(" + ");
}
