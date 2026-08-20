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

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          root.classList.add("theme-transitioning");
          clearTimeout((root as any)._ttTimer);
          (root as any)._ttTimer = setTimeout(() => {
            root.classList.remove("theme-transitioning");
          }, 300);
        }
      }
    });

    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
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
