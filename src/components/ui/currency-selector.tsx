"use client";

import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { cn, formatNumber } from "@/lib/utils";

// Tenant lb: single-currency USD — the multi-currency selector is retired.
// Stubs remain for backward compatibility with any future import sites.

export function CurrencySelector({ className }: { value?: CurrencyCode; onChange?: (c: CurrencyCode) => void; available?: CurrencyCode[]; className?: string }) {
  return null;
}

export function CurrencyDisplay({ amount, className }: { amount: number; fromCurrency?: CurrencyCode; toCurrency?: CurrencyCode; className?: string }) {
  const config = CURRENCIES["USD"];
  // Digits come from formatNumber (the ONE place the numeral convention is
  // decided) rather than a locally pinned "en-US": the two agree today, but a
  // second formatter is exactly how the digits drifted everywhere else.
  return <span className={cn(className)}>{config.symbol}{formatNumber(amount)}</span>;
}
