"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  type CurrencyCode,
  CURRENCIES,
  convertCurrency,
  formatPrice,
  getExchangeRates,
  fetchExchangeRates,
  getDefaultCurrency,
} from "@/lib/currency";

interface CurrencyContextType {
  /** Currently selected display currency */
  currency: CurrencyCode;
  /** Set the display currency */
  setCurrency: (c: CurrencyCode) => void;
  /** Convert an amount from one currency to the current display currency */
  convert: (amount: number, from: CurrencyCode) => number;
  /** Format an amount in the current display currency */
  format: (amount: number, from?: CurrencyCode) => string;
  /** Get exchange rates */
  rates: Record<CurrencyCode, number>;
  /** Available currencies */
  available: CurrencyCode[];
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}

export function CurrencyProvider({
  children,
  defaultCurrency = "USD",
}: {
  children: ReactNode;
  defaultCurrency?: CurrencyCode;
}) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(defaultCurrency);
  const [rates, setRates] = useState(getExchangeRates());

  // Load saved currency preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wa-currency") as CurrencyCode | null;
      if (saved && CURRENCIES[saved]) {
        setCurrencyState(saved);
      } else {
        // Detect from browser locale
        const detected = detectUserCurrency();
        setCurrencyState(detected);
      }
    } catch {
      // SSR or localStorage unavailable
    }
  }, []);

  // Fetch exchange rates on mount
  useEffect(() => {
    fetchExchangeRates().then(() => setRates(getExchangeRates()));
  }, []);

  const setCurrency = (c: CurrencyCode) => {
    setCurrencyState(c);
    try {
      localStorage.setItem("wa-currency", c);
    } catch {
      // SSR or localStorage unavailable
    }
  };

  const convert = (amount: number, from: CurrencyCode): number => {
    return convertCurrency(amount, from, currency);
  };

  const format = (amount: number, from?: CurrencyCode): string => {
    const converted = from ? convertCurrency(amount, from, currency) : amount;
    return formatPrice(converted, currency);
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        convert,
        format,
        rates,
        available: Object.keys(CURRENCIES) as CurrencyCode[],
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Detect user's preferred currency from browser locale
 */
function detectUserCurrency(): CurrencyCode {
  try {
    const lang = navigator.language || navigator.languages?.[0] || "";
    // Lebanese users
    if (lang.includes("ar-LB") || lang.includes("LB")) return "LBP";
    // Saudi users
    if (lang.includes("ar-SA") || lang.includes("SA")) return "SAR";
    // Default to USD for most international users
    return "USD";
  } catch {
    return "USD";
  }
}

/**
 * Currency selector dropdown component
 */
export function CurrencySelector({ className = "" }: { className?: string }) {
  const { currency, setCurrency, available } = useCurrency();

  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
      className={`px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {available.map((code) => (
        <option key={code} value={code}>
          {CURRENCIES[code].symbol} {CURRENCIES[code].name}
        </option>
      ))}
    </select>
  );
}

/**
 * Dual price display - shows price in both original and converted currencies
 */
export function DualPrice({
  amount,
  originalCurrency,
  className = "",
}: {
  amount: number;
  originalCurrency: CurrencyCode;
  className?: string;
}) {
  const { currency, convert } = useCurrency();
  const converted = convert(amount, originalCurrency);

  if (currency === originalCurrency) {
    return (
      <span className={className}>
        {formatPrice(amount, originalCurrency)}
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="font-bold">{formatPrice(converted, currency)}</span>
      <span className="text-sm text-gray-500 ml-2">
        ({formatPrice(amount, originalCurrency)})
      </span>
    </span>
  );
}
