"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type CurrencyCode, formatPrice, getExchangeRates } from "@/lib/currency";
import { DEFAULT_COUNTRY } from "@/lib/tenant/countries";

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  convert: (amount: number, from: CurrencyCode) => number;
  format: (amount: number, from?: CurrencyCode) => string;
  rates: Record<CurrencyCode, number>;
  available: CurrencyCode[];
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}

// Tenant lb: single currency USD, taken from the country registry. A future
// country tenant passes the currency (or relies on the default) instead of
// having it hardcoded here — the prop used to be accepted and IGNORED.
export function CurrencyProvider({
  children,
  defaultCurrency = DEFAULT_COUNTRY.currency,
}: {
  children: ReactNode;
  defaultCurrency?: CurrencyCode;
}) {
  const value = useMemo<CurrencyContextType>(
    () => ({
      currency: defaultCurrency,
      setCurrency: () => {},
      convert: (amount) => amount,
      format: (amount) => formatPrice(amount, defaultCurrency),
      rates: getExchangeRates(),
      available: [defaultCurrency],
    }),
    [defaultCurrency]
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

// Kept for backward compat — single USD, no selector needed.
export function CurrencySelector({ className = "" }: { className?: string }) {
  return null;
}

export function DualPrice({ amount, className = "" }: { amount: number; originalCurrency?: CurrencyCode; className?: string }) {
  return <span className={className}>{formatPrice(amount, "USD")}</span>;
}
