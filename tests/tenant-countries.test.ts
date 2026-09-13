import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALL_COUNTRIES,
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryByCode,
  countryByName,
  countryBySlug,
  currencyForCountry,
  dialPrefix,
  intlLocale,
  speechLocale,
} from "@/lib/tenant/countries";
import { CURRENCIES } from "@/lib/currency";
import {
  CITIES,
  TENANT_SLUG,
  citiesOfCountry,
  countryOfCity,
  countryOfCitySlug,
} from "@/lib/data/cities";
import { CITY_COORDINATES } from "@/lib/geolocation/geo-service";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The country registry (src/lib/tenant/countries.ts) is the single source of
 * truth for currency, locale, dial code, SEO region and geo centers. These
 * tests lock BOTH halves: the registry is complete and consistent with the
 * served data, and the rest of the app reads it instead of re-hardcoding
 * Lebanon (docs/MULTI-COUNTRY-AND-QUALITY-PLAN.md §2).
 */

describe("CountryConfig — registry contract", () => {
  it("configures at least one country and serves exactly one tenant", () => {
    expect(ALL_COUNTRIES.length).toBeGreaterThan(0);
    expect(DEFAULT_COUNTRY).toBe(COUNTRIES.lb);
  });

  it("every entry is complete and self-consistent", () => {
    for (const c of ALL_COUNTRIES) {
      expect(c.code, `${c.slug} code`).toMatch(/^[A-Z]{2}$/);
      expect(c.slug, `${c.slug} slug`).toMatch(/^[a-z]{2}$/);
      expect(c.nameEn.length, `${c.slug} nameEn`).toBeGreaterThan(0);
      expect(c.nameAr.length, `${c.slug} nameAr`).toBeGreaterThan(0);
      expect(c.dialCode, `${c.slug} dialCode`).toMatch(/^\d{1,4}$/);
      expect(c.timeZone.length, `${c.slug} timeZone`).toBeGreaterThan(0);
      expect(c.paymentMethods.length, `${c.slug} paymentMethods`).toBeGreaterThan(0);
      // The currency must exist in the currency module (one money vocabulary).
      expect(Object.keys(CURRENCIES), `${c.slug} currency`).toContain(c.currency);
      // Locales are required for BOTH UI languages.
      for (const tag of [c.intlLocale.en, c.intlLocale.ar, c.speechLocale.en, c.speechLocale.ar]) {
        expect(tag.length, `${c.slug} locale tag`).toBeGreaterThan(0);
      }
      // Keys must match slugs — the lookup helpers assume it.
      expect(COUNTRIES[c.slug]).toBe(c);
    }
  });

  it("serves Lebanon with the tenant's currency, dial code and SEO region", () => {
    expect(DEFAULT_COUNTRY.code).toBe("LB");
    expect(DEFAULT_COUNTRY.slug).toBe("lb");
    expect(DEFAULT_COUNTRY.dialCode).toBe("961");
    expect(DEFAULT_COUNTRY.currency).toBe("USD");
  });

  it("resolves by slug, code (case-insensitive) and localized name", () => {
    expect(countryBySlug("lb")).toBe(DEFAULT_COUNTRY);
    expect(countryBySlug("zz")).toBeUndefined();
    expect(countryByCode("LB")).toBe(DEFAULT_COUNTRY);
    expect(countryByCode("lb")).toBe(DEFAULT_COUNTRY);
    expect(countryByCode("ZZ")).toBeUndefined();
    expect(countryByName("Lebanon")).toBe(DEFAULT_COUNTRY);
    expect(countryByName("لبنان")).toBe(DEFAULT_COUNTRY);
    expect(countryByName("Nowhere")).toBeUndefined();
  });

  it("exposes currency, dial and locale helpers driven by the config", () => {
    expect(dialPrefix()).toBe("+961");
    expect(currencyForCountry()).toBe(DEFAULT_COUNTRY.currency);
    expect(intlLocale("en")).toBe("en-US");
    expect(intlLocale("ar")).toBe("ar-LB");
    expect(speechLocale("ar")).toBe("ar-LB");
    // A country's own currency is what it declares, not the served tenant's.
    expect(currencyForCountry(DEFAULT_COUNTRY)).toBe(DEFAULT_COUNTRY.currency);
    expect(currencyForCountry({ ...DEFAULT_COUNTRY, currency: "USD" })).toBe("USD");
  });
});

