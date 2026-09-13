/**
 * THE currency module — single source of truth for the tenant's money type and
 * formatting.
 *
 * Tenant lb (Lebanon) runs single-currency USD. `CurrencyCode` and
 * `formatPrice` are DEFINED HERE and re-exported by `@/lib/utils` so the many
 * existing `@/lib/utils` import sites keep working without a second definition
 * (they used to drift: two `CurrencyCode` unions and two divergent
 * `formatPrice` implementations). Add a tenant currency by extending
 * `CurrencyCode` + `CURRENCIES` here — nothing else.
 *
 * WHICH currency a country uses is country policy — see
 * `@/lib/tenant/countries` (`CurrencyConfig.currency`). Changing a tenant's
 * currency means one registry entry, not an edit here.
 *
 * Hardcoded FX paths remain as stubs for backward compat.
 */
import { countryByCode, DEFAULT_COUNTRY } from "@/lib/tenant/countries";

/** The currencies this tenant can transact in. Single-currency USD (tenant lb);
 * a future country tenant re-opens this union here and in CURRENCIES. */
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

/** The tenant's currency — the one the platform transacts in (from the
 * country registry, so the money type and the country can never disagree). */
export const TENANT_CURRENCY: CurrencyCode = DEFAULT_COUNTRY.currency;

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

/**
 * Format a major-unit price in the tenant's currency.
 *
 * The currency (symbol + placement) comes from `CURRENCIES`, so a future tenant
 * currency renders correctly from the same call site. Amounts are rendered in
 * whole major units — the established display contract (notification templates
 * and receipts rely on it) — with Western digits and comma grouping in BOTH UI
 * locales: the house numeral convention shared with `formatNumber`, so every
 * number on an Arabic page stays Latin and consistent.
 */
export function formatPrice(
  amount: number,
  currency: CurrencyCode = TENANT_CURRENCY,
  _locale: "en" | "ar" = "en"
): string {
  const config = CURRENCIES[currency] ?? CURRENCIES[TENANT_CURRENCY];
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
  return config.symbolPosition === "after"
    ? `${formatted} ${config.symbol}`
    : `${config.symbol}${formatted}`;
}

export function getCurrencySymbol(currency: CurrencyCode = TENANT_CURRENCY): string {
  return (CURRENCIES[currency] ?? CURRENCIES[TENANT_CURRENCY]).symbol;
}

export function getCurrencyName(currency: CurrencyCode = TENANT_CURRENCY, locale: "en" | "ar"): string {
  const config = CURRENCIES[currency] ?? CURRENCIES[TENANT_CURRENCY];
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

/** The currency a country transacts in (registry lookup; falls back to the
 * served country for an unconfigured/unknown code). */
export function getDefaultCurrency(countryCode: string): CurrencyCode {
  return countryByCode(countryCode)?.currency ?? TENANT_CURRENCY;
}

export function parseAmount(input: string, _currency: CurrencyCode = TENANT_CURRENCY): number | null {
  const cleaned = input.replace(/[$\s,]/g, "");
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? null : amount;
}
