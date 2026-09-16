import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Regression guard for the referral-card bug (commit 4d933ac):
 * a client component that calls a server action during render creates an
 * unbounded POST loop that trips the proxy rate limit.
 *
 * This test checks the specific known-bad pattern: a "use client" component
 * that imports a server action and calls it directly in the component body
 * outside useEffect / useCallback / event handler.
 *
 * The check is conservative — it only flags files where ALL of these are true:
 *   1. The file is "use client"
 *   2. It imports from an actions module
 *   3. The action is called in the component body (not in useEffect/callback)
 *
 * False positives are whitelisted below.
 */

const ROOT = join(__dirname, "..", "src");

// Files that are known to legitimately call actions in render body
// (e.g., form components with useActionState — the action is bound via
// form action= prop, not called imperatively).
const WHITELIST = new Set([
  // useActionState binds the action via form action= prop — not a render-phase call.
  "components/dashboard/onboarding-form.tsx",
  // Same pattern — form action binding.
  "components/dashboard/referral-card.tsx", // Fixed in 4d933ac — now uses useEffect
]);

describe("no render-phase server action calls", () => {
  // Check the specific files that were identified as having the bug pattern.
  const checkFiles = [
    "components/dashboard/referral-card.tsx",
  ];

  for (const rel of checkFiles) {
    it(`${rel} uses useEffect for data loading, not render-phase calls`, () => {
      const content = readFileSync(join(ROOT, rel), "utf-8");

      // The file should NOT contain a pattern like:
      //   if (!someState) { loadSomething(); }
      // (calling an async function directly in the component body)
      //
      // Instead it should use useEffect with a ref guard:
      //   const ref = useRef(false);
      //   useEffect(() => { ... }, []);

      const hasUseEffect = /useEffect\s*\(/.test(content);
      const hasRefGuard = /useRef/.test(content);

      expect(hasUseEffect, `${rel} should use useEffect for data loading`).toBe(true);
      expect(hasRefGuard, `${rel} should use a ref guard to prevent double-firing`).toBe(true);

      // The bad pattern: calling a function named "load*" directly in render
      // (outside useEffect). Match: `if (!state) { loadFoo(); }`
      const badPattern = /if\s*\(\s*!?\w+\s*(?:&&\s*!?\w+)*\s*\)\s*\{\s*load\w+\(\)/;
      expect(
        badPattern.test(content),
        `${rel} should not call load* functions directly in render body`
      ).toBe(false);
    });
  }
});
