/**
 * ────────────────────────────────────────────────────────────────────────────
 * PUSH ONBOARDING (pure logic, no React)
 * ────────────────────────────────────────────────────────────────────────────
 * Rules for the one-time homepage prompt asking signed-in users to enable
 * push notifications:
 *   • Only signed-in users (registration requires a session).
 *   • Never nag twice — once dismissed / enabled / denied, the flag persists
 *     in localStorage for that browser.
 *   • Prompt only when push is actually possible ("idle") — or when a previous
 *     enable attempt errored ("error" → allow retry). Already enabled,
 *     denied, unsupported, unconfigured or still loading → stay hidden.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type PushOnboardingStatus =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "idle"
  | "enabled"
  | "denied"
  | "error";

/** localStorage key — a presence check is all we need ("1" = don't ask again). */
export const ONBOARDING_FLAG = "wa_push_onboarded";

export function shouldShowOnboarding(
  status: PushOnboardingStatus,
  signedIn: boolean,
  dismissed: boolean
): boolean {
  if (!signedIn) return false;
  if (dismissed) return false;
  // Prompt while push is available-but-off, or when the last enable errored.
  return status === "idle" || status === "error";
}

/** Read the persisted "don't ask again" flag (browser-only; safe fallback). */
export function readOnboardingFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Persist the flag — call once when the user enables, dismisses, or is denied. */
export function persistOnboardingFlag(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(ONBOARDING_FLAG, "1");
    else localStorage.removeItem(ONBOARDING_FLAG);
  } catch {
    /* private mode etc. — the prompt may reappear, which is acceptable */
  }
}
