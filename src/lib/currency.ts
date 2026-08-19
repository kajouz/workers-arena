/**
 * Multi-currency support for WorkersArena.
 *
 * Supports:
 * - LBP (Lebanese Pound)
 * - USD (US Dollar)
 * - SAR (Saudi Riyal)
 *
 * Exchange rates are fetched from an API or can be hardcoded for offline use.
 */

export type CurrencyCode = "LBP" | "USD" | "SAR" | "EUR" | "GBP";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  nameAr: string;
  decimals: number;
  symbolPosition: "before" | "after";
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  LBP: {
    code: "LBP",
    symbol: "L£",
    name: "Lebanese Pound",
    nameAr: "ليرة لبنانية",
    decimals: 0,
    symbolPosition: "after",
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    nameAr: "دولار أمريكي",
    decimals: 2,
    symbolPosition: "before",
  },
  SAR: {
    code: "SAR",
    symbol: "ر.س",
    name: "Saudi Riyal",
    nameAr: "ريال سعودي",
    decimals: 2,
    symbolPosition: "after",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Euro",
    nameAr: "يورو",
    decimals: 2,
    symbolPosition: "before",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    name: "British Pound",
    nameAr: "جنيه إسترليني",
    decimals: 2,
    symbolPosition: "before",
  },
};

// Default exchange rates (relative to USD)
// In production, fetch from an API like exchangerate-api.com
const DEFAULT_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  LBP: 89000, // ~89,000 LBP per USD (approximate)
  SAR: 3.75,
  EUR: 0.92,
  GBP: 0.79,
};

let exchangeRates: Record<CurrencyCode, number> = { ...DEFAULT_RATES };
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Get current exchange rates
 */
export function getExchangeRates(): Record<CurrencyCode, number> {
  return { ...exchangeRates };
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;

  // Convert to USD first, then to target
  const inUSD = amount / exchangeRates[from];
  return inUSD * exchangeRates[to];
}

/**
 * Format price with currency symbol
 */
export function formatPrice(
  amount: number,
  currency: CurrencyCode,
  locale: "en" | "ar" = "en"
): string {
  const config = CURRENCIES[currency];
  const formatted = amount.toLocaleString(locale === "ar" ? "ar-LB" : "en-US", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });

  if (config.symbolPosition === "before") {
    return `${config.symbol}${formatted}`;
  }
  return `${formatted} ${config.symbol}`;
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  return CURRENCIES[currency].symbol;
}

/**
 * Get currency name in locale
 */
export function getCurrencyName(
  currency: CurrencyCode,
  locale: "en" | "ar"
): string {
  const config = CURRENCIES[currency];
  return locale === "ar" ? config.nameAr : config.name;
}

/**
 * Fetch latest exchange rates from API
 */
export async function fetchExchangeRates(): Promise<void> {
  // Check cache
  if (Date.now() - lastFetchTime < CACHE_DURATION) {
    return;
  }

  try {
    // In production, use a real API:
    // const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    // const data = await res.json();
    // exchangeRates = { USD: 1, LBP: data.rates.LBP, SAR: data.rates.SAR, ... };

    // For now, use default rates
    exchangeRates = { ...DEFAULT_RATES };
    lastFetchTime = Date.now();
  } catch (error) {
    console.error("[Currency] Failed to fetch rates:", error);
    // Keep using cached/default rates
  }
}

/**
 * Currency selector component props
 */
export interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  available?: CurrencyCode[];
  className?: string;
}

/**
 * Get default currency for a country
 */
export function getDefaultCurrency(countryCode: string): CurrencyCode {
  const map: Record<string, CurrencyCode> = {
    LB: "LBP",
    US: "USD",
    SA: "SAR",
    AE: "SAR",
    KW: "SAR",
    BH: "SAR",
    QA: "SAR",
    OM: "SAR",
    GB: "GBP",
    FR: "EUR",
    DE: "EUR",
    ES: "EUR",
    IT: "EUR",
  };
  return map[countryCode] ?? "USD";
}

/**
 * Parse amount from string (handles different currency formats)
 */
export function parseAmount(
  input: string,
  currency: CurrencyCode
): number | null {
  // Remove currency symbols and whitespace
  const cleaned = input
    .replace(/[L£$€ر.س]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");

  const amount = parseFloat(cleaned);
  return isNaN(amount) ? null : amount;
}
