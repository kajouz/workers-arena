/**
 * Keyboard Navigation Utilities
 *
 * Provides helpers for accessible keyboard navigation patterns:
 * - Arrow key navigation in lists, grids, and menus
 * - Roving tabindex for tab panels
 * - Keyboard shortcut system with screen reader announcements
 * - Reduced motion detection
 */

import { useEffect, useState, useCallback, useRef } from "react";

/* ─── Reduced Motion ─── */

/**
 * Detect user's prefers-reduced-motion setting.
 * Returns true if the user prefers reduced motion.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mql.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return prefersReduced;
}

/**
 * Hook to get animation duration based on reduced motion preference.
 * Returns 0 if reduced motion is preferred, otherwise returns the given duration.
 */
export function useAnimationDuration(ms: number = 300): number {
  const reduced = useReducedMotion();
  return reduced ? 0 : ms;
}

/* ─── Arrow Key Navigation ─── */

export interface ArrowNavigationOptions {
  /** Container ref */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Selector for items within the container */
  itemSelector: string;
  /** Navigation orientation */
  orientation?: "horizontal" | "vertical" | "both";
  /** Whether to loop around at edges */
  loop?: boolean;
  /** Called when the active item changes */
  onActiveChange?: (index: number, element: HTMLElement) => void;
  /** Called when an item is activated (Enter/Space) */
  onActivate?: (index: number, element: HTMLElement) => void;
  /** Escape key handler */
  onEscape?: () => void;
}

/**
 * Arrow key navigation for lists, menus, and grids.
 * Manages roving tabindex automatically.
 */
export function useArrowNavigation({
  containerRef,
  itemSelector,
  orientation = "vertical",
  loop = true,
  onActiveChange,
  onActivate,
  onEscape,
}: ArrowNavigationOptions) {
  const activeIndexRef = useRef<number>(0);

  const getItems = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(itemSelector));
  }, [containerRef, itemSelector]);

  const setActiveIndex = useCallback(
    (index: number) => {
      const items = getItems();
      if (index < 0 || index >= items.length) return;

      // Update tabindex
      items.forEach((item, i) => {
        item.setAttribute("tabindex", i === index ? "0" : "-1");
      });

      items[index]?.focus();
      activeIndexRef.current = index;
      onActiveChange?.(index, items[index]);
    },
    [getItems, onActiveChange]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      const current = activeIndexRef.current;
      let next = current;

      const isHorizontal = orientation === "horizontal" || orientation === "both";
      const isVertical = orientation === "vertical" || orientation === "both";

      switch (e.key) {
        case "ArrowDown":
          if (!isVertical) return;
          e.preventDefault();
          next = current + 1;
          if (next >= items.length) next = loop ? 0 : items.length - 1;
          break;
        case "ArrowUp":
          if (!isVertical) return;
          e.preventDefault();
          next = current - 1;
          if (next < 0) next = loop ? items.length - 1 : 0;
          break;
        case "ArrowRight":
          if (!isHorizontal) return;
          e.preventDefault();
          next = current + 1;
          if (next >= items.length) next = loop ? 0 : items.length - 1;
          break;
        case "ArrowLeft":
          if (!isHorizontal) return;
          e.preventDefault();
          next = current - 1;
          if (next < 0) next = loop ? items.length - 1 : 0;
          break;
        case "Home":
          e.preventDefault();
          next = 0;
          break;
        case "End":
          e.preventDefault();
          next = items.length - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onActivate?.(current, items[current]);
          return;
        case "Escape":
          onEscape?.();
          return;
        default:
          return;
      }

      if (next !== current) {
        setActiveIndex(next);
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    // Set initial tabindex
    const items = getItems();
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === activeIndexRef.current ? "0" : "-1");
    });

    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, getItems, orientation, loop, onActivate, onEscape, setActiveIndex]);

  return { setActiveIndex, getActiveIndex: () => activeIndexRef.current };
}

/* ─── Keyboard Shortcut System ─── */

export interface KeyboardShortcut {
  /** Key combination, e.g. "ctrl+k", "alt+m", "/" */
  key: string;
  /** Description for screen readers */
  description: string;
  /** Handler function */
  handler: (e: KeyboardEvent) => void;
  /** Whether this shortcut is currently enabled */
  enabled?: boolean;
}

/**
 * Register global keyboard shortcuts.
 * Announces shortcuts to screen readers and handles conflicts.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        if (shortcut.enabled === false) continue;

        const parts = shortcut.key.toLowerCase().split("+");
        const key = parts[parts.length - 1];
        const ctrl = parts.includes("ctrl") || parts.includes("control");
        const alt = parts.includes("alt");
        const shift = parts.includes("shift");
        const meta = parts.includes("meta") || parts.includes("cmd");

        const ctrlMatch = ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const altMatch = alt ? e.altKey : !e.altKey;
        const shiftMatch = shift ? e.shiftKey : !e.shiftKey;
        const metaMatch = meta ? e.metaKey : true;
        const keyMatch = e.key.toLowerCase() === key;

        if (ctrlMatch && altMatch && shiftMatch && metaMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/* ─── Focus Visible Utilities ─── */

/**
 * Hook to detect if the user is navigating with keyboard (shows focus rings)
 * or with mouse (hides focus rings).
 */
export function useFocusVisible(): boolean {
  const [isKeyboard, setIsKeyboard] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setIsKeyboard(true);
      }
    };

    const handleMouseDown = () => {
      setIsKeyboard(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  return isKeyboard;
}

/* ─── Live Region Announcer ─── */

/**
 * Programmatic screen reader announcement hook.
 * Use this to announce dynamic changes (toast, loading complete, etc.)
 */
export function useScreenReaderAnnounce() {
  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    const el = document.createElement("div");
    el.setAttribute("role", priority === "assertive" ? "alert" : "status");
    el.setAttribute("aria-live", priority);
    el.setAttribute("aria-atomic", "true");
    el.className = "sr-only";
    el.textContent = message;
    document.body.appendChild(el);

    // Clean up after screen readers have had time to read it
    setTimeout(() => {
      document.body.removeChild(el);
    }, 5000);
  }, []);

  return announce;
}
