import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_FLAG,
  persistOnboardingFlag,
  readOnboardingFlag,
  shouldShowOnboarding,
  type PushOnboardingStatus,
} from "../src/lib/notifications/onboarding";

/** Minimal localStorage stand-in (vitest runs in the node environment). */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  const storage = makeStorage();
  // Simulate a browser: the lib guards on `typeof window`, so both globals
  // must exist for the persistence path to run.
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

afterEach(() => {
  // @ts-expect-error removing test-only stubs
  delete globalThis.window;
  // @ts-expect-error removing test-only stubs
  delete globalThis.localStorage;
});

describe("shouldShowOnboarding", () => {
  it("never prompts signed-out visitors", () => {
    for (const status of ["idle", "error", "enabled", "denied"] as PushOnboardingStatus[]) {
      expect(shouldShowOnboarding(status, false, false)).toBe(false);
    }
  });

  it("never prompts twice once dismissed", () => {
    expect(shouldShowOnboarding("idle", true, true)).toBe(false);
    expect(shouldShowOnboarding("error", true, true)).toBe(false);
  });

  it("prompts only when push is possible (idle) or retryable (error)", () => {
    expect(shouldShowOnboarding("idle", true, false)).toBe(true);
    expect(shouldShowOnboarding("error", true, false)).toBe(true);

    // Every other state must stay hidden.
    for (const status of ["loading", "unsupported", "unconfigured", "enabled", "denied"] as PushOnboardingStatus[]) {
      expect(shouldShowOnboarding(status, true, false)).toBe(false);
    }
  });
});

describe("onboarding flag persistence", () => {
  it("defaults to unset (prompt allowed)", () => {
    expect(readOnboardingFlag()).toBe(false);
  });

  it("persists the don't-ask-again flag and reads it back", () => {
    persistOnboardingFlag(true);
    expect(localStorage.getItem(ONBOARDING_FLAG)).toBe("1");
    expect(readOnboardingFlag()).toBe(true);
  });

  it("clears the flag when reset", () => {
    persistOnboardingFlag(true);
    persistOnboardingFlag(false);
    expect(readOnboardingFlag()).toBe(false);
  });
});
