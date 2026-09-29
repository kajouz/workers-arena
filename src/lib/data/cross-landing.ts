/**
 * ────────────────────────────────────────────────────────────────────────────
 * TRADE × CITY LANDING PAGES — the long tail, generated and kept honest
 * ────────────────────────────────────────────────────────────────────────────
 * The catalogue gives us 21 trades and every city/area we serve, so the
 * search-shaped queries people actually type ("plumber in Beirut", "سباك في
 * بيروت") are a matrix, not a page: /trades/plumbing/beirut. Hand-writing that
 * copy per pair does not survive a catalogue change — the trade hub already
 * carries a `TRADE_DESCRIPTIONS` table that silently falls back for any trade it
 * does not list, which is the failure mode this avoids.
 *
 * So the copy is DERIVED from the catalogue (names, profession, tagline, city,
 * country) in both languages, and the honesty rules are decisions rather than
 * prose:
 *
 *   • A pair with no supply is not indexed. A landing page whose content is
 *     "no workers here yet" is thin content that ranks for nothing and teaches a
 *     crawler this site pads pages — the same reason the price benchmarks report
 *     nothing below five samples.
 *   • The supply count in the copy is the real one, so "3 verified plumbers"
 *     can never be a stale marketing number.
 *   • Supply is judged at RENDER time (the count comes from the same live read
 *     the page lists), so the verdict flips as supply changes — not at build.
 *
 * Pure and injectable: no repo, no clock, no locale state. The page owns the
 * data reads, this owns the words and the indexability rule.
 */

import type { Area, Category, City } from "./types";
import { GUARANTEE_TERMS } from "./guarantee-terms";

/** The languages the landing pages are written in. */
export type LandingLocale = "en" | "ar";

/**
 * How much supply a pair needs before it is worth a search engine's attention.
 *
 * One worker is a real answer to "plumber in Beirut" — the visitor can book
 * someone — so the floor is 1 rather than a benchmark-style 5. The floor is a
 * named constant because it is a policy decision, not a detail: raising it makes
 * the sitemap smaller and the indexed set more competitive.
 */
export const MIN_INDEXABLE_SUPPLY = 1;

/** Why a pair is or is not offered to crawlers. */
export type IndexVerdictReason = "served" | "no-supply";

export interface IndexVerdict {
  indexable: boolean;
  reason: IndexVerdictReason;
}

/**
 * Should this pair be indexed, given the supply we just read?
 *
 * `follow: true` always: the page still links to the trade hub, the city hub and
 * the search — a crawler that reaches an unserved pair should keep walking, it
 * just should not treat this page as an answer.
 */
export function indexVerdict(supply: number): IndexVerdict {
  const count = Number.isFinite(supply) ? Math.max(0, Math.floor(supply)) : 0;
  return count >= MIN_INDEXABLE_SUPPLY
    ? { indexable: true, reason: "served" }
    : { indexable: false, reason: "no-supply" };
}

/**
 * The canonical path for a pair, or for a trade × area triple when `areaSlug`
 * is given (locale-prefixed, no trailing slash).
 */
export function crossLandingPath(
  locale: LandingLocale,
  categorySlug: string,
  citySlug: string,
  areaSlug?: string
): string {
  return `/${locale}/trades/${categorySlug}/${citySlug}${areaSlug ? `/${areaSlug}` : ""}`;
}

/** What a city says about itself in each language, without a repo read. */
export interface CrossLandingInput {
  category: Pick<Category, "slug" | "nameEn" | "nameAr" | "professionEn" | "professionAr" | "taglineEn" | "taglineAr">;
  city: Pick<City, "slug" | "nameEn" | "nameAr">;
  /**
   * Narrows the page to one area of the city ("plumber in Achrafieh") — the
   * query people type for the neighbourhood rather than the city. The copy
   * names the area and keeps the city as context.
   */
  area?: Pick<Area, "slug" | "nameEn" | "nameAr">;
  country: { nameEn: string; nameAr: string };
  /** The count the page is about to render — see indexVerdict. */
  supply: number;
  locale: LandingLocale;
}

export interface CrossLandingCopy {
  /**
   * `<title>` — the query, not the brand. Deliberately brand-free: the app's
   * metadata template already appends "· WorkersArena", and a title that carries
   * its own suffix renders the brand twice.
   */
  title: string;
  /** `<meta name="description">`. */
  description: string;
  /** The page `<h1>`: the same query in page-title case. */
  heading: string;
  /** One honest paragraph under the heading, naming the real supply count. */
  intro: string;
  /** What a customer can expect to pay / how the job runs — trade-level, city-flavoured. */
  faq: { q: string; a: string }[];
  /** Heading for the "we serve these areas too" block. */
  areasHeading: string;
  /** Heading for the worker list (differs when there is nothing to list). */
  workersHeading: string;
}

