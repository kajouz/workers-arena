import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { getAnalyticsOverview, getCampaigns, getInvoices } from "@/lib/data/repo";
import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { CompanyAnalyticsView } from "@/components/dashboard/company-analytics-view";

export const metadata = { title: "Company" };

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "company" && session.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const view = params.view ?? "dashboard";

  const [analytics, campaigns, invoices] = await Promise.all([getAnalyticsOverview(), getCampaigns(), getInvoices()]);
  const adInvoices = invoices.filter((i) => i.scope === "advertising");

  if (view === "analytics") {
    return <CompanyAnalyticsView session={session} />;
  }

  return <CompanyDashboard session={session} analytics={analytics} campaigns={campaigns} invoices={adInvoices} />;
}
