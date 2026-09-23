import type { Metadata } from "next";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { localeAlternates } from "@/lib/i18n/routing";
import { Link } from "@/components/i18n/link";
import { ArrowRight, MapPin, CheckCircle } from "lucide-react";
import { categoryBySlug, CATEGORIES } from "@/lib/data/categories";
import { cityBySlug, CITIES, countryOfCity } from "@/lib/data/cities";
import { DEFAULT_COUNTRY } from "@/lib/tenant/countries";
import { CategoryIcon } from "@/components/shared/category-icon";
import { WorkerCard } from "@/components/shared/worker-card";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getWorkers } from "@/lib/data/repo";
import {
  crossLandingCopy,
  crossLandingPath,
  crossLandingSearchHref,
  indexVerdict,
  rankPairsBySupply,
} from "@/lib/data/cross-landing";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TRADE × CITY LANDING PAGE — /{locale}/trades/{trade}/{city}
 * ────────────────────────────────────────────────────────────────────────────
 * The page a "plumber in Beirut" search should land on: the trade, the city,
 * the workers we actually have there, the areas we serve, and an honest answer
 * when we have nobody. The copy and the indexability rule live in the pure
 * engine (`src/lib/data/cross-landing.ts`); this file owns the data read and the
 * markup.
 *
 * Supply is read at RENDER time, exactly as the page lists it, so the `noindex`
 * verdict and the sentence "3 plumbers available in Beirut" can never disagree
 * with the cards underneath them.
 */

interface CrossLandingProps {
  params: Promise<{ locale: string; trade: string; city: string }>;
}

/**
 * Prerender the pairs we can serve. `getWorkers` is the same read the page
 * performs, so a pair is prerendered only if a visitor would find someone — the
 * rest still resolve on demand (see `dynamicParams` below) and are `noindex`ed by
 * `generateMetadata` if they are empty when rendered.
 *
 * A failed read (build without a database) yields an empty list rather than
 * failing the build; the pairs then render on demand.
 */