/** "3 plumbers" / "3 سباكون" — the subject of the page, pluralised. */
function subject(category: CrossLandingInput["category"], locale: LandingLocale): string {
  return locale === "ar" ? category.professionAr : category.professionEn;
}

/** The place the page is about: the area when there is one, else the city. */
function placeName(input: Pick<CrossLandingInput, "city" | "area">, locale: LandingLocale): string {
  const place = input.area ?? input.city;
  return locale === "ar" ? place.nameAr : place.nameEn;
}

/** "Achrafieh, Beirut, Lebanon" / "Beirut, Lebanon" — the full address line. */
function placeLine(input: Pick<CrossLandingInput, "city" | "area" | "country">, locale: LandingLocale): string {
  const parts =
    locale === "ar"
      ? [input.area?.nameAr, input.city.nameAr, input.country.nameAr]
      : [input.area?.nameEn, input.city.nameEn, input.country.nameEn];
  return parts.filter(Boolean).join(locale === "ar" ? "، " : ", ");
}

function countPhrase(input: CrossLandingInput): string {
  const { category, supply, locale } = input;
  const city = { nameEn: placeName(input, "en"), nameAr: placeName(input, "ar") };
  const n = Math.max(0, Math.floor(supply));
  if (locale === "ar") {
    return n === 0
      ? `لا يوجد ${subject(category, "ar")} مسجّل في ${city.nameAr} بعد`
      : `${n} ${subject(category, "ar")} متاح${n === 1 ? "" : "ون"} في ${city.nameAr}`;
  }
  // English pluralisation is deliberately naive: the professions are nouns with
  // regular plurals ("plumber" → "plumbers"), and a wrong-looking plural on a
  // landing page is worse than a slightly awkward one on an unknown term.
  return n === 0
    ? `No ${subject(category, "en")}s listed in ${city.nameEn} yet`
    : `${n} ${subject(category, "en")}${n === 1 ? "" : "s"} available in ${city.nameEn}`;
}

/**
 * The page's words. Everything a visitor reads is built here, from the catalogue
 * and the real supply count — no per-pair copy table to fall out of date.
 */