describe("CountryConfig — the served data agrees with the registry", () => {
  it("the city catalog composes its country facts from the config", () => {
    for (const city of CITIES) {
      const country = countryOfCity(city);
      expect(country, `city ${city.slug} resolves to a configured country`).toBeDefined();
      expect(city.countryEn).toBe(country!.nameEn);
      expect(city.countryAr).toBe(country!.nameAr);
      expect(city.currency).toBe(country!.currency);
    }
  });

  it("the tenant slug is the served country's slug", () => {
    expect(TENANT_SLUG).toBe(DEFAULT_COUNTRY.slug);
    expect(TENANT_SLUG).toBe(countryOfCitySlug("beirut")!.slug);
  });

  it("every configured city belongs to the served tenant", () => {
    expect(citiesOfCountry(TENANT_SLUG).map((c) => c.slug)).toEqual(CITIES.map((c) => c.slug));
    expect(citiesOfCountry("zz")).toEqual([]);
  });

  it("geo centers are DERIVED from the catalog (no second coordinate map)", () => {
    for (const city of CITIES) {
      expect(CITY_COORDINATES[city.slug]).toEqual({
        latitude: city.lat,
        longitude: city.lng,
      });
    }
    // No stale extras: the map's keys are exactly the catalog's cities.
    expect(Object.keys(CITY_COORDINATES).sort()).toEqual(CITIES.map((c) => c.slug).sort());
  });
});

/**
 * Files that legitimately hold a hardcoded country fact: the registry itself,
 * which owns the dial codes, Intl tags, SEO codes and city catalog. The demo
 * dataset no longer qualifies — its names/phones are GENERATED from those
 * configs (src/lib/data/worker-recipes.ts + workers.ts), so the guard now
 * covers them too.
 */
const ALLOWED = [path.join("src", "lib", "tenant")];

/**
 * Cities outside the served tenant. The app shipped with a Riyadh/Jeddah/Dubai/
 * Amman dataset, so this residue keeps reappearing in demo copy (homepage ads,
 * testimonials, the blog, the admin mocks) long after the tenant became Lebanon.
 * `Cairo` is exempted on the Google-Fonts line only — it is a font family there.
 */
const FOREIGN_CITIES =
  /\b(Riyadh|Jeddah|Dubai|Amman|Doha|Muscat|Manama|Kuwait|Alexandria|Cairo)\b|الرياض|جدة|دبي|عمّان|عمان|الدوحة|مسقط|المنامة|القاهرة|الإسكندرية/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

function findOffenders(pattern: RegExp, dirs: string[]): string[] {
  const offenders: string[] = [];
  for (const relDir of dirs) {
    for (const file of walk(path.join(ROOT, relDir))) {
      if (ALLOWED.some((a) => file.includes(a))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1} — ${line.trim()}`);
        });
    }
  }
  return offenders;
}

describe("country assumptions live in the registry, not the app", () => {
  it("no country-specific Intl tag is hardcoded outside the registry", () => {
    const offenders = findOffenders(/\b(ar-LB|ar-EG)\b/, ["src"]);
    expect(offenders, `Hardcoded Intl tags (read intlLocale()/speechLocale() instead):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no Lebanon dial code is hardcoded in the UI or route handlers", () => {
    const offenders = findOffenders(/\+961/, ["src/components", "src/app"]);
    expect(offenders, `Hardcoded dial codes (read dialPrefix() instead):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no SEO region is hardcoded to the served country's code", () => {
    const offenders = findOffenders(/addressCountry:\s*"LB"/, ["src"]);
    expect(offenders, `Hardcoded addressCountry (read CountryConfig.code instead):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no non-tenant city is named in shipping copy", () => {
    const offenders = findOffenders(FOREIGN_CITIES, ["src"]).filter(
      (line) => !line.includes("fonts.googleapis.com")
    );
    expect(
      offenders,
      `Foreign-city copy found (name the tenant's cities — CountryConfig.cities — instead):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
