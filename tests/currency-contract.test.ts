import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENCIES,
  TENANT_CURRENCY,
  formatPrice as formatPriceFromCurrency,
  getCurrencySymbol,
} from "@/lib/currency";
import { formatPrice as formatPriceFromUtils } from "@/lib/utils";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The tenant runs single-currency USD (docs/MULTI-COUNTRY-AND-QUALITY-PLAN.md).
 * These tests lock the two invariants the currency refactor established:
 *   1. ONE definition — `formatPrice`/`CurrencyCode` live in `@/lib/currency`
 *      and `@/lib/utils` only re-exports them (no second implementation).
 *   2. NO foreign-currency literals in the user-facing UI or the admin mocks —
 *      the app was multi-country before it was scoped to Lebanon, and residue
 *      (SAR/AED/EGP/LBP/JOD…) kept surfacing in shipping surfaces.
 */

describe("currency — single source of truth", () => {
  it("re-exports the exact same formatPrice from @/lib/utils (no second implementation)", () => {
    expect(formatPriceFromUtils).toBe(formatPriceFromCurrency);
  });

  it("has exactly one currency configured for the tenant", () => {
    expect(Object.keys(CURRENCIES)).toEqual([TENANT_CURRENCY]);
    expect(TENANT_CURRENCY).toBe("USD");
    expect(getCurrencySymbol()).toBe("$");
  });
});

describe("currency — formatPrice", () => {
  it("prefixes the configured symbol in whole major units", () => {
    expect(formatPriceFromCurrency(150)).toBe("$150");
    expect(formatPriceFromCurrency(9)).toBe("$9");
    expect(formatPriceFromCurrency(0)).toBe("$0");
  });

  it("keeps Western digits in both UI locales (the house numeral convention)", () => {
    expect(formatPriceFromCurrency(150, "USD", "en")).toBe(formatPriceFromCurrency(150, "USD", "ar"));
    expect(formatPriceFromCurrency(1234567, "USD", "ar")).toBe("$1,234,567");
  });
});

/** Directory names whose rendered copy must never name a foreign currency. */
const UI_DIRS = ["src/components", "src/app"];

/**
 * Currencies the platform does not transact in — any literal here is drift.
 * Covers the ISO codes AND the Arabic short forms (ر.س / د.إ): the homepage
 * showcase card leaked a Saudi price as "150 ر.س" past a code-only scan.
 */
const FOREIGN_CURRENCY = /\b(SAR|AED|EGP|LBP|JOD|QAR|KWD|BHD|OMR|MAD)\b|\u0631\.\u0633|\u062f\.\u0625/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("currency — no foreign-currency literals in the UI or admin mocks", () => {
  it.each(UI_DIRS)("has none under %s", (relDir) => {
    const dir = path.join(ROOT, relDir);
    expect(statSync(dir).isDirectory()).toBe(true);

    const offenders: string[] = [];
    for (const file of walk(dir)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (FOREIGN_CURRENCY.test(line)) {
            offenders.push(`${path.relative(ROOT, file)}:${i + 1} — ${line.trim()}`);
          }
        });
    }

    expect(
      offenders,
      `Foreign-currency literals found (tenant lb is USD-only):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
