/**
 * ────────────────────────────────────────────────────────────────────────────
 * CREDIT PURCHASE ENGINE — pure pricing + validation for topping up credits
 * ────────────────────────────────────────────────────────────────────────────
 * Workers buy platform credits through OMT/Whish manual rails or Stripe.
 * The engine is PURE: same package + tier → same price, every time.
 *
 * The flow is:
 *   1. Worker picks a package → `validateCreditPurchase` checks eligibility
 *   2. Checkout minted → Payment row PENDING
 *   3a. Stripe: webhook confirms → credits granted
 *   3b. OMT/Whish: admin confirms receipt → credits granted
 *   4. Ledger entry written (idempotent by paymentId)
 *
 * This module owns step 1 (validation) and the credit calculation.
 * The demo store and Prisma adapters own steps 2-4.
 */

import type { CreditPackage } from "./revenue-settings";

/** The result of validating a credit purchase attempt. */
export interface CreditPurchaseValidation {
  ok: true;
  package: CreditPackage;
  /** Total credits the worker receives (base + bonus). */
  totalCredits: number;
  /** Price in USD major units. */
  priceUsd: number;
  /** Price in minor units (cents). */
  priceMinor: number;
}

export interface CreditPurchaseError {
  ok: false;
  error:
    | "unknown-package"
    | "package-disabled"
    | "invalid-worker"
    | "negative-amount";
}

/**
 * Validate a credit purchase attempt. Pure — only reads the package catalog.
 * The caller (server action) resolves the worker; this only checks the
 * package's validity and computes the price.
 */
export function validateCreditPurchase(
  packages: CreditPackage[],
  packageId: string
): CreditPurchaseValidation | CreditPurchaseError {
  const pkg = packages.find((p) => p.id === packageId);
  if (!pkg) return { ok: false, error: "unknown-package" };
  if (!pkg.enabled) return { ok: false, error: "package-disabled" };

  const totalCredits = pkg.credits + pkg.bonusCredits;
  if (totalCredits <= 0) return { ok: false, error: "negative-amount" };

  const priceUsd = pkg.price;
  const priceMinor = Math.round(priceUsd * 100);

  return { ok: true, package: pkg, totalCredits, priceUsd, priceMinor };
}

/**
 * Compute the effective credits for a package (base + bonus).
 * Exposed separately for the UI to show "25 + 5 bonus = 30 credits".
 */
export function creditPackageTotal(pkg: CreditPackage): number {
  return Math.max(0, pkg.credits + pkg.bonusCredits);
}

/**
 * The price per credit for display comparison across packages.
 * Returns null when the package has zero credits (shouldn't happen, but safe).
 */
export function pricePerCredit(pkg: CreditPackage): number | null {
  const total = creditPackageTotal(pkg);
  return total > 0 ? Math.round((pkg.price / total) * 100) / 100 : null;
}
