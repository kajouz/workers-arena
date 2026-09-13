import { describe, expect, it } from "vitest";

import { CATEGORIES } from "@/lib/data/categories";
import { CITIES, citiesForCountry } from "@/lib/data/cities";
import { WORKERS, buildWorkforce, workersForCountry } from "@/lib/data/workers";
import { WORKER_RECIPES } from "@/lib/data/worker-recipes";
import {
  ALL_COUNTRIES,
  DEFAULT_COUNTRY,
  dialPrefix,
  type CountryConfig,
} from "@/lib/tenant/countries";

/**
 * The seed is country-parameterized: cities come from `CountryConfig.cities`
 * and the demo workforce is GENERATED from the shared role recipes
 * (src/lib/data/worker-recipes.ts) + a country's `demoWorkforce` metadata.
 *
 * These tests lock the contract that makes that true — so a new CountryConfig
 * can populate its own cities and demo workers with nothing to hand-edit — and
 * pin the served tenant's dataset so the generated output never silently drifts
 * away from the demo data the rest of the suite (and the app) depends on.
 */

/** Distinct, slug-safe first names — one per recipe (see `demoWorkforce.names`). */
const GREEK_NAMES = [
  "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta",
  "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu",
  "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma",
];

/** A fictional second country — proof that adding one needs no dataset edits. */
const SYNTHETIC: CountryConfig = {
  code: "ZZ",
  slug: "zz",
  nameEn: "Testland",
  nameAr: "أرض الاختبار",
  dialCode: "999",
  currency: "USD",
  intlLocale: { en: "en-ZZ", ar: "ar-ZZ" },
  speechLocale: { en: "en-ZZ", ar: "ar-ZZ" },
  timeZone: "UTC",
  paymentMethods: ["simulated"],
  cities: [
    {
      slug: "alphaville",
      nameEn: "Alphaville",
      nameAr: "ألفافيل",
      lat: 10.5,
      lng: 20.25,
      areas: [
        { slug: "north", nameEn: "North", nameAr: "الشمال" },
        { slug: "south", nameEn: "South", nameAr: "الجنوب" },
        { slug: "docks", nameEn: "Docks", nameAr: "الميناء" },
      ],
    },
    {
      slug: "betatown",
      nameEn: "Betatown",
      nameAr: "بيتاتاون",
      lat: -5.5,
      lng: 12.75,
      areas: [
        { slug: "old-quarter", nameEn: "Old Quarter", nameAr: "الحي القديم" },
        { slug: "harbour", nameEn: "Harbour", nameAr: "المرسى" },
      ],
    },
  ],
  demoWorkforce: {
    // One distinct first name per recipe keeps the generated ids unique.
    names: GREEK_NAMES.map((name) => ({ en: `${name} Tester`, ar: `عامل ${name}` })),
    phonePrefixes: ["55"],
    emailTld: "example",
  },
};

