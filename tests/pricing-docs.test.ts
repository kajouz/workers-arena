import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_CATALOG } from "../src/lib/data/subscription-plans";
import { DEFAULT_CREDIT_PACKAGES } from "../src/lib/data/revenue-settings";
import { DEFAULT_LEAD_MARKET_CONFIG } from "../src/lib/data/lead-market";
import { PURCHASE_PRICES } from "../src/lib/data/purchases";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PRICING DOCS GUARD — the docs must not invent prices
 * ────────────────────────────────────────────────────────────────────────────
 * The catalogs are the truth: `PLAN_CATALOG` (subscription plans),
 * `DEFAULT_LEAD_MARKET_CONFIG.prices` (lead grades), `DEFAULT_CREDIT_PACKAGES`
 * and `PURCHASE_PRICES` (verification / featured / emergency add-ons). The docs
 * quote them to customers, workers and (in the marketing leaflets) strangers.
 *
 * They had already drifted: ENHANCEMENT-PLAN §3.1 advertised credit packages at
 * "$25 (10) / $50 (25+5) / $90 (50+15) / $100 (100+30)" while the code — and
 * two other docs — said $10/$25/$50/$100. A doc that quotes a price the product
 * does not charge is a promise the platform cannot keep, and nothing was
 * checking. This guard reads the REAL files and fails when a row contradicts
 * the catalog it describes.
 *
 * It is deliberately value-based, not prose-based: it locates each price table
 * by its heading, reads the rows, and compares the numbers to the catalog — so
 * rewording a sentence is free, but changing a number next to a plan's name is
 * not. (Same philosophy as tests/ignore-patterns.test.ts: evaluate the real
 * artifact instead of pattern-matching its shape.)
 */

const REPO_DOCS = [
  "docs/BUSINESS-MODEL.md",
  "docs/BUSINESS-MODEL-SUMMARY.md",
  "docs/REVENUE-STREAMS.md",
  "docs/ENHANCEMENT-PLAN.md",
  "docs/booking-take-rate.md",
] as const;

/**
 * The credit-package table's rows, scoped to its own section.
 *
 * Scoping matters: the fee-ladder and plan tables have rows labelled
 * `Starter` / `Professional` too, and a guard that mixed them up would flag the
 * take-rate table for not listing credits. Only rows under a heading that names
 * credits count.
 */
function creditPackageRows(markdown: string): string[] {
  const lines = markdown.split("\n");
  const rows: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line);
    if (isHeading) inSection = /credit/i.test(line);
    else if (inSection && /^\|\s*(Starter|Popular|Professional|Enterprise)\s*\|/.test(line)) rows.push(line);
  }
  return rows;
}

