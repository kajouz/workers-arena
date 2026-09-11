/**
 * Single-currency (USD $) for Lebanon tenant lb.
 * Future tenants will add per-tenant currency via TENANT_SLUG.
 * Hardcoded FX paths remain as stubs for backward compat.
 */

export type CurrencyCode = "USD";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  nameAr: string;
  decimals: number;
  symbolPosition: "before" | "after";
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    nameAr: "دولار أمريكي",
    decimals: 2,
    symbolPosition: "before",
  },
};

const DEFAULT_RATES: Record<CurrencyCode, number> = {
  USD: 1,
};

let exchangeRates: Record<CurrencyCode, number> = { ...DEFAULT_RATES };
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 60 * 1000;

export function getExchangeRates(): Record<CurrencyCode, number> {
  return { ...exchangeRates };
}

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const inUSD = amount / exchangeRates[from];
  return inUSD * exchangeRates[to];
}

export function formatPrice(amount: number, _currency: CurrencyCode = "USD", locale: "en" | "ar" = "en"): string {
  const config = CURRENCIES["USD"];
  const formatted = amount.toLocaleString(locale === "ar" ? "ar-LB" : "en-US", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });
  return `${config.symbol}${formatted}`;
}

export function getCurrencySymbol(_currency: CurrencyCode = "USD"): string {
  return CURRENCIES["USD"].symbol;
}

export function getCurrencyName(_currency: CurrencyCode = "USD", locale: "en" | "ar"): string {
  const config = CURRENCIES["USD"];
  return locale === "ar" ? config.nameAr : config.name;
}

export async function fetchExchangeRates(): Promise<void> {
  if (Date.now() - lastFetchTime < CACHE_DURATION) return;
  exchangeRates = { ...DEFAULT_RATES };
  lastFetchTime = Date.now();
}

export interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  available?: CurrencyCode[];
  className?: string;
}

export function getDefaultCurrency(_countryCode: string): CurrencyCode {
  return "USD";
}

export function parseAmount(input: string, _currency: CurrencyCode = "USD"): number | null {
  const cleaned = input.replace(/[$\s,]/g, "");
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? null : amount;
}
