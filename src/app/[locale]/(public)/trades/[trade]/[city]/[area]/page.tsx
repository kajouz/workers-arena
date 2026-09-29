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
 * TRADE × AREA LANDING PAGE — /{locale}/trades/{trade}/{city}/{area}
 * ────────────────────────────────────────────────────────────────────────────
 * "Plumber in Achrafieh": the neighbourhood-level query, one level below the
 * city page. Same honesty rule — an area with nobody listed is `noindex` and
 * left out of the sitemap — but the visitor still gets an answer: the same
 * trade elsewhere in the city, labelled as such.
 *
 * An area that does not belong to the city is a 404, not a page: the address
 * would otherwise mint duplicate content for every city × area combination.
 */

interface AreaLandingProps {
  params: Promise<{ locale: string; trade: string; city: string; area: string }>;
}

function resolve(trade: string, city: string, area: string) {
  const category = categoryBySlug(trade);
  const cityData = cityBySlug(city);
  const areaData = cityData?.areas.find((a) => a.slug === area);
  if (!category || !cityData || !areaData) return null;
  return { category, cityData, areaData, country: countryOfCity(cityData) ?? DEFAULT_COUNTRY };
}

/** Prerender the served triples only; the rest resolve on demand. */
export async function generateStaticParams() {
  try {
    const { triples } = servedLandings(await getAllWorkers());
    return [...triples.keys()].map((triple) => {
      const [trade, city, area] = triple.split("/");
      return { trade, city, area };
    });
  } catch {
    return [];
  }
}

export const revalidate = 86400;

export async function generateMetadata({ params }: AreaLandingProps): Promise<Metadata> {
  const { locale: rawLocale, trade, city, area } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const found = resolve(trade, city, area);
  if (!found) return {};

  let supply = 0;
  try {
    supply = (await getWorkers({ category: trade, city, area })).total;
  } catch {
    // Unreadable supply is not evidence of supply — render, but do not index.
  }
  const verdict = indexVerdict(supply);
  const copy = crossLandingCopy({
    category: found.category,
    city: found.cityData,
    area: found.areaData,
    country: found.country,
    supply,
    locale,
  });

  return {
    alternates: localeAlternates(crossLandingPath(locale, trade, city, area)),
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

export default async function AreaLandingPage({ params }: AreaLandingProps) {
  const { locale: rawLocale, trade, city, area } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const found = resolve(trade, city, area);
  if (!found) notFound();

  const [{ items: workers, total }, all] = await Promise.all([
    getWorkers({ category: trade, city, area }),
    getAllWorkers(),
  ]);
  // Nobody in the area: fall back to the trade across the city (never indexed).
  const nearby = total === 0 ? (await getWorkers({ category: trade, city })).items.slice(0, 6) : [];

  return (
    <CrossLandingView
      locale={locale}
      category={found.category}
      city={found.cityData}
      area={found.areaData}
      country={found.country}
      workers={workers}
      supply={total}
      nearby={nearby}
      served={servedLandings(all)}
    />
  );
}
