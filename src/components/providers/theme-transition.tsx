"use client";

import { useEffect } from "react";

/**
 * Adds a smooth transition class during theme switches so the
 * background and text colors fade instead of snapping.
 *
 * Mount this once in the layout. It listens for class changes on
 * <html> and applies a temporary `theme-transition` class.
 */
export function ThemeTransition() {
  useEffect(() => {
    const root = document.documentElement;

    // Only the SCHEME (`dark` on <html>) is worth transitioning — and applying
    // our own marker below is itself a class mutation, so react to a scheme
    // CHANGE rather than to "a class mutation happened". Reacting to our own
    // add/remove re-entered the observer with no way to settle: the task queue
    // never drained, so the first theme click froze the page outright (it also
    // wedged the dev-server preview, which mutates <html>'s class while
    // hydrating). Comparing the scheme terminates: our own add/remove records
    // read back the same `dark` state and are ignored.
    let isDark = root.classList.contains("dark");
    let timer: ReturnType<typeof setTimeout> | undefined;

    const observer = new MutationObserver(() => {
      const next = root.classList.contains("dark");
      if (next === isDark) return;
      isDark = next;
      root.classList.add("theme-transitioning");
      clearTimeout(timer);
      timer = setTimeout(() => root.classList.remove("theme-transitioning"), 300);
    });

    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <style jsx global>{`
      .theme-transitioning,
      .theme-transitioning *,
      .theme-transitioning *::before,
      .theme-transitioning *::after {
        transition: background-color 0.25s ease, color 0.25s ease,
          border-color 0.25s ease, box-shadow 0.25s ease, fill 0.25s ease !important;
      }
    `}</style>
  );
}
