import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchClient } from "@/components/search/search-client";
import { SearchErrorBoundary } from "@/components/search/search-error-boundary";
import { getCategories, getCities, getWorkers } from "@/lib/data/repo";
import { getI18n } from "@/lib/i18n/server";
import { searchParamsToFilters } from "@/lib/data/search-params";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, t } = await getI18n();
  const raw = await searchParams;
  const initialFilters = searchParamsToFilters(raw);
  const [categories, cities, initial] = await Promise.all([
    getCategories(),
    getCities(),
    getWorkers(initialFilters),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Accessible live region for search result announcements */}
      <div aria-live="polite" aria-atomic="true" role="status" className="sr-only" />
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
          {t("search.title")}
        </h1>
        <p className="mt-2 text-ink-500 dark:text-ink-400">{t("search.subtitle")}</p>
      </div>
      <SearchErrorBoundary>
      <Suspense fallback={null}>
        <SearchClient
          locale={locale}
          categories={categories}
          cities={cities}
          initialFilters={initialFilters}
          initialResults={initial}
          dictLabels={{
            category: t("search.category"),
            city: t("search.city"),
            area: t("search.area"),
            rating: t("search.rating"),
            anyRating: t("search.anyRating"),
            priceRange: t("search.priceRange"),
            anyPrice: t("search.anyPrice"),
            experience: t("search.experience"),
            anyExp: t("search.anyExp"),
            availability: t("search.availability"),
            availableNow: t("search.availableNow"),
            openNowOnly: t("search.openNowOnly"),
            emergencyOnly: t("search.emergencyOnly"),
            verifiedOnly: t("search.verifiedOnly"),
            featuredOnly: t("search.featuredOnly"),
            feeWaived: t("search.feeWaived"),
            sortBy: t("search.sortBy"),
            sortRelevance: t("search.sort.relevance"),
            sortRating: t("search.sort.rating"),
            sortReviews: t("search.sort.reviews"),
            sortPriceLow: t("search.sort.priceLow"),
            sortPriceHigh: t("search.sort.priceHigh"),
            sortExperience: t("search.sort.experience"),
            sortNearest: t("search.sort.nearest"),
            results: t("search.results"),
            result: t("search.result"),
            filters: t("search.filters"),
            clearFilters: t("search.clearFilters"),
            emptyTitle: t("search.empty.title"),
            emptyBody: t("search.empty.body"),
            emptyCta: t("search.empty.cta"),
            placeholder: t("search.placeholder"),
            voice: t("search.voice"),
            listening: t("search.listening"),
            loadMore: t("common.loadMore"),
            loading: t("common.loading"),
            noResults: t("common.noResults"),
          }}
        />
      </Suspense>
      </SearchErrorBoundary>
    </div>
  );
}
