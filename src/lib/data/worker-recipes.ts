import type { SubscriptionPlan, VerificationStatus } from "./types";

/**
 * The shared ROLE recipes the demo workforce is generated from — one per demo
 * worker, in a fixed order.
 *
 * Everything country-specific is deliberately absent: a recipe names the trade,
 * the pricing profile, the trust flags and the demo brand, while the COUNTRY
 * supplies the worker's name, city/area, phone and email TLD (see
 * `DemoWorkforceConfig` in src/lib/tenant/countries.ts). Recipe i pairs with
 * `country.demoWorkforce.names[i]` and takes a round-robin city/area from
 * `country.cities[i % areas]`, so a new country populates its own demo workers
 * by filling in the registry — the dataset is generated, never hand-edited.
 *
 * Deterministic: the builder seeds its PRNG from the worker's name, so the same
 * recipe + country always yields the same worker.
 */
export interface WorkerRecipe {
  /** Category slug (src/lib/data/categories.ts). */
  category: string;
  rating: number;
  reviewCount: number;
  yearsExp: number;
  /** Local price range in the country's transaction currency. */
  priceMin: number;
  priceMax: number;
  /** BCP-47-ish language codes from LANGUAGES (defaults to ar + en). */
  langCodes?: readonly string[];
  verified?: boolean;
  verification?: VerificationStatus;
  plan?: SubscriptionPlan;
  /** Days until the subscription expires (negative = already expired). */
  expiresInDays?: number;
  premium?: boolean;
  featured?: boolean;
  emergency?: boolean;
  available?: boolean;
  joinedYear: number;
  /**
   * §Instant booking — the worker sells a published fixed price without a
   * round-trip (src/lib/data/instant-book.ts). Opt-in per worker, because
   * nobody should be drafted into answering a job they never saw.
   */
  instantBook?: boolean;
  /** Index into the country's `phonePrefixes` (modulo its length). */
  phonePrefixIndex: number;
  /** National number tail, grouped for display (e.g. "123 456"). */
  phoneTail: string;
  /** Demo email/website brand root (e.g. "plumbfix"). */
  brand: string;
  /** TLD override for the brand domain (defaults to the country's `emailTld`). */
  tld?: string;
  /** Override the email local part (defaults to the first name, lowercased). */
  emailLocal?: string;
  /** Whether the demo worker also gets a website on its brand domain. */
  website?: boolean;
}

