import { describe, expect, it } from "vitest";
import {
  validateCreditPurchase,
  creditPackageTotal,
  pricePerCredit,
  type CreditPurchaseValidation,
} from "../src/lib/data/credit-purchases";
import type { CreditPackage } from "../src/lib/data/revenue-settings";

const PACKAGES: CreditPackage[] = [
  { id: "starter", credits: 10, price: 10, bonusCredits: 0, popular: false, enabled: true, sortOrder: 0 },
  { id: "pro", credits: 25, price: 20, bonusCredits: 5, popular: true, enabled: true, sortOrder: 1 },
  { id: "bulk", credits: 100, price: 70, bonusCredits: 30, popular: false, enabled: true, sortOrder: 2 },
  { id: "disabled", credits: 50, price: 30, bonusCredits: 0, popular: false, enabled: false, sortOrder: 3 },
];

describe("credit purchase engine", () => {
  describe("validateCreditPurchase", () => {
    it("accepts a valid enabled package", () => {
      const result = validateCreditPurchase(PACKAGES, "pro");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.totalCredits).toBe(30); // 25 + 5 bonus
        expect(result.priceUsd).toBe(20);
        expect(result.priceMinor).toBe(2000);
      }
    });

    it("returns error for unknown package", () => {
      const result = validateCreditPurchase(PACKAGES, "nonexistent");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("unknown-package");
    });

    it("returns error for disabled package", () => {
      const result = validateCreditPurchase(PACKAGES, "disabled");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("package-disabled");
    });

    it("handles zero-bonus package", () => {
      const result = validateCreditPurchase(PACKAGES, "starter");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.totalCredits).toBe(10);
        expect(result.priceUsd).toBe(10);
      }
    });

    it("handles high-bonus package", () => {
      const result = validateCreditPurchase(PACKAGES, "bulk");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.totalCredits).toBe(130); // 100 + 30 bonus
        expect(result.priceUsd).toBe(70);
      }
    });
  });

  describe("creditPackageTotal", () => {
    it("returns base + bonus", () => {
      expect(creditPackageTotal(PACKAGES[1])).toBe(30);
    });

    it("returns base when no bonus", () => {
      expect(creditPackageTotal(PACKAGES[0])).toBe(10);
    });
  });

  describe("pricePerCredit", () => {
    it("computes price per credit for package with bonus", () => {
      const ppc = pricePerCredit(PACKAGES[1]);
      expect(ppc).toBeCloseTo(0.67, 1); // $20 / 30 credits
    });

    it("computes price per credit for no-bonus package", () => {
      const ppc = pricePerCredit(PACKAGES[0]);
      expect(ppc).toBe(1.0); // $10 / 10 credits
    });
  });
});