describe("pricing docs guard — every documented price matches the catalog", () => {
  it("all guarded docs exist (a rename must not silently disable this guard)", () => {
    for (const file of REPO_DOCS) {
      expect(existsSync(file), `${file} is missing — update REPO_DOCS in this guard`).toBe(true);
    }
  });

  it("subscription plan prices match PLAN_CATALOG", () => {
    const docs = REPO_DOCS.map((file) => ({ file, content: readFileSync(file, "utf8") }));
    // Each plan's monthly price must appear in the doc that lists the plans —
    // and no doc may quote a monthly price the catalog does not charge for that
    // plan. The label is the anchor (the catalog's labelEn is the shipped name).
    for (const { file, content } of docs) {
      for (const plan of PLAN_CATALOG) {
        const line = content
          .split("\n")
          .find((l) => new RegExp(`\\*\\*${plan.labelEn}\\*\\*`).test(l) && /\$\d/.test(l));
        if (!line) continue; // docs that do not have a plan table for this plan
        const prices = [...line.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
        expect(
          prices.includes(plan.monthlyPriceUsd),
          `${file}: the ${plan.labelEn} row (${line.trim().slice(0, 90)}…) does not quote the catalog's $${plan.monthlyPriceUsd}`
        ).toBe(true);
      }
    }
  });

  it("lead-grade prices match the catalog", () => {
    const prices = DEFAULT_LEAD_MARKET_CONFIG.prices;
    const checked: Array<[string, number]> = [
      ["Bronze", prices.bronze],
      ["Silver", prices.silver],
      ["Gold", prices.gold],
      ["Emergency", prices.emergency],
    ];
    for (const file of REPO_DOCS) {
      const markdown = readFileSync(file, "utf8");
      for (const [label, value] of checked) {
        const row = markdown.split("\n").find((l) => l.includes(`**${label}**`) && /credits|\$/.test(l));
        if (!row) continue;
        expect(
          new RegExp(`\\$?${value}\\b`).test(row),
          `${file}: the ${label} lead row (${row.trim().slice(0, 90)}…) does not quote the catalog's ${value} credits`
        ).toBe(true);
      }
    }
  });

  it("credit packages match DEFAULT_CREDIT_PACKAGES in credits and price", () => {
    const byLabel = new Map(
      DEFAULT_CREDIT_PACKAGES.map((p) => [p.id.charAt(0).toUpperCase() + p.id.slice(1), p])
    );
    let rowsChecked = 0;
    for (const file of REPO_DOCS) {
      for (const row of creditPackageRows(readFileSync(file, "utf8"))) {
        const cells = row.split("|").map((c) => c.trim());
        const label = cells[1];
        const pkg = byLabel.get(label);
        if (!pkg) continue; // a doc may describe a package it renamed; the price cells still matter
        const numeric = [...row.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
        expect(
          numeric.includes(pkg.credits),
          `${file}: the ${label} credit row (${row.trim().slice(0, 90)}…) does not quote the catalog's ${pkg.credits} credits`
        ).toBe(true);
        expect(
          numeric.includes(pkg.price),
          `${file}: the ${label} credit row (${row.trim().slice(0, 90)}…) does not quote the catalog's $${pkg.price}`
        ).toBe(true);
        rowsChecked += 1;
      }
    }
    expect(rowsChecked, "no credit-package rows were found in any guarded doc").toBeGreaterThan(0);
  });

  it("inline prose price mentions agree with the credit catalog", () => {
    // The drift that motivated this guard was PROSE, not a table row:
    // "Packages: Starter $25 (10), Popular $50 (25+5) …" next to a catalog that
    // charges $10/$25/$50/$100. A price is a price whether it sits in a table
    // or a sentence.
    const byLabel = new Map(
      DEFAULT_CREDIT_PACKAGES.map((p) => [p.id.charAt(0).toUpperCase() + p.id.slice(1), p])
    );
    let mentionsChecked = 0;
    for (const file of REPO_DOCS) {
      // Per LINE, and only lines that are actually about credits: the plans'
      // category multipliers read "Starter $7.50/mo" (a plan price, correctly
      // not $10), so an unscoped matcher would flag the wrong table.
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/credit/i.test(line)) continue;
        for (const [label, pkg] of byLabel) {
          for (const match of line.matchAll(new RegExp(`${label} \\$(\\d+)`, "g"))) {
            mentionsChecked += 1;
            expect(
              Number(match[1]),
              `${file}: "${label} $${match[1]}" contradicts the catalog's $${pkg.price} credit package`
            ).toBe(pkg.price);
          }
        }
      }
    }
    expect(mentionsChecked, "no inline credit-package prices were found to check").toBeGreaterThan(0);
  });

  it("add-on prices match PURCHASE_PRICES", () => {
    for (const file of REPO_DOCS) {
      const markdown = readFileSync(file, "utf8");
      // The catalog holds MINOR units; the docs quote dollars.
      const usd = (minor: number) => minor / 100;
      const checks: Array<[RegExp, number, string]> = [
        [/\*\*Basic\*\*/, usd(PURCHASE_PRICES.verification.basic), "verification basic"],
        [/\*\*Professional\*\*/, usd(PURCHASE_PRICES.verification.professional), "verification professional"],
        [/\*\*Featured slot\*\*/, usd(PURCHASE_PRICES.featured), "featured slot"],
        [/\*\*Emergency marker\*\*/, usd(PURCHASE_PRICES.emergency), "emergency marker"],
      ];
      for (const [anchor, price, label] of checks) {
        const row = markdown.split("\n").find((l) => anchor.test(l) && /\$\d/.test(l));
        if (!row) continue;
        expect(
          new RegExp(`\\$${price}\\b`).test(row),
          `${file}: the ${label} row (${row.trim().slice(0, 90)}…) does not quote the catalog's $${price}`
        ).toBe(true);
      }
    }
  });
});
