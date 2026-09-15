import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { redirect } from "next/navigation";
import { getAllLeadRatings } from "@/lib/data/lead-market-store";
import { computeLeadQualityAnalytics } from "@/lib/data/lead-quality-analytics";
import { LeadQualityDashboard } from "@/components/admin/lead-quality-dashboard";

export const metadata: Metadata = {
  title: "Lead Quality Analytics | Admin",
};

export default async function LeadQualityAnalyticsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  const ratings = getAllLeadRatings();
  const analytics = computeLeadQualityAnalytics(ratings);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadQualityDashboard analytics={analytics} />
      </div>
    </div>
  );
}