export const WORKER_RECIPES: readonly WorkerRecipe[] = [
  { category: "plumbing", rating: 4.9, reviewCount: 132, yearsExp: 12, verification: "rejected", premium: true, featured: true, emergency: true, joinedYear: 2019, priceMin: 35, priceMax: 280, langCodes: ["ar", "en"], phonePrefixIndex: 0, phoneTail: "123 456", brand: "plumbfix", website: true },
  { category: "electrical", instantBook: true, rating: 4.8, reviewCount: 98, yearsExp: 15, verified: true, premium: true, joinedYear: 2016, priceMin: 30, priceMax: 220, langCodes: ["ar", "en"], phonePrefixIndex: 1, phoneTail: "456 789", brand: "volt-lb", tld: "com", website: true },
  { category: "carpentry", instantBook: true, rating: 4.7, reviewCount: 76, yearsExp: 10, verified: true, featured: true, joinedYear: 2018, priceMin: 60, priceMax: 320, langCodes: ["ar", "en", "fr"], phonePrefixIndex: 0, phoneTail: "778 219", brand: "woodcraft", website: true },
  { category: "painting", rating: 4.6, reviewCount: 54, yearsExp: 8, verified: true, joinedYear: 2019, priceMin: 80, priceMax: 350, langCodes: ["ar", "fr"], phonePrefixIndex: 3, phoneTail: "661 224", brand: "peinture", emailLocal: "y.benali" },
  { category: "masonry", rating: 4.5, reviewCount: 61, yearsExp: 20, verified: true, joinedYear: 2014, priceMin: 90, priceMax: 480, langCodes: ["ar"], phonePrefixIndex: 2, phoneTail: "933 441", brand: "built-lb", tld: "com" },
  { category: "ac-technician", instantBook: true, rating: 4.9, reviewCount: 210, yearsExp: 9, verified: true, premium: true, featured: true, emergency: true, available: true, joinedYear: 2020, priceMin: 40, priceMax: 180, langCodes: ["ar", "en"], phonePrefixIndex: 1, phoneTail: "330 812", brand: "coolair", website: true },
  { category: "satellite-technician", rating: 4.7, reviewCount: 45, yearsExp: 7, verified: true, joinedYear: 2021, priceMin: 35, priceMax: 120, langCodes: ["ar", "en", "fr"], phonePrefixIndex: 2, phoneTail: "441 887", brand: "signaltv" },
  { category: "mechanic", rating: 4.8, reviewCount: 88, yearsExp: 14, verified: true, premium: true, joinedYear: 2017, priceMin: 25, priceMax: 250, langCodes: ["ar", "en"], phonePrefixIndex: 1, phoneTail: "556 120", brand: "autocare", website: true },
  { category: "welding", rating: 4.6, reviewCount: 39, yearsExp: 11, verified: true, joinedYear: 2019, priceMin: 70, priceMax: 300, langCodes: ["ar", "en"], phonePrefixIndex: 0, phoneTail: "778 992", brand: "steelpro" },
  { category: "blacksmith", rating: 4.5, reviewCount: 33, yearsExp: 18, verified: true, joinedYear: 2015, priceMin: 70, priceMax: 320, langCodes: ["ar"], phonePrefixIndex: 0, phoneTail: "664 229", brand: "ironworks-lb", tld: "com" },
  { category: "roofing", rating: 4.4, reviewCount: 27, yearsExp: 13, verification: "pending", plan: "basic", expiresInDays: -6, joinedYear: 2018, priceMin: 80, priceMax: 500, langCodes: ["ar"], phonePrefixIndex: 0, phoneTail: "219 334", brand: "roofshield" },
  { category: "cleaning", instantBook: true, rating: 4.9, reviewCount: 156, yearsExp: 6, verified: true, premium: true, featured: true, available: true, plan: "enterprise", joinedYear: 2021, priceMin: 40, priceMax: 180, langCodes: ["ar", "en"], phonePrefixIndex: 1, phoneTail: "902 113", brand: "sparkle", website: true },
  { category: "movers", rating: 4.7, reviewCount: 71, yearsExp: 9, verified: true, plan: "professional", expiresInDays: 7, joinedYear: 2019, priceMin: 60, priceMax: 300, langCodes: ["ar", "en"], phonePrefixIndex: 2, phoneTail: "660 771", brand: "moveit" },
  { category: "gardening", rating: 4.6, reviewCount: 42, yearsExp: 12, verified: true, plan: "basic", expiresInDays: 3, joinedYear: 2017, priceMin: 40, priceMax: 200, langCodes: ["ar", "en"], phonePrefixIndex: 4, phoneTail: "445 668", brand: "gardenia" },
  { category: "pest-control", rating: 4.8, reviewCount: 63, yearsExp: 8, verified: true, emergency: true, joinedYear: 2020, priceMin: 35, priceMax: 150, langCodes: ["ar", "en"], phonePrefixIndex: 1, phoneTail: "991 304", brand: "guardian" },
  { category: "locksmith", rating: 4.7, reviewCount: 58, yearsExp: 10, verified: true, emergency: true, available: true, joinedYear: 2018, priceMin: 25, priceMax: 120, langCodes: ["ar", "en"], phonePrefixIndex: 0, phoneTail: "447 906", brand: "keymaster" },
  { category: "glass-works", rating: 4.5, reviewCount: 36, yearsExp: 9, verification: "rejected", plan: "basic", joinedYear: 2020, priceMin: 50, priceMax: 220, langCodes: ["ar", "fr"], phonePrefixIndex: 0, phoneTail: "882 014", brand: "vitrage" },
  { category: "aluminum-works", rating: 4.6, reviewCount: 47, yearsExp: 15, verified: true, joinedYear: 2016, priceMin: 80, priceMax: 350, langCodes: ["ar", "fr"], phonePrefixIndex: 0, phoneTail: "645 772", brand: "alucasa", website: true },
];
