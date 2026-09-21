import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { getAllLeadRatings } from "@/lib/data/lead-market-store";
import { computeLeadQualityAnalytics } from "@/lib/data/lead-quality-analytics";
import { getCategoryConversionMetrics } from "@/lib/data/repo";
import { LeadQualityDashboard } from "@/components/admin/lead-quality-dashboard";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata: Metadata = {
  title: "Lead Quality Analytics | Admin",
};

export default async function LeadQualityAnalyticsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") return await localeRedirect("/auth/login");

  const ratings = getAllLeadRatings();
  const analytics = computeLeadQualityAnalytics(ratings);
  // §2.1 — the lead funnel per trade: offered → purchased → job won.
  const categoryConversion = await getCategoryConversionMetrics(30);

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadQualityDashboard analytics={analytics} categoryConversion={categoryConversion} />
      </div>
    </div>
  );
}
