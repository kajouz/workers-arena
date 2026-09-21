import type { Metadata } from "next";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { localeAlternates } from "@/lib/i18n/routing";
import { Hero } from "@/components/home/hero";
import { CategoriesGrid } from "@/components/home/categories-grid";
import { FeaturedWorkers } from "@/components/home/featured-workers";
import { HowItWorks } from "@/components/home/how-it-works";
import { StatsBand } from "@/components/home/stats-band";
import { Testimonials } from "@/components/home/testimonials";
import { Plans } from "@/components/home/plans";
import { CTA } from "@/components/home/cta";
import { getCategories, getFeaturedWorkersList, getPopularSearches } from "@/lib/data/repo";
import { loadPlanCatalog } from "@/lib/data/fee-rules-store";
import { DEFAULT_COUNTRY } from "@/lib/tenant/countries";
import { PushOnboarding } from "@/components/notifications/push-onboarding";
import { MobileAppPromo } from "@/components/home/mobile-app-promo";

/**
 * hreflang + canonical for this page. Both languages are advertised so a
 * crawler treats /en/… and /ar/… as one page in two languages rather than
 * duplicate content — the pair that could not exist at all while the language
 * lived in a cookie and both shared a URL.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const dict = dictionaries[locale];
  return {
    title: dict.app.name,
    description: dict.app.description,
    alternates: localeAlternates(`/${locale}`),
  };
}


export const revalidate = 3600;

export default async function HomePage() {
  const [categories, featured, popular, planCatalog] = await Promise.all([
    getCategories(),
    getFeaturedWorkersList(4),
    getPopularSearches(),
    loadPlanCatalog(),
  ]);

  return (
    <>
      <Hero popular={popular} />
      <CategoriesGrid categories={categories} />
      <FeaturedWorkers workers={featured} />
      <HowItWorks />
      <StatsBand citiesServed={DEFAULT_COUNTRY.cities.length} />
      <Testimonials />
      <Plans catalog={planCatalog} />
      <CTA />
      <MobileAppPromo />
      <PushOnboarding />
    </>
  );
}
