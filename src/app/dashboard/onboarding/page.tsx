import { redirect } from "next/navigation";
import { getCategories, getCities } from "@/lib/data/repo";
import { getSession } from "@/lib/auth-demo";
import { OnboardingForm } from "@/components/dashboard/onboarding-form";

/**
 * Worker onboarding — the page a newly registered worker lands on after
 * registration. It collects the minimum profile fields (name, category,
 * city, area, phone) and creates the Worker row + 30-day trial subscription
 * in one server action.
 *
 * Workers who already have a profile are redirected to the dashboard.
 */
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.id) redirect("/auth/login");

  const { getPrisma } = await import("@/lib/server/prisma");
  const prisma = getPrisma();
  const existing = await prisma.worker.findFirst({
    where: { userId: session.id },
  });
  if (existing) redirect("/dashboard");

  const [categories, cities] = await Promise.all([
    getCategories(),
    getCities(),
  ]);
  // Areas are nested inside cities — flatten for the form.
  const areas = cities.flatMap((c) => c.areas.map((a) => ({ ...a, citySlug: c.slug, cityName: c.nameEn })));

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Complete Your Profile</h1>
          <p className="text-muted-foreground mt-2">
            Set up your worker profile to start receiving jobs. Your 30-day free trial begins today.
          </p>
        </div>
        <OnboardingForm
          categories={categories}
          cities={cities}
          areas={areas}
          defaultName={session.name ?? ""}
          locale="en"
        />
      </div>
    </main>
  );
}
