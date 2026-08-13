import { Hero } from "@/components/home/hero";
import { CategoriesGrid } from "@/components/home/categories-grid";
import { FeaturedWorkers } from "@/components/home/featured-workers";
import { HowItWorks } from "@/components/home/how-it-works";
import { StatsBand } from "@/components/home/stats-band";
import { Testimonials } from "@/components/home/testimonials";
import { Plans } from "@/components/home/plans";
import { CTA } from "@/components/home/cta";
import { getCategories, getFeaturedWorkersList, getPopularSearches } from "@/lib/data/repo";
import { getSession } from "@/lib/auth-demo";
import { PushOnboarding } from "@/components/notifications/push-onboarding";

export const revalidate = 3600;

export default async function HomePage() {
  const session = await getSession();
  const [categories, featured, popular] = await Promise.all([
    getCategories(),
    getFeaturedWorkersList(4),
    getPopularSearches(),
  ]);

  return (
    <>
      <Hero popular={popular} />
      <CategoriesGrid categories={categories} />
      <FeaturedWorkers workers={featured} />
      <HowItWorks />
      <StatsBand />
      <Testimonials />
      <Plans />
      <CTA />
      <PushOnboarding signedIn={Boolean(session)} />
    </>
  );
}
