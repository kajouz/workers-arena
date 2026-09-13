import type { City } from "./types";
import {
  DEFAULT_COUNTRY,
  countryByName,
  countryBySlug,
  type CountryConfig,
} from "@/lib/tenant/countries";

/**
 * The city catalog is PROJECTED from the country registry — a country owns its
 * cities (`CountryConfig.cities`), and this module shapes them into the `City`
 * rows the app and the seed consume. Country name and transaction currency come
 * from the enclosing config, so a city row can never drift from its country,
 * and a new country ships its cities by filling in its one registry entry.
 */

/** The `City` rows a country serves (defaults to the served tenant). */
export function citiesForCountry(country: CountryConfig = DEFAULT_COUNTRY): City[] {
  return country.cities.map((seed) => ({
    slug: seed.slug,
    nameEn: seed.nameEn,
    nameAr: seed.nameAr,
    countryEn: country.nameEn,
    countryAr: country.nameAr,
    currency: country.currency,
    lat: seed.lat,
    lng: seed.lng,
    areas: seed.areas.map((a) => ({ slug: a.slug, nameEn: a.nameEn, nameAr: a.nameAr })),
  }));
}

/** The cities of the served tenant (tenant lb). */
export const CITIES: City[] = citiesForCountry(DEFAULT_COUNTRY);

/** The served tenant slug (tenant lb — Lebanon). */
export const TENANT_SLUG: string = DEFAULT_COUNTRY.slug;

export const cityBySlug = (slug: string): City | undefined => CITIES.find((c) => c.slug === slug);

/** The country config a city belongs to — resolved from the city's country
 * name, so demo cities and prisma-loaded `City` rows both work without an ISO
 * column. Undefined for a city whose country isn't configured. */
export function countryOfCity(city: Pick<City, "countryEn"> | undefined): CountryConfig | undefined {
  return city ? countryByName(city.countryEn) : undefined;
}

/** The country config for a city slug (SEO region, currency, locales…). */
export function countryOfCitySlug(slug: string): CountryConfig | undefined {
  return countryOfCity(cityBySlug(slug));
}

/** Every city a configured country serves (empty for an unknown slug). */
export function citiesOfCountry(countrySlug: string): City[] {
  const country = countryBySlug(countrySlug);
  return country ? citiesForCountry(country) : [];
}