export function crossLandingCopy(input: CrossLandingInput): CrossLandingCopy {
  const { category, locale, supply } = input;
  const n = Math.max(0, Math.floor(Number.isFinite(supply) ? supply : 0));
  const heads = countPhrase({ ...input, supply: n });
  // Every sentence below names the page's place; for an area page that is the
  // area, with the city kept in the description's address line.
  const city = { nameEn: placeName(input, "en"), nameAr: placeName(input, "ar") };
  const where = { en: placeLine(input, "en"), ar: placeLine(input, "ar") };
  const cityName = { en: input.city.nameEn, ar: input.city.nameAr };

  if (locale === "ar") {
    return {
      title: `${subject(category, "ar")} في ${city.nameAr} — ${heads}`,
      description: `اعثر على ${subject(category, "ar")} موثوق في ${where.ar}. ${heads}. ${category.taglineAr}. تقييمات حقيقية، أسعار واضحة، وحجز مباشر.`,
      heading: `${subject(category, "ar")} في ${city.nameAr}`,
      intro: `${heads} على وركرز أرينا — ${category.taglineAr}. كل ملف يعرض سنوات الخبرة والتقييمات ونطاق السعر قبل أن تتواصل، ويمكنك الحجز مباشرة أو طلب عرض سعر من أكثر من ${subject(category, "ar")} واختيار الأنسب.`,
      faq: [
        {
          q: `كيف أجد ${subject(category, "ar")} في ${city.nameAr}؟`,
          a: `تصفّح القائمة أعلاه أو استخدم البحث بحسب المنطقة والتصنيف. يمكنك الترتيب حسب التقييم والسعر، وطلب عرض سعر من حتى ثلاثة ${subject(category, "ar")} في الوقت نفسه.`,
        },
        {
          q: `كم تكلفة ${subject(category, "ar")} في ${city.nameAr}؟`,
          a: `يعرض كل ملف ${category.taglineAr} ونطاق سعره الخاص — راجع الملف ثم اطلب عرضاً مؤكداً. إذا كان التصنيف فيه أعمال مكتملة كافية، يعرض الملف أيضاً «السعر المعتاد» المحسوب من الوظائف المنفذة فعلاً.`,
        },
        {
          q: "ما الذي يضمن أن العامل موثوق؟",
          a: `التقييمات مكتوبة فقط من عملاء أكملوا حجزاً على المنصة، والتحقق من الهوية يمنح شارة موثّق. لا يمكن حذف تقييم سلبي. والأعمال المحجوزة والمدفوعة عبر وركرز أرينا مشمولة بضمان وركرز أرينا: إذا كان العمل معيباً وأبلغتنا خلال ${GUARANTEE_TERMS.windowDays} أيام، نصلحه أو نسترد لك حتى ${GUARANTEE_TERMS.capMinor / 100}$.`,
        },
      ],
      areasHeading: input.area ? `مناطق أخرى في ${cityName.ar}` : `مناطق ${cityName.ar} التي نغطيها`,
      workersHeading: n === 0 ? `${subject(category, "ar")} — قريباً` : `أفضل ${subject(category, "ar")} في ${city.nameAr}`,
    };
  }

  return {
    title: `${subject(category, "en")} in ${city.nameEn} — ${heads}`,
    description: `Hire a verified ${subject(category, "en")} in ${where.en}. ${heads}. ${category.taglineEn}. Real reviews, transparent pricing, and direct booking.`,
    heading: `${subject(category, "en")} in ${city.nameEn}`,
    intro: `${heads} on WorkersArena — ${category.taglineEn.charAt(0).toLowerCase()}${category.taglineEn.slice(1)}. Every profile shows experience, reviews and a price range before you make contact, and you can book directly or ask up to three ${subject(category, "en")}s to quote and pick the best.`,
    faq: [
      {
        q: `How do I find a ${subject(category, "en")} in ${city.nameEn}?`,
        a: `Browse the list above, or search by area and trade. You can sort by rating and price, and invite up to three ${subject(category, "en")}s to quote for the same job at once.`,
      },
      {
        q: `How much does a ${subject(category, "en")} cost in ${city.nameEn}?`,
        a: `Each profile shows its own price range for ${category.taglineEn.toLowerCase()}. If a trade has enough completed jobs, the profile also shows a typical price derived from work actually done — not an advertised rate.`,
      },
      {
        q: "What makes these workers trustworthy?",
        a: `Reviews can only be left by customers who completed a booking on the platform, and identity verification earns a verified badge. A negative review cannot be removed. Jobs booked and paid through WorkersArena are also covered by the WorkersArena Guarantee: if the work is faulty and you tell us within ${GUARANTEE_TERMS.windowDays} days, we fix it or refund up to $${GUARANTEE_TERMS.capMinor / 100}.`,
      },
    ],
    areasHeading: input.area ? `Other areas of ${cityName.en}` : `Areas of ${cityName.en} we cover`,
    workersHeading: n === 0 ? `${subject(category, "en")} — coming soon` : `Top-rated ${subject(category, "en")}s in ${city.nameEn}`,
  };
}

/**
 * Order pairs by supply, highest first — the internal-linking order. Ties break
 * on the category slug so the same input always produces the same list (a
 * landing page that reshuffles its own links between renders is a page whose
 * crawl is wasted).
 */
export function rankPairsBySupply<T extends { supply: number; categorySlug: string; citySlug: string }>(
  pairs: readonly T[]
): T[] {
  return [...pairs].sort(
    (a, b) =>
      b.supply - a.supply ||
      a.categorySlug.localeCompare(b.categorySlug) ||
      a.citySlug.localeCompare(b.citySlug)
  );
}

/**
 * A search link for a pair, optionally narrowed to an area — what the areas
 * block and every "browse" button on the page points at. The filter names match
 * `SearchFilters`, which is what the search page reads from the URL.
 */
export function crossLandingSearchHref(input: {
  categorySlug: string;
  citySlug: string;
  areaSlug?: string;
}): string {
  const params = new URLSearchParams({ category: input.categorySlug, city: input.citySlug });
  if (input.areaSlug) params.set("area", input.areaSlug);
  return `/search?${params.toString()}`;
}

/** How many listed workers each trade × city pair and trade × area triple has. */
export interface ServedLandings {
  /** `trade/city` → workers. */
  pairs: Map<string, number>;
  /** `trade/city/area` → workers. */
  triples: Map<string, number>;
}

/**
 * Count supply per landing page from one full worker read — what the sitemap,
 * the prerender list and the cross-links all use, so they agree on which pages
 * are served. Takes the whole list rather than a search page: a search result
 * is one page of nine, and counting from it silently drops everything after.
 */
export function servedLandings(
  workers: readonly { categorySlug: string; citySlug: string; areaSlug?: string | null }[]
): ServedLandings {
  const pairs = new Map<string, number>();
  const triples = new Map<string, number>();
  for (const w of workers) {
    const pair = `${w.categorySlug}/${w.citySlug}`;
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
    if (w.areaSlug) {
      const triple = `${pair}/${w.areaSlug}`;
      triples.set(triple, (triples.get(triple) ?? 0) + 1);
    }
  }
  return { pairs, triples };
}
