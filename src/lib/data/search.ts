import { CATEGORIES, categoryBySlug } from "./categories";
import { CITIES, cityBySlug } from "./cities";
import { WORKERS } from "./workers";
import { subscriptionStatus } from "./subscriptions";
import { isPlanFeeExempt } from "./booking-ui";
import { distanceKm, isOpenNow } from "@/lib/utils";
import type { SearchFilters, SearchResult, SearchSort, Suggestion, Worker } from "./types";

/** Strip Arabic diacritics + normalize for matching. */
export function normalize(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670]/g, "") // Arabic tashkeel
    .replace(/[\u0621\u0623\u0624\u0625\u0626]/g, "\u0627") // أ إ آ ؤ ئ → ا
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Subsequence fuzzy match: does every char of needle appear in haystack in order? */
function fuzzyMatch(needle: string, haystack: string): boolean {
  if (needle.length < 2) return haystack.includes(needle);
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

/** Build the searchable text blob for a worker (both languages). */
function searchableText(w: Worker): string {
  const cat = categoryBySlug(w.categorySlug);
  const city = cityBySlug(w.citySlug);
  const area = city?.areas.find((a) => a.slug === w.areaSlug);
  return [
    w.nameEn,
    w.nameAr,
    cat?.nameEn ?? "",
    cat?.nameAr ?? "",
    cat?.taglineEn ?? "",
    cat?.taglineAr ?? "",
    city?.nameEn ?? "",
    city?.nameAr ?? "",
    area?.nameEn ?? "",
    area?.nameAr ?? "",
    w.taglineEn,
    w.taglineAr,
    w.bioEn,
    w.bioAr,
    ...w.services.flatMap((s) => [s.nameEn, s.nameAr]),
  ].join(" ");
}

interface Scored extends Worker {
  score: number;
}

/** Relevance from the query itself (name/category/city/fuzzy) — no bonuses. */
function queryScore(w: Worker, queryTokens: string[], originalQuery: string): number {
  const nameEn = normalize(w.nameEn);
  const nameAr = normalize(w.nameAr);
  const cat = categoryBySlug(w.categorySlug);
  const city = cityBySlug(w.citySlug);
  const q = normalize(originalQuery);
  const catNames = normalize(`${cat?.nameEn ?? ""} ${cat?.nameAr ?? ""}`);
  const cityNames = normalize(`${city?.nameEn ?? ""} ${city?.nameAr ?? ""}`);

  let score = 0;
  const professionNames = normalize(`${cat?.professionEn ?? ""} ${cat?.professionAr ?? ""}`);

  if (nameEn === q || nameAr === q) score += 120; // exact name
  else if (nameEn.startsWith(q) || nameAr.startsWith(q)) score += 90; // name prefix
  else if (catNames === q || catNames.includes(q) || professionNames === q || professionNames.includes(q)) score += 70; // category / profession
  else if (cityNames.includes(q)) score += 40; // city match

  for (const tok of queryTokens) {
    if (nameEn.includes(tok) || nameAr.includes(tok)) score += 60;
    else if (catNames.includes(tok) || professionNames.includes(tok)) score += 45;
    else if (cityNames.includes(tok)) score += 25;
    else if (fuzzyMatch(tok, nameEn) || fuzzyMatch(tok, nameAr)) score += 30;
    else if (fuzzyMatch(tok, catNames) || fuzzyMatch(tok, professionNames)) score += 20;
  }
  return score;
}

/** Ranking bonus independent of the query (kept out of the match test). */
function rankBonus(w: Worker): number {
  let bonus = 0;
  if (w.verified) bonus += 8;
  if (w.premium) bonus += 6;
  if (w.featured) bonus += 4;
  return bonus + w.rating * 3;
}

export 
const PAGE_SIZE = 9;

export function searchWorkers(filters: SearchFilters): SearchResult {
  const start = performance.now();
  const q = filters.query?.trim() ?? "";
  const queryTokens = tokenize(q);

  let results: Scored[] = WORKERS.filter((w) => {
    // Hidden from search while the subscription is expired (reactivates on renew).
    if (!filters.includeExpired && subscriptionStatus(w.subscription) === "expired") return false;
    if (filters.category && w.categorySlug !== filters.category) return false;
    if (filters.city && w.citySlug !== filters.city) return false;
    if (filters.area && w.areaSlug !== filters.area) return false;
    if (filters.minRating && w.rating < filters.minRating) return false;
    if (filters.priceMin != null && w.priceMax < filters.priceMin) return false;
    if (filters.priceMax != null && w.priceMin > filters.priceMax) return false;
    if (filters.minExp && w.yearsExp < filters.minExp) return false;
    if (filters.verifiedOnly && !w.verified) return false;
    if (filters.featuredOnly && !w.featured) return false;
    if (filters.emergencyOnly && !w.emergency) return false;
    if (filters.openNowOnly && !isOpenNow(w)) return false;
    if (filters.availableNow && !w.available) return false;
    // M5 fee-waived filter — same exemption source as the card badge, so the
    // listing and the filter can never disagree (docs/booking-take-rate.md).
    if (filters.feeWaivedOnly && !isPlanFeeExempt(w.subscription.plan)) return false;
    return true;
  }).map((w) => ({ ...w, score: rankBonus(w) }));

  if (q) {
    results = results.filter((w) => {
      const qs = queryScore(w, queryTokens, q);
      if (qs > 0) {
        // Fold query relevance into the ranking score so exact-name matches
        // outrank fuzzy matches (previously only rankBonus was used).
        w.score += qs * 4;
        return true;
      }
      // ≥3 chars: avoids short stopwords like "al"/"el" (Arabic name prefixes)
      // that appear in nearly every profile and would match everything.
      const tokens = queryTokens.filter((t) => t.length >= 3);
      if (tokens.length === 0) return false;
      // Fuzzy-match against SHORT fields only (subsequence over long text
      // produces false positives). Full-text substring fallback for bio/skills.
      const cat = categoryBySlug(w.categorySlug);
      const city = cityBySlug(w.citySlug);
      const area = city?.areas.find((a) => a.slug === w.areaSlug);
      const shortFields = [
        w.nameEn,
        w.nameAr,
        w.taglineEn,
        w.taglineAr,
        cat?.nameEn ?? "",
        cat?.nameAr ?? "",
        cat?.professionEn ?? "",
        cat?.professionAr ?? "",
        cat?.taglineEn ?? "",
        cat?.taglineAr ?? "",
        city?.nameEn ?? "",
        city?.nameAr ?? "",
        area?.nameEn ?? "",
        area?.nameAr ?? "",
        ...w.services.flatMap((s) => [s.nameEn, s.nameAr]),
        ...w.gallery.flatMap((g) => [g.titleEn, g.titleAr]),
      ].map(normalize);
      // Fuzzy-match per WORD of each short field — subsequence spanning
      // multiple words produces false positives.
      // Substring (not subsequence) over the full searchable text — a stronger
      // signal than fuzzy subsequence, so it ranks above it.
      const blob = normalize(searchableText(w)).replace(/\s+/g, " ");
      if (tokens.some((t) => blob.includes(t))) {
        w.score += 30;
        return true;
      }
      if (
        tokens.some((t) =>
          shortFields.some((f) => f.split(" ").some((word) => word.length >= 2 && fuzzyMatch(t, word)))
        )
      ) {
        w.score += 20; // fuzzy hit — above base rankBonus, below exact/substring
        return true;
      }
      return false;
    });
  }

  const city = filters.city ? cityBySlug(filters.city) : undefined;
  const sort: SearchSort = filters.sort ?? "relevance";
  const sorted = [...results].sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.rating - a.rating;
      case "reviews":
        return b.reviewCount - a.reviewCount;
      case "priceLow":
        return a.priceMin - b.priceMin;
      case "priceHigh":
        return b.priceMin - a.priceMin;
      case "experience":
        return b.yearsExp - a.yearsExp;
      case "nearest":
        if (!city) return b.rating - a.rating;
        return (
          distanceKm(a.lat, a.lng, city.lat, city.lng) - distanceKm(b.lat, b.lng, city.lat, city.lng)
        );
      case "relevance":
      default:
        return b.score - a.score || b.rating - a.rating;
    }
  });

  const page = Math.max(1, filters.page ?? 1);
  const startIdx = (page - 1) * PAGE_SIZE;
  return {
    items: sorted.slice(startIdx, startIdx + PAGE_SIZE),
    total: sorted.length,
    tookMs: Math.round(performance.now() - start),
  };
}

