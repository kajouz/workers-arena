import type { Metadata } from "next";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { localeAlternates } from "@/lib/i18n/routing";
import { categoryBySlug } from "@/lib/data/categories";
import { cityBySlug, countryOfCity } from "@/lib/data/cities";
import { DEFAULT_COUNTRY } from "@/lib/tenant/countries";
import { notFound } from "next/navigation";
import { getAllWorkers, getWorkers } from "@/lib/data/repo";
import { crossLandingCopy, crossLandingPath, indexVerdict, servedLandings } from "@/lib/data/cross-landing";
import { CrossLandingView } from "@/components/seo/cross-landing-view";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TRADE × CITY LANDING PAGE — /{locale}/trades/{trade}/{city}
 * ────────────────────────────────────────────────────────────────────────────
 * The page a "plumber in Beirut" search should land on: the trade, the city,
 * the workers we actually have there, the areas we serve, and an honest answer
 * when we have nobody. The copy and the indexability rule live in the pure
 * engine (`src/lib/data/cross-landing.ts`), the markup in `CrossLandingView`
 * (shared with the area pages); this file owns the data read.
 *
 * Supply is read at RENDER time from the same search the page lists — its
 * `total`, not the nine cards of the first page — so the `noindex` verdict and
 * the sentence "3 plumbers available in Beirut" can never disagree with it.
 */

interface CrossLandingProps {
  params: Promise<{ locale: string; trade: string; city: string }>;
}

/**
 * Prerender the pairs we can serve, counted from every listed worker (a search
 * read is one page of nine and would miss the rest). Other pairs still resolve
 * on demand and are `noindex`ed by `generateMetadata` if they are empty.
 *
 * A failed read (build without a database) yields an empty list rather than
 * failing the build; the pairs then render on demand.
 */
export async function generateStaticParams() {
  try {
    const { pairs } = servedLandings(await getAllWorkers());
    return [...pairs.keys()].map((pair) => {
      const [trade, city] = pair.split("/");
      return { trade, city };
    });
  } catch {
    return [];
  }
}

/**
 * A pair that gained supply after the build still resolves, and one that lost
 * every worker still answers (with the honest empty page). Daily revalidation
 * re-runs the read the indexability verdict depends on.
 */
export const revalidate = 86400;

export async function generateMetadata({ params }: CrossLandingProps): Promise<Metadata> {
  const { locale: rawLocale, trade, city } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const alternates = localeAlternates(crossLandingPath(locale, trade, city));

  const category = categoryBySlug(trade);
  const cityData = cityBySlug(city);
  if (!category || !cityData) return {};

  // The verdict has to describe the page, so it needs the page's own supply read.
  let supply = 0;
  try {
    supply = (await getWorkers({ category: trade, city })).total;
  } catch {
    // A failed read is not evidence of supply (see indexVerdict) — the page
    // renders, it just does not ask to be indexed on a count it could not read.
  }
  const verdict = indexVerdict(supply);
  const country = countryOfCity(cityData) ?? DEFAULT_COUNTRY;
  const copy = crossLandingCopy({ category, city: cityData, country, supply, locale });

  return {
    alternates,
    title: copy.title,
    description: copy.description,
    robots: verdict.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: copy.title,
      description: copy.description,
      type: "website",
      locale: locale === "ar" ? "ar_LB" : "en_US",
    },
  };
}

export default async function CrossLandingPage({ params }: CrossLandingProps) {
  const { locale: rawLocale, trade, city } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;

  const category = categoryBySlug(trade);
  const cityData = cityBySlug(city);
  if (!category || !cityData) notFound();

  // ONE read for the list and the count, so the copy and the cards cannot drift.
  const [{ items: workers, total }, all] = await Promise.all([
    getWorkers({ category: trade, city }),
    getAllWorkers(),
  ]);

  return (
    <CrossLandingView
      locale={locale}
      category={category}
      city={cityData}
      country={countryOfCity(cityData) ?? DEFAULT_COUNTRY}
      workers={workers}
      supply={total}
      served={servedLandings(all)}
    />
  );
}
