import { CATEGORIES, categoryBySlug } from "./categories";
import { citiesForCountry } from "./cities";
import { WORKER_RECIPES, type WorkerRecipe } from "./worker-recipes";
import {
  AUTHOR_NAMES,
  CATEGORY_TEMPLATES,
  LANGUAGES,
  QUALITY_AR,
  QUALITY_EN,
  REVIEWS_3_AR,
  REVIEWS_3_EN,
  REVIEWS_4_AR,
  REVIEWS_4_EN,
  REVIEWS_5_AR,
  REVIEWS_5_EN,
} from "./templates";
import type { Area, City, Review, SubscriptionPlan, VerificationStatus, Worker } from "./types";
import { PLANS } from "./subscriptions";
import { DEFAULT_COUNTRY, type CountryConfig } from "@/lib/tenant/countries";

/** Deterministic PRNG so the demo dataset is stable across reloads. */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 24 * 60 * 60 * 1000;

/** Where a generated worker sits — a round-robin spot in its country's catalog. */
interface WorkforceSpot {
  city: City;
  area: Area;
}

function buildReviews(reviewCount: number, seed: string): Review[] {
  const rnd = mulberry32(hashSeed(seed + "-reviews"));
  const count = Math.max(3, Math.min(6, Math.round(reviewCount / 22)));
  const reviews: Review[] = [];
  const pools5 = [REVIEWS_5_EN, REVIEWS_5_AR];
  const pools4 = [REVIEWS_4_EN, REVIEWS_4_AR];
  const pools3 = [REVIEWS_3_EN, REVIEWS_3_AR];
  for (let i = 0; i < count; i++) {
    const rating = rnd() < 0.78 ? 5 : rnd() < 0.55 ? 4 : 3;
    const pool = rating >= 5 ? pools5 : rating === 4 ? pools4 : pools3;
    const idx = Math.floor(rnd() * pool[0].length);
    const daysAgo = Math.floor(rnd() * 190) + 2;
    reviews.push({
      id: `${seed.split("-")[0]}-r${i}`,
      author: AUTHOR_NAMES[Math.floor(rnd() * AUTHOR_NAMES.length)],
      rating,
      date: new Date(Date.now() - daysAgo * DAYS).toISOString(),
      textEn: pool[0][idx],
      textAr: pool[1][idx],
      verifiedPurchase: rnd() > 0.25,
    });
  }
  return reviews.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Build ONE demo worker: a shared role RECIPE + a country's name pool + a
 * round-robin spot in that country's city catalog.
 *
 * Country-scoped facts all come from `country`: the phone number is
 * `dialCode` + one of its mobile prefixes, the email/website domain is the
 * recipe's brand under the country's TLD, and the worker's currency + city
 * follow its catalog.
 */
function buildWorker(recipe: WorkerRecipe, name: { en: string; ar: string }, spot: WorkforceSpot, country: CountryConfig): Worker {
  const cat = categoryBySlug(recipe.category)!;
  const { city, area } = spot;
  const template = CATEGORY_TEMPLATES[recipe.category]!;
  const rnd = mulberry32(hashSeed(name.en));
  const id = name.en.split(" ")[0]!.toLowerCase() + "-" + recipe.category.slice(0, 4);
  const slug = `${name.en.toLowerCase().replace(/[^a-z]+/g, "-")}-${recipe.category}`;
  const specialtyIdx = Math.floor(rnd() * template.specialtyEn.length);
  const qualityIdx = Math.floor(rnd() * QUALITY_EN.length);

  // Country-derived contact details — a new country needs no dataset edits.
  const prefixes = country.demoWorkforce.phonePrefixes;
  if (prefixes.length === 0) {
    throw new Error(`Country "${country.slug}" has no demoWorkforce.phonePrefixes`);
  }
  const prefix = prefixes[recipe.phonePrefixIndex % prefixes.length]!;
  const phone = `+${country.dialCode} ${prefix} ${recipe.phoneTail}`;
  const domain = `${recipe.brand}.${recipe.tld ?? country.demoWorkforce.emailTld}`;
  const emailLocal = recipe.emailLocal ?? name.en.split(" ")[0]!.toLowerCase();

  // §Instant booking — a worker who opted in publishes their first per-job
  // service as a FIXED-PRICE package, which is what makes "book it now"
  // possible at all (src/lib/data/instant-book.ts). Derived from the flag and
  // the template, so it consumes no extra PRNG draws and cannot shift the
  // generated values the rest of this builder derives.
  const instantBook = recipe.instantBook ?? false;
  const services = template.services.map(([nEn, nAr, price, unit], index) => ({
    nameEn: nEn,
    nameAr: nAr,
    price: Math.round(price * (0.85 + rnd() * 0.5)),
    unit,
    fixedPrice: instantBook && index === 0 && unit === "job",
  }));

  const certifications = [
    { nameEn: `${cat.nameEn} Professional License`, nameAr: `رخصة ${cat.nameAr} مهنية`, issuerEn: "National Trades Board", issuerAr: "الهيئة الوطنية للمهن", year: recipe.joinedYear + 1 },
    { nameEn: "Safety & First Aid Certified", nameAr: "شهادة سلامة وإسعافات أولية", issuerEn: "Safety Institute", issuerAr: "معهد السلامة", year: recipe.joinedYear + 2 },
  ];

  const hours = [
    { day: 0, open: "08:00", close: "18:00" },
    { day: 1, open: "08:00", close: "18:00" },
    { day: 2, open: "08:00", close: "18:00" },
    { day: 3, open: "08:00", close: "18:00" },
    { day: 4, open: "08:00", close: "18:00" },
    { day: 5, open: "09:00", close: "14:00" },
    { day: 6, open: "00:00", close: "00:00", closed: true },
  ];
  if (recipe.emergency) hours[6] = { day: 6, open: "00:00", close: "00:00", closed: false };

  const gallery = template.portfolioEn.map((tEn, i) => ({
    titleEn: tEn,
    titleAr: template.portfolioAr[i] ?? tEn,
    hue: (cat.hue + i * 37 + Math.floor(rnd() * 30)) % 360,
  }));

  const langCodes = recipe.langCodes ?? ["ar", "en"];
  const languages = LANGUAGES.filter((l) => langCodes.includes(l.code));

  const lat = city.lat + (rnd() - 0.5) * 0.06;
  const lng = city.lng + (rnd() - 0.5) * 0.06;

  const reviews = buildReviews(recipe.reviewCount, slug);

  const verification: VerificationStatus =
    recipe.verification ?? (recipe.verified ? "verified" : "pending");
  const plan: SubscriptionPlan =
    recipe.plan ?? (recipe.premium ? "premium" : recipe.verified ? "professional" : "basic");
  const expiresInDays = recipe.expiresInDays ?? 14 + Math.floor(rnd() * 26);
  // Prices ride the canonical plan catalog (subscriptions.ts) — NOT a local
  // copy. A stale local map here desyncs the DB seed from the engine: the seed
  // persists PLANS prices, while changeWorkerPlan prices from the catalog, and
  // the data smoke asserts the two agree.
  const planPrices: Record<SubscriptionPlan, number> = {
    basic: PLANS.basic.price,
    professional: PLANS.professional.price,
    premium: PLANS.premium.price,
    enterprise: PLANS.enterprise.price,
  };

  return {
    id,
    slug,
    nameEn: name.en,
    nameAr: name.ar,
    categorySlug: recipe.category,
    citySlug: city.slug,
    areaSlug: area.slug,
    taglineEn: `${cat.nameEn} specialist · ${recipe.yearsExp} years of experience`,
    taglineAr: `${cat.professionAr} · خبرة ${recipe.yearsExp} سنة`,
    bioEn: `I'm ${name.en}, a ${cat.professionEn} with ${recipe.yearsExp} years of hands-on experience serving ${city.nameEn} (${area.nameEn}) and nearby areas. ${template.specialtyEn[specialtyIdx]}. ${QUALITY_EN[qualityIdx]}. Every project is delivered on time, on budget — guaranteed.`,
    bioAr: `أنا ${name.ar}، ${cat.professionAr} بخبرة ${recipe.yearsExp} سنة أخدم ${city.nameAr} (${area.nameAr}) والمناطق المجاورة. ${template.specialtyAr[specialtyIdx]}. ${QUALITY_AR[qualityIdx]}. كل مشروع يُسلَّم في وقته وضمن ميزانيته — مضمون.`,
    rating: recipe.rating,
    reviewCount: recipe.reviewCount,
    yearsExp: recipe.yearsExp,
    verified: verification === "verified",
    verification,
    premium: recipe.premium ?? false,
    featured: recipe.featured ?? false,
    emergency: recipe.emergency ?? false,
    instantBook,
    available: recipe.available ?? true,
    subscription: {
      plan,
      status: expiresInDays < 0 ? "expired" : expiresInDays <= 7 ? "expiring" : "active",
      startedAt: new Date(Date.now() - (365 - expiresInDays) * DAYS).toISOString(),
      expiresAt: new Date(Date.now() + expiresInDays * DAYS).toISOString(),
      price: planPrices[plan],
      invoiceNo: `INV-${9000 + Math.floor(rnd() * 900)}`,
    },
    priceMin: recipe.priceMin,
    priceMax: recipe.priceMax,
    currency: city.currency,
    phone,
    whatsapp: phone.replace(/[^\d]/g, ""),
    email: `${emailLocal}@${domain}`,
    website: recipe.website ? domain : undefined,
    socials: [
      { platform: "instagram", url: `https://instagram.com/${slug}` },
      { platform: "facebook", url: `https://facebook.com/${slug}` },
      { platform: "tiktok", url: `https://tiktok.com/@${slug}` },
    ],
    languages,
    services,
    certifications,
    hours,
    gallery,
    reviews,
    joinedYear: recipe.joinedYear,
    views: 900 + Math.round(recipe.reviewCount * 34 + recipe.rating * 400 + rnd() * 3000),
    leads: Math.round(recipe.reviewCount * 1.7),
    completion: 68 + Math.floor(rnd() * 30),
    hue: hashSeed(slug) % 360,
    lat,
    lng,
  };
}

/**
 * Generate a country's whole demo workforce: every shared recipe paired with
 * that country's name pool, assigned round-robin across its cities/areas.
 *
 * Deterministic — the same country always yields the same 18 workers, so the
 * seed, the demo store and every test agree without a hand-written dataset.
 */
export function buildWorkforce(country: CountryConfig = DEFAULT_COUNTRY): Worker[] {
  const cities = citiesForCountry(country);
  const names = country.demoWorkforce.names;
  if (names.length < WORKER_RECIPES.length) {
    throw new Error(
      `Country "${country.slug}" declares ${names.length} demo names for ${WORKER_RECIPES.length} worker recipes`
    );
  }
  const spots: WorkforceSpot[] = cities.flatMap((city) =>
    city.areas.map((area) => ({ city, area }))
  );
  if (spots.length === 0) {
    throw new Error(`Country "${country.slug}" declares no city areas to place demo workers in`);
  }
  return WORKER_RECIPES.map((recipe, i) =>
    buildWorker(recipe, names[i]!, spots[i % spots.length]!, country)
  );
}

/**
 * The complete demo workforce — stable across requests (generated once).
 *
 * SHARED across module instances via globalThis (the same singleton pattern
 * the bookings + notifications demo stores use): Turbopack dev gives server
 * actions, pages and route handlers SEPARATE module registries, so a plain
 * module-level array would be duplicated per graph — a worker-side resubmit /
 * renewal / plan change mutating one instance would never reflect on pages
 * reading another. Keyed on globalThis, every graph reads and writes the one
 * array (a fresh process starts fresh; HMR keeps the existing state).
 */
const WORKERS_KEY = "__workersArenaDemoWorkers";
const g = globalThis as Record<string, unknown>;
export const WORKERS: Worker[] =
  (g[WORKERS_KEY] as Worker[] | undefined) ??
  (g[WORKERS_KEY] = buildWorkforce(DEFAULT_COUNTRY));

/**
 * A country's demo workforce. The served tenant reads the shared (mutable)
 * demo singleton; any other configured country gets a freshly generated set —
 * which is all the seed needs to populate its own cities and workers.
 */
export function workersForCountry(country: CountryConfig = DEFAULT_COUNTRY): Worker[] {
  return country.slug === DEFAULT_COUNTRY.slug ? WORKERS : buildWorkforce(country);
}

export const workerBySlug = (slug: string): Worker | undefined =>
  WORKERS.find((w) => w.slug === slug);

export const workerById = (id: string): Worker | undefined => WORKERS.find((w) => w.id === id);

/**
 * §Instant booking — the demo worker's opt-in to selling fixed prices outright.
 * The demo workforce is the live catalog and other demo mutations assign onto
 * those objects in place, so the flag round-trips exactly like the prisma
 * column does.
 */
export function demoSetWorkerInstantBook(workerId: string, enabled: boolean): Worker | null {
  const worker = workerById(workerId);
  if (!worker) return null;
  worker.instantBook = Boolean(enabled);
  return worker;
}

/**
 * §Instant booking — publish (or withdraw) a fixed-price package on one of the
 * demo worker's existing services. Mutated in place for the same reason as the
 * opt-in above: the demo catalog IS the live data.
 */
export function demoSetWorkerServicePackage(
  workerId: string,
  nameEn: string,
  price: number,
  fixedPrice: boolean
): Worker | null {
  const worker = workerById(workerId);
  if (!worker) return null;
  const service = worker.services.find((s) => s.nameEn === nameEn);
  if (!service) return null;
  if (fixedPrice) service.price = price;
  service.fixedPrice = Boolean(fixedPrice);
  return worker;
}

/** Workers with their category count computed. */
export function categoriesWithCounts(): typeof CATEGORIES {
  return CATEGORIES.map((c) => ({
    ...c,
    workerCount: WORKERS.filter((w) => w.categorySlug === c.slug).length,
  }));
}
