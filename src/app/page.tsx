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
import { getSession } from "@/lib/auth-demo";
import { PushOnboarding } from "@/components/notifications/push-onboarding";

export const revalidate = 3600;

export default async function HomePage() {
  const session = await getSession();
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
      <PushOnboarding signedIn={Boolean(session)} />
    </>
  );
}