describe("CountryConfig — the demo-workforce contract", () => {
  it("every configured country can populate its own cities and workers", () => {
    for (const country of ALL_COUNTRIES) {
      expect(country.cities.length, `${country.slug} cities`).toBeGreaterThan(0);
      for (const city of country.cities) {
        expect(city.areas.length, `${country.slug}/${city.slug} areas`).toBeGreaterThan(0);
        expect(Number.isFinite(city.lat) && Number.isFinite(city.lng)).toBe(true);
      }
      // One name per recipe — the builder pairs them by index.
      expect(
        country.demoWorkforce.names.length,
        `${country.slug} demo names vs recipes`
      ).toBeGreaterThanOrEqual(WORKER_RECIPES.length);
      expect(country.demoWorkforce.phonePrefixes.length, `${country.slug} phonePrefixes`).toBeGreaterThan(0);
      expect(country.demoWorkforce.emailTld, `${country.slug} emailTld`).toMatch(/^[a-z]{2,}$/);
    }
  });

  it("city slugs are unique across the whole registry", () => {
    const slugs = ALL_COUNTRIES.flatMap((c) => c.cities.map((city) => city.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every shared recipe targets a real category and a real phone prefix", () => {
    for (const [i, recipe] of WORKER_RECIPES.entries()) {
      expect(CATEGORIES.map((c) => c.slug), `recipe ${i} category`).toContain(recipe.category);
      expect(recipe.brand.length, `recipe ${i} brand`).toBeGreaterThan(0);
      expect(recipe.phoneTail, `recipe ${i} phoneTail`).toMatch(/^\d{3} \d{3}$/);
      for (const country of ALL_COUNTRIES) {
        const prefixes = country.demoWorkforce.phonePrefixes;
        expect(prefixes[recipe.phonePrefixIndex % prefixes.length]).toBeDefined();
      }
    }
  });
});

describe("the demo workforce is generated per country", () => {
  it("generates exactly one worker per recipe, deterministically", () => {
    const a = buildWorkforce(SYNTHETIC);
    const b = buildWorkforce(SYNTHETIC);
    expect(a).toHaveLength(WORKER_RECIPES.length);
    const stable = (w: (typeof a)[number]) => ({
      slug: w.slug,
      phone: w.phone,
      email: w.email,
      website: w.website,
      citySlug: w.citySlug,
      areaSlug: w.areaSlug,
      lat: w.lat,
      hue: w.hue,
    });
    expect(a.map(stable)).toEqual(b.map(stable));
  });

  it("every generated worker stays inside its own country", () => {
    for (const country of ALL_COUNTRIES) {
      const workers = workersForCountry(country);
      const catalog = citiesForCountry(country);
      expect(workers, `${country.slug} workforce size`).toHaveLength(WORKER_RECIPES.length);
      for (const w of workers) {
        const city = catalog.find((c) => c.slug === w.citySlug);
        expect(city, `${w.slug} city ${w.citySlug} belongs to ${country.slug}`).toBeDefined();
        expect(
          city!.areas.map((a) => a.slug),
          `${w.slug} area ${w.areaSlug} belongs to ${w.citySlug}`
        ).toContain(w.areaSlug);
        // Country-scoped facts, all read from the config rather than hardcoded.
        expect(w.phone, `${w.slug} phone`).toMatch(new RegExp(`^\\${dialPrefix(country)} `));
        expect(w.whatsapp, `${w.slug} whatsapp`).toBe(w.phone.replace(/[^\d]/g, ""));
        expect(w.currency, `${w.slug} currency`).toBe(country.currency);
        // Brand domain under the country's TLD (a recipe may override the TLD).
        expect(w.email, `${w.slug} email`).toMatch(/@[a-z0-9-]+\.[a-z]{2,}$/);
      }
    }
  });

  it("ids, slugs, phones and emails are unique within a country", () => {
    for (const country of ALL_COUNTRIES) {
      const workers = workersForCountry(country);
      for (const key of ["id", "slug", "phone", "email"] as const) {
        const values = workers.map((w) => w[key]);
        expect(new Set(values).size, `${country.slug} duplicate ${key}`).toBe(values.length);
      }
    }
  });
});

describe("a new CountryConfig populates its own cities and demo workers", () => {
  const workers = workersForCountry(SYNTHETIC);

  it("projects the config's cities into the catalog", () => {
    expect(citiesForCountry(SYNTHETIC).map((c) => c.slug)).toEqual(["alphaville", "betatown"]);
    expect(citiesForCountry(SYNTHETIC).map((c) => c.countryEn)).toEqual(["Testland", "Testland"]);
    expect(citiesForCountry(SYNTHETIC)[0]!.areas.map((a) => a.slug)).toEqual([
      "north",
      "south",
      "docks",
    ]);
  });

  it("generates that country's workers with its own names, dial code and TLD", () => {
    expect(workers).toHaveLength(WORKER_RECIPES.length);
    expect(workers[0]!.nameEn).toBe("Alpha Tester");
    expect(workers[0]!.slug).toBe("alpha-tester-plumbing");
    expect(workers[0]!.phone).toBe("+999 55 123 456");
    expect(workers[0]!.email).toBe("alpha@plumbfix.example");
    expect(workers[0]!.citySlug).toBe("alphaville");
    // Spots round-robin over the config's cities/areas (3 + 2 = 5).
    expect([workers[3]!.citySlug, workers[3]!.areaSlug]).toEqual(["betatown", "old-quarter"]);
    expect([workers[4]!.citySlug, workers[4]!.areaSlug]).toEqual(["betatown", "harbour"]);
    expect([workers[5]!.citySlug, workers[5]!.areaSlug]).toEqual(["alphaville", "north"]);
  });

  it("shares no worker with the served tenant", () => {
    const overlap = workers.filter((w) => WORKERS.some((lw) => lw.slug === w.slug));
    expect(overlap).toEqual([]);
  });
});

describe("the served tenant's generated dataset is stable", () => {
  it("the demo singleton IS the served country's workforce", () => {
    expect(workersForCountry(DEFAULT_COUNTRY)).toBe(WORKERS);
    expect(WORKERS).toHaveLength(WORKER_RECIPES.length);
    expect(citiesForCountry(DEFAULT_COUNTRY)).toEqual(CITIES);
  });

  it("keeps the demo worker slugs the rest of the suite depends on", () => {
    const required = [
      "khaled-al-harbi-plumbing",
      "jad-el-khoury-electrical",
      "ali-hassan-carpentry",
      "ahmad-nassar-masonry",
      "omar-al-mutairi-ac-technician",
      "tarek-chammas-roofing",
      "bilal-mansour-cleaning",
      "sami-haddad-locksmith",
    ];
    const slugs = WORKERS.map((w) => w.slug);
    for (const slug of required) expect(slugs, `missing demo worker ${slug}`).toContain(slug);
  });

  it("pins the demo worker's generated contact details", () => {
    const khaled = WORKERS[0]!;
    expect(khaled.slug).toBe("khaled-al-harbi-plumbing");
    expect(khaled.phone).toBe("+961 70 123 456");
    expect(khaled.whatsapp).toBe("96170123456"); // digits only, like the demo store's
    expect(khaled.email).toBe("khaled@plumbfix.lb");
    expect(khaled.website).toBe("plumbfix.lb");
    expect(khaled.citySlug).toBe("beirut");
    expect(khaled.areaSlug).toBe("achrafieh");
    expect(khaled.currency).toBe("USD");
  });

  it("derives the brand TLD override from the recipe, not the country", () => {
    // volt-lb / built-lb / ironworks-lb keep their own .com domain.
    expect(WORKERS[1]!.email).toBe("jad@volt-lb.com");
    expect(WORKERS[4]!.email).toBe("ahmad@built-lb.com");
    expect(WORKERS[9]!.email).toBe("ibrahim@ironworks-lb.com");
    // A recipe without a website gets none, even on a brand with a domain.
    expect(WORKERS[6]!.website).toBeUndefined();
  });
});
