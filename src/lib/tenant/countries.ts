/**
 * THE country registry — the single source of truth for the country-scoped
 * facts the app used to hardcode: transaction currency, `Intl` date/clock and
 * speech locales, the E.164 calling code, the schema.org SEO region, and the
 * geo centers. (Numerals are deliberately NOT country-scoped — see
 * `NUMBER_LOCALE`.)
 *
 * Tenant lb (Lebanon) is the only entry today. Adding a country is ONE entry
 * here plus its cities in the city catalog — every consumer picks it up with no
 * code change: SEO structured data, city landing pages, WhatsApp deep links,
 * phone placeholders, `Intl` number/date formatting, and the geo center map.
 *
 * Each entry also owns its CITIES and the metadata its demo workforce is
 * generated from (see `CitySeed` / `DemoWorkforceConfig`), so the seed can
 * populate any configured country — `SEED_COUNTRY=<slug> npm run db:seed` —
 * without anyone hand-editing the city or worker dataset.
 *
 * This module is a LEAF: no runtime imports. Type-only imports keep the
 * currency/payment unions in one place without creating an import cycle.
 */
import type { CurrencyCode } from "@/lib/currency";
import type { PaymentMethod } from "@/lib/data/types";

/** One neighborhood/area of a city. */
export interface AreaSeed {
  slug: string;
  nameEn: string;
  nameAr: string;
}

/**
 * A city this country serves. The `City` rows the app and the seed consume are
 * PROJECTED from these (src/lib/data/cities.ts): the country name, the
 * transaction currency and the tenant slug all come from the enclosing config,
 * so a city row can never drift from its country.
 */
export interface CitySeed {
  slug: string;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
  areas: readonly AreaSeed[];
}

/**
 * The compact country metadata a DEMO WORKFORCE is generated from. The shared
 * role recipes (src/lib/data/worker-recipes.ts) pair with `names` BY INDEX:
 * recipe i takes name i, a round-robin city/area from `cities`, and a phone
 * built from this country's `dialCode` + a `phonePrefixes` entry. Populating a
 * new country's demo workers means filling this in — the worker dataset itself
 * is generated, never hand-edited.
 */
export interface DemoWorkforceConfig {
  /** Localized full names, one per worker recipe (paired by index). */
  names: readonly { en: string; ar: string }[];
  /** National mobile prefixes (e.g. "70"); a recipe's `phonePrefixIndex` selects one. */
  phonePrefixes: readonly string[];
  /** TLD appended to a recipe's brand domain for demo email + website URLs. */
  emailTld: string;
}

export interface CountryConfig {
  /** ISO 3166-1 alpha-2 — also the schema.org `addressCountry` value. */
  code: string;
  /** Tenant/dataset slug (the city catalog + seed key off it). */
  slug: string;
  nameEn: string;
  nameAr: string;
  /** E.164 calling code, digits only (no leading "+"). */
  dialCode: string;
  /** The country's transaction currency. */
  currency: CurrencyCode;
  /**
   * BCP-47 tags for `Intl` DATE/CLOCK formatting per UI locale. The `ar` tag is
   * country-specific (Lebanese Arabic month names differ from Egyptian).
   *
   * Numbers deliberately do NOT follow this — see `NUMBER_LOCALE` below.
   */
  intlLocale: { en: string; ar: string };
  /** BCP-47 tag for speech recognition per UI locale. */
  speechLocale: { en: string; ar: string };
  /** IANA time zone. */
  timeZone: string;
  /** Payment provider methods this country collects with. */
  paymentMethods: readonly PaymentMethod[];
  /** Cities this country serves (the city catalog is projected from these). */
  cities: readonly CitySeed[];
  /** The metadata the demo workforce is generated from (see above). */
  demoWorkforce: DemoWorkforceConfig;
}

export const COUNTRIES: Record<string, CountryConfig> = {
  lb: {
    code: "LB",
    slug: "lb",
    nameEn: "Lebanon",
    nameAr: "لبنان",
    dialCode: "961",
    currency: "USD",
    intlLocale: { en: "en-US", ar: "ar-LB" },
    speechLocale: { en: "en-US", ar: "ar-LB" },
    timeZone: "Asia/Beirut",
    paymentMethods: ["omt", "whish", "stripe", "simulated"],
    cities: [
      {
        slug: "beirut",
        nameEn: "Beirut",
        nameAr: "بيروت",
        lat: 33.8938,
        lng: 35.5018,
        areas: [
          { slug: "achrafieh", nameEn: "Achrafieh", nameAr: "الأشرفية" },
          { slug: "hamra", nameEn: "Hamra", nameAr: "الحمرا" },
          { slug: "gemmayzeh", nameEn: "Gemmayzeh", nameAr: "الجميزة" },
          { slug: "mar-mikhael", nameEn: "Mar Mikhael", nameAr: "مار مخايل" },
          { slug: "badaro", nameEn: "Badaro", nameAr: "بدارو" },
        ],
      },
    ],
    // One name per WORKER_RECIPE, in recipe order — the demo workforce for
    // Lebanon is generated from these + the shared recipes (no dataset edits).
    demoWorkforce: {
      names: [
        { en: "Khaled Al-Harbi", ar: "خالد الحربي" },
        { en: "Jad El Khoury", ar: "جاد الخوري" },
        { en: "Ali Hassan", ar: "علي حسن" },
        { en: "Youssef Benali", ar: "يوسف بن علي" },
        { en: "Ahmad Nassar", ar: "أحمد نصار" },
        { en: "Omar Al-Mutairi", ar: "عمر المطيري" },
        { en: "Hassan Karimi", ar: "حسن كريمي" },
        { en: "Sami Najjar", ar: "سامي نجار" },
        { en: "Fadi Jabbour", ar: "فادي جبور" },
        { en: "Ibrahim Khalil", ar: "إبراهيم خليل" },
        { en: "Tarek Chammas", ar: "طارق شماس" },
        { en: "Bilal Mansour", ar: "بلال منصور" },
        { en: "Nadim Karam", ar: "نديم كرم" },
        { en: "Wissam Ghanem", ar: "وسام غانم" },
        { en: "Rami Awwad", ar: "رامي عواد" },
        { en: "Sami Haddad", ar: "سامي حداد" },
        { en: "Karim El-Fassi", ar: "كريم الفاسي" },
        { en: "Nabil Salloum", ar: "نبيل سلوم" },
      ],
      // Lebanon's mobile prefixes — recipes index into this list.
      phonePrefixes: ["70", "71", "76", "3", "81"],
      emailTld: "lb",
    },
  },
};

