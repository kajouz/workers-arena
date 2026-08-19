import { useEffect, useRef, useCallback } from "react";

/**
 * Trap focus within a container element.
 * Useful for modals, dialogs, and dropdown menus.
 *
 * @param active - Whether the trap is active
 * @param containerRef - Ref to the container element
 */
export function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement | null>
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }, [containerRef]);

  useEffect(() => {
    if (!active) return;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the container
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: if at first element, go to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if at last element, go to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the previously focused element
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [active, getFocusableElements]);
}

/**
 * Auto-focus an element when it becomes visible.
 * Useful for input fields in dialogs and modals.
 */
export function useAutoFocus<T extends HTMLElement>(
  active: boolean,
  ref: React.RefObject<T | null>
) {
  useEffect(() => {
    if (active && ref.current) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        ref.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [active, ref]);
}