export async function generateStaticParams() {
  try {
    const { items } = await getWorkers({});
    const served = new Set(items.map((w) => `${w.categorySlug}/${w.citySlug}`));
    return [...served].map((pair) => {
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
    supply = (await getWorkers({ category: trade, city })).items.length;
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
  const { t } = await getI18n();

  const category = categoryBySlug(trade);
  const cityData = cityBySlug(city);
  if (!category || !cityData) notFound();

  const country = countryOfCity(cityData) ?? DEFAULT_COUNTRY;

  // ONE read, used for the copy, the verdict and the list — the three cannot drift.
  const { items: workers } = await getWorkers({ category: trade, city });
  const supply = workers.length;
  const verdict = indexVerdict(supply);
  const copy = crossLandingCopy({ category, city: cityData, country, supply, locale });

  const path = crossLandingPath(locale, trade, city);
  const searchHref = crossLandingSearchHref({ categorySlug: trade, citySlug: city });

  /**
   * Internal links, both directions of the matrix: other trades in this city,
   * and this trade in the cities we serve. Ordered by supply so the links that
   * lead somewhere useful come first (see rankPairsBySupply).
   */
  const otherTradesHere = rankPairsBySupply(
    CATEGORIES.filter((c) => c.slug !== trade).map((c) => ({
      categorySlug: c.slug,
      citySlug: city,
      supply: c.workerCount,
      label: locale === "ar" ? c.nameAr : c.nameEn,
    }))
  ).slice(0, 8);

  const thisTradeElsewhere = rankPairsBySupply(
    CITIES.filter((c) => c.slug !== city).map((c) => ({
      categorySlug: trade,
      citySlug: c.slug,
      supply: 0,
      label: locale === "ar" ? c.nameAr : c.nameEn,
    }))
  );

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: locale === "ar" ? "الرئيسية" : "Home", item: `/${locale}` },
        {
          "@type": "ListItem",
          position: 2,
          name: locale === "ar" ? "المهن" : "Trades",
          item: `/${locale}/trades/${trade}`,
        },
        { "@type": "ListItem", position: 3, name: copy.heading, item: path },
      ],
    },
    // Only advertised when there is something to advertise — an ItemList of zero
    // workers is a claim a crawler would have to interpret.
    ...(supply > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: copy.heading,
            numberOfItems: supply,
            itemListElement: workers.slice(0, 10).map((worker, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: locale === "ar" ? worker.nameAr : worker.nameEn,
              url: `/${locale}/workers/${worker.slug}`,
            })),
          },
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: copy.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Breadcrumb — the trail a crawler and a customer both read. */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Link href="/" className="text-ink-500 hover:text-brand-600 dark:text-ink-400">
            {locale === "ar" ? "الرئيسية" : "Home"}
          </Link>
          <span className="text-ink-300">/</span>
          <Link href={`/trades/${trade}`} className="text-ink-500 hover:text-brand-600 dark:text-ink-400">
            {locale === "ar" ? category.nameAr : category.nameEn}
          </Link>
          <span className="text-ink-300">/</span>
          <span className="font-medium text-ink-700 dark:text-ink-300">
            {locale === "ar" ? cityData.nameAr : cityData.nameEn}
          </span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
              <CategoryIcon name={category.icon} className="size-6 text-brand-500" />
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
              <MapPin className="size-4" />
              {locale === "ar" ? `${cityData.nameAr}، ${country.nameAr}` : `${cityData.nameEn}, ${country.nameEn}`}
            </span>
            {/* The indexability verdict is internal — it is not shown, but the
                count beside it is the one the verdict was computed from. */}
            {!verdict.indexable && (
              <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {t("crossLanding.comingSoon")}
              </span>
            )}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            {copy.heading}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-ink-500 dark:text-ink-400">{copy.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={searchHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600"
            >
              {t("crossLanding.browse")}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`/cities/${city}`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-6 py-3 text-sm font-bold text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-800 dark:text-ink-200 dark:hover:bg-ink-900"
            >
              {t("crossLanding.allTradesIn").replace("{city}", locale === "ar" ? cityData.nameAr : cityData.nameEn)}
            </Link>
          </div>
        </div>

        {/* The workers we actually have in this pair. */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">{copy.workersHeading}</h2>
          {workers.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {workers.map((worker, i) => (
                <WorkerCard key={worker.id} worker={worker} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-800">
              <p className="text-ink-600 dark:text-ink-300">{t("crossLanding.emptyBody")}</p>
              <Link
                href={`/search?category=${trade}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
              >
                {t("crossLanding.widenSearch")}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </section>

        {/* Areas — the sub-targets, one filtered search away (not separate thin pages). */}
        {cityData.areas.length > 0 && (
          <section className="mb-16">
            <h2 className="mb-4 text-2xl font-bold text-ink-900 dark:text-ink-50">{copy.areasHeading}</h2>
            <div className="flex flex-wrap gap-2">
              {cityData.areas.map((area) => (
                <Link
                  key={area.slug}
                  href={crossLandingSearchHref({ categorySlug: trade, citySlug: city, areaSlug: area.slug })}
                  className="rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-ink-800 dark:text-ink-200"
                >
                  {locale === "ar" ? area.nameAr : area.nameEn}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FAQ — the page's substance when the list is short. */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">{t("crossLanding.faqHeading")}</h2>
          <div className="space-y-4">
            {copy.faq.map((item, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
              >
                <summary className="cursor-pointer text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {item.q}
                </summary>
                <p className="mt-3 text-ink-600 dark:text-ink-300">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Matrix internal links, both directions. */}
        <section className="mb-16 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-lg font-bold text-ink-900 dark:text-ink-50">
              {t("crossLanding.otherTrades").replace("{city}", locale === "ar" ? cityData.nameAr : cityData.nameEn)}
            </h2>
            <ul className="space-y-2">
              {otherTradesHere.map((pair) => (
                <li key={pair.categorySlug}>
                  <Link
                    href={`/trades/${pair.categorySlug}/${pair.citySlug}`}
                    className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {pair.label} — {locale === "ar" ? cityData.nameAr : cityData.nameEn}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {thisTradeElsewhere.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-bold text-ink-900 dark:text-ink-50">
                {t("crossLanding.sameTradeElsewhere").replace(
                  "{trade}",
                  locale === "ar" ? category.nameAr : category.nameEn
                )}
              </h2>
              <ul className="space-y-2">
                {thisTradeElsewhere.map((pair) => (
                  <li key={pair.citySlug}>
                    <Link
                      href={`/trades/${pair.categorySlug}/${pair.citySlug}`}
                      className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {locale === "ar" ? category.professionAr : category.professionEn} — {pair.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* What the platform does for this pair, in the trade hub's language. */}
        <section className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.faq.length > 0 &&
            [
              t("crossLanding.point1"),
              t("crossLanding.point2"),
              t("crossLanding.point3"),
              t("crossLanding.point4"),
            ].map((point, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
              >
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-500" />
                <span className="text-sm text-ink-600 dark:text-ink-300">{point}</span>
              </div>
            ))}
        </section>

        <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">{copy.heading}</h2>
          <p className="mt-3 text-brand-100">{t("crossLanding.ctaBody")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={searchHref}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50 dark:bg-ink-900"
            >
              {t("crossLanding.browse")}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              {t("crossLanding.listServices")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
