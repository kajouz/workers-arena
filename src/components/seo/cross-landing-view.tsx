import { Link } from "@/components/i18n/link";
import { ArrowRight, MapPin, CheckCircle, ShieldCheck } from "lucide-react";
import { GUARANTEE_TERMS } from "@/lib/data/guarantee-terms";
import { CATEGORIES } from "@/lib/data/categories";
import { CITIES } from "@/lib/data/cities";
import type { CountryConfig } from "@/lib/tenant/countries";
import { CategoryIcon } from "@/components/shared/category-icon";
import { WorkerCard } from "@/components/shared/worker-card";
import { WhatsAppRequestButton } from "@/components/shared/whatsapp-request-button";
import { getI18n } from "@/lib/i18n/server";
import type { Area, Category, City, Worker } from "@/lib/data/types";
import {
  crossLandingCopy,
  crossLandingPath,
  crossLandingSearchHref,
  indexVerdict,
  rankPairsBySupply,
  type LandingLocale,
  type ServedLandings,
} from "@/lib/data/cross-landing";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TRADE × PLACE LANDING VIEW — shared by the city and the area pages
 * ────────────────────────────────────────────────────────────────────────────
 * /trades/{trade}/{city} and /trades/{trade}/{city}/{area} are the same page
 * about a different place, so they render the same markup. The routes own the
 * data reads; this owns the layout, the structured data and the cross-links.
 *
 * `supply` is the search TOTAL for the place (not the nine cards on screen), so
 * "14 plumbers available" is true even when only the first page is listed.
 */
export interface CrossLandingViewProps {
  locale: LandingLocale;
  category: Category;
  city: City;
  area?: Area;
  country: Pick<CountryConfig, "nameEn" | "nameAr">;
  /** The first page of workers in the place, best-ranked first. */
  workers: Worker[];
  /** How many workers the place really has. */
  supply: number;
  /**
   * An area page with nobody listed shows the trade elsewhere in its city
   * instead of a dead end — labelled as such, and the page stays `noindex`.
   */
  nearby?: Worker[];
  /** Supply per page across the catalogue, for ranking the cross-links. */
  served: ServedLandings;
}

