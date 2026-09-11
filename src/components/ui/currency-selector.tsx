"use client";

import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

// Tenant lb: single-currency USD — the multi-currency selector is retired.
// Stubs remain for backward compatibility with any future import sites.

export function CurrencySelector({ className }: { value?: CurrencyCode; onChange?: (c: CurrencyCode) => void; available?: CurrencyCode[]; className?: string }) {
  return null;
}

export function CurrencyDisplay({ amount, className }: { amount: number; fromCurrency?: CurrencyCode; toCurrency?: CurrencyCode; className?: string }) {
  const config = CURRENCIES["USD"];
  return <span className={cn(className)}>{config.symbol}{amount.toLocaleString("en-US")}</span>;
}