/** The country this deployment serves (tenant lb — Lebanon). */
export const DEFAULT_COUNTRY: CountryConfig = COUNTRIES.lb!;

export const ALL_COUNTRIES: readonly CountryConfig[] = Object.values(COUNTRIES);

/** Resolve a country by its tenant slug (e.g. "lb"). */
export function countryBySlug(slug: string): CountryConfig | undefined {
  return COUNTRIES[slug];
}

/** Resolve a country by its ISO 3166-1 alpha-2 code (e.g. "LB"). */
export function countryByCode(code: string): CountryConfig | undefined {
  return ALL_COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
}

/**
 * Resolve a country by its display name in either language. The city catalog
 * (and the `City` rows it seeds) carry localized country NAMES rather than an
 * ISO code, so this is how a city resolves back to its config without a schema
 * change.
 */
export function countryByName(name: string): CountryConfig | undefined {
  const needle = name.trim().toLowerCase();
  return ALL_COUNTRIES.find(
    (c) => c.nameEn.toLowerCase() === needle || c.nameAr === name.trim()
  );
}

/** The `Intl` locale tag for a UI locale in the given country. DATE/CLOCK
 * formatters read this instead of hardcoding a country's tag — it is what makes
 * the Arabic month vocabulary country-specific.
 *
 * The other half of the same rule (what numbers do instead) is `NUMBER_LOCALE`. */
export function intlLocale(locale: "en" | "ar", country: CountryConfig = DEFAULT_COUNTRY): string {
  return locale === "ar" ? country.intlLocale.ar : country.intlLocale.en;
}

/**
 * THE digit convention — every number the app formats itself renders in ASCII
 * ("Western") digits, in BOTH UI locales and for every country.
 *
 * There are exactly two families of numeric output, and they differ on purpose:
 *
 *   1. CALENDAR / CLOCK output — dates, times, weekday and month names — goes
 *      through `Intl.DateTimeFormat(intlLocale(locale))`, so it follows the
 *      country's locale and renders Arabic-Indic digits in Arabic:
 *      "١٣ أيلول ٢٠٢٦", "١١:٠٠ – ١٢:٠٠". (Pinned in tests/arabic-dates.test.ts.)
 *   2. EVERY OTHER number — money, counts, percentages, durations and the SLA
 *      countdown — is formatted against NUMBER_LOCALE: "$1,500", "2,480+",
 *      "98%", "47 س 42 د" sitting beside "١٣ أيلول".
 *      (Pinned in tests/number-digits.test.ts.)
 *
 * Why family 2 is fixed rather than locale-derived:
 *   • These numbers sit next to LTR-isolated symbols (currency codes, %, the
 *     س/د duration units) and are compared at a glance in data-dense rows,
 *     tables and dashboards. One digit system keeps a row internally consistent.
 *   • The seeded demo data, the printable/PDF audit documents and the CSV
 *     exports already carry ASCII digits, so the screens match the documents.
 *   • A locale-derived tag — or worse, a bare `toLocaleString()`, which uses the
 *     RUNTIME locale — makes the SAME number render two ways depending on the
 *     viewer's machine, and can even differ between the server render and the
 *     client. React reports that as a hydration mismatch, so the honest fix is
 *     to make the digits a constant.
 *
 * Consumers must not build their own number formatter: `formatNumber`,
 * `formatCompact`, `formatPrice`, `durationParts`/`fillDuration` and `timeAgo`
 * (all in `@/lib/utils`) read this constant, and the source guard in
 * tests/number-digits.test.ts fails the build when a component formats a
 * number itself.
 */
export const NUMBER_LOCALE = "en-US";

/** The speech-recognition locale tag for a UI locale in the given country. */
export function speechLocale(locale: "en" | "ar", country: CountryConfig = DEFAULT_COUNTRY): string {
  return locale === "ar" ? country.speechLocale.ar : country.speechLocale.en;
}

/** The E.164 dial prefix for a country, e.g. "+961". */
export function dialPrefix(country: CountryConfig = DEFAULT_COUNTRY): string {
  return `+${country.dialCode}`;
}

/** The country's transaction currency (defaults to the served country). */
export function currencyForCountry(country: CountryConfig = DEFAULT_COUNTRY): CurrencyCode {
  return country.currency;
}