export async function CrossLandingView({
  locale,
  category,
  city,
  area,
  country,
  workers,
  supply,
  nearby = [],
  served,
}: CrossLandingViewProps) {
  const { t } = await getI18n();
  const trade = category.slug;
  const verdict = indexVerdict(supply);
  const copy = crossLandingCopy({ category, city, area, country, supply, locale });
  const path = crossLandingPath(locale, trade, city.slug, area?.slug);
  const searchHref = crossLandingSearchHref({ categorySlug: trade, citySlug: city.slug, areaSlug: area?.slug });

  const name = (x: { nameEn: string; nameAr: string }) => (locale === "ar" ? x.nameAr : x.nameEn);
  const cityName = name(city);
  const placeLabel = area ? name(area) : cityName;
  // WhatsApp-first (revenue plan Step 5): "I need a plumber in Achrafieh", to
  // WorkersArena's number — the team books it on the platform.
  const whatsappRequest = {
    trade: locale === "ar" ? category.professionAr : category.professionEn,
    place: area ? `${name(area)}, ${cityName}` : cityName,
  };

  /**
   * Internal links, both directions of the matrix: other trades in this city,
   * and this trade in the other cities. Ranked by real supply so the links that
   * lead somewhere useful come first (see rankPairsBySupply).
   */
  const otherTradesHere = rankPairsBySupply(
    CATEGORIES.filter((c) => c.slug !== trade).map((c) => ({
      categorySlug: c.slug,
      citySlug: city.slug,
      supply: served.pairs.get(`${c.slug}/${city.slug}`) ?? 0,
      label: name(c),
    }))
  ).slice(0, 8);

  const thisTradeElsewhere = rankPairsBySupply(
    CITIES.filter((c) => c.slug !== city.slug).map((c) => ({
      categorySlug: trade,
      citySlug: c.slug,
      supply: served.pairs.get(`${trade}/${c.slug}`) ?? 0,
      label: name(c),
    }))
  );

  /**
   * The city's areas, served ones first. On an area page this is "other areas
   * of the city" and leaves out the current one.
   */
  const areaLinks = [...city.areas]
    .filter((a) => a.slug !== area?.slug)
    .map((a) => ({ area: a, supply: served.triples.get(`${trade}/${city.slug}/${a.slug}`) ?? 0 }))
    .sort((a, b) => b.supply - a.supply || a.area.slug.localeCompare(b.area.slug));

  const crumbs = [
    { name: locale === "ar" ? "الرئيسية" : "Home", href: "/" },
    { name: name(category), href: `/trades/${trade}` },
    ...(area ? [{ name: cityName, href: `/trades/${trade}/${city.slug}` }] : []),
  ];

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        ...crumbs.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.name,
          item: c.href === "/" ? `/${locale}` : `/${locale}${c.href}`,
        })),
        { "@type": "ListItem", position: crumbs.length + 1, name: copy.heading, item: path },
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
              name: name(worker),
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
          {crumbs.map((c) => (
            <span key={c.href} className="contents">
              <Link href={c.href} className="text-ink-500 hover:text-brand-600 dark:text-ink-400">
                {c.name}
              </Link>
              <span className="text-ink-300">/</span>
            </span>
          ))}
          <span className="font-medium text-ink-700 dark:text-ink-300">{placeLabel}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
              <CategoryIcon name={category.icon} className="size-6 text-brand-500" />
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400">
              <MapPin className="size-4" />
              {[area && name(area), cityName, name(country)].filter(Boolean).join(locale === "ar" ? "، " : ", ")}
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
            <WhatsAppRequestButton request={whatsappRequest} className="h-auto px-6 py-3 text-sm font-bold" />
            <Link
              href={searchHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600"
            >
              {t("crossLanding.browse")}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href={`/cities/${city.slug}`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-6 py-3 text-sm font-bold text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-800 dark:text-ink-200 dark:hover:bg-ink-900"
            >
              {t("crossLanding.allTradesIn").replace("{city}", cityName)}
            </Link>
          </div>
        </div>

        {/* The workers we actually have in this place. */}
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
              <WhatsAppRequestButton request={whatsappRequest} className="mt-4 me-3" />
              <Link
                href={area ? `/trades/${trade}/${city.slug}` : `/search?category=${trade}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
              >
                {area
                  ? t("crossLanding.tradeAcrossCity").replace("{trade}", name(category)).replace("{city}", cityName)
                  : t("crossLanding.widenSearch")}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </section>

        {/* An empty area still answers the visitor: the same trade elsewhere in the city. */}
        {workers.length === 0 && nearby.length > 0 && (
          <section className="mb-16">
            <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {t("crossLanding.nearbyIn").replace("{trade}", name(category)).replace("{city}", cityName)}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {nearby.map((worker, i) => (
                <WorkerCard key={worker.id} worker={worker} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Areas — each one its own landing page ("plumber in Achrafieh"). */}
        {areaLinks.length > 0 && (
          <section className="mb-16">
            <h2 className="mb-4 text-2xl font-bold text-ink-900 dark:text-ink-50">{copy.areasHeading}</h2>
            <div className="flex flex-wrap gap-2">
              {areaLinks.map(({ area: a, supply: n }) => (
                <Link
                  key={a.slug}
                  href={`/trades/${trade}/${city.slug}/${a.slug}`}
                  className="rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-ink-800 dark:text-ink-200"
                >
                  {name(a)}
                  {n > 0 && <span className="ms-1.5 text-xs text-ink-400">({n})</span>}
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
              {t("crossLanding.otherTrades").replace("{city}", cityName)}
            </h2>
            <ul className="space-y-2">
              {otherTradesHere.map((pair) => (
                <li key={pair.categorySlug}>
                  <Link
                    href={`/trades/${pair.categorySlug}/${pair.citySlug}`}
                    className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {pair.label} — {cityName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {thisTradeElsewhere.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-bold text-ink-900 dark:text-ink-50">
                {t("crossLanding.sameTradeElsewhere").replace("{trade}", name(category))}
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

        {/* What the platform does for this place, in the trade hub's language. */}
        <section className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
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

        {/* WorkersArena Guarantee — the reason to book and pay here. */}
        <div className="mb-16 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-ink-700 dark:text-ink-200">
            <span className="font-bold">{t("guarantee.name")}</span>{" "}
            {t("guarantee.terms")
              .replace("{days}", String(GUARANTEE_TERMS.windowDays))
              .replace("{cap}", String(GUARANTEE_TERMS.capMinor / 100))}
          </p>
        </div>

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