export function getFeaturedWorkers(limit = 4): Worker[] {
  return WORKERS.filter((w) => w.featured).slice(0, limit);
}

export function getRelatedWorkers(w: Worker, limit = 4): Worker[] {
  return WORKERS.filter((x) => x.id !== w.id)
    .map((x) => ({
      x,
      score:
        (x.categorySlug === w.categorySlug ? 100 : 0) +
        (x.citySlug === w.citySlug ? 50 : 0) +
        x.rating * 5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.x);
}

/** Autocomplete suggestions from query text (categories, workers, cities). */
export function getSuggestions(query: string, locale: "en" | "ar" = "en"): Suggestion[] {
  const q = normalize(query);
  if (!q) return [];
  const out: Suggestion[] = [];

  for (const c of CATEGORIES) {
    const names = normalize(`${c.nameEn} ${c.nameAr} ${c.taglineEn} ${c.taglineAr}`);
    const tok = q.split(" ")[0];
    if (tok.length >= 1 && (names.includes(tok) || fuzzyMatch(tok, normalize(c.nameEn + c.nameAr)))) {
      out.push({ labelEn: c.nameEn, labelAr: c.nameAr, type: "category", href: `/categories/${c.slug}` });
    }
  }
  for (const c of CITIES) {
    const names = normalize(c.nameEn + c.nameAr);
    if (names.includes(q) || fuzzyMatch(q, names)) {
      out.push({ labelEn: `${c.nameEn} — all trades`, labelAr: `${c.nameAr} — كل المهن`, type: "city", href: `/search?city=${c.slug}` });
    }
  }
  for (const w of WORKERS) {
    if (out.length >= 8) break;
    const names = normalize(w.nameEn + w.nameAr);
    if (names.includes(q) || fuzzyMatch(q, names)) {
      out.push({ labelEn: w.nameEn, labelAr: w.nameAr, type: "worker", href: `/workers/${w.slug}` });
    }
  }
  return out.slice(0, 8);
}

export const POPULAR_SEARCHES: { en: string; ar: string; href: string }[] = [
  { en: "Plumber", ar: "سباك", href: "/search?category=plumbing" },
  { en: "Electrician", ar: "كهربائي", href: "/search?category=electrical" },
  { en: "AC technician", ar: "فني تكييف", href: "/search?category=ac-technician" },
  { en: "Carpenter", ar: "نجار", href: "/search?category=carpentry" },
  { en: "Cleaning", ar: "تنظيف", href: "/search?category=cleaning" },
  { en: "Painter", ar: "دهان", href: "/search?category=painting" },
];
