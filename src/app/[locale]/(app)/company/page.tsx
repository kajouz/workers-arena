import { getSession } from "@/lib/auth-demo";
import { getAnalyticsOverview, getCampaigns, getInvoices } from "@/lib/data/repo";
import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { CompanyAnalyticsView } from "@/components/dashboard/company-analytics-view";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Company" };

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "company" && session.role !== "admin") return await localeRedirect("/dashboard");

  const params = await searchParams;
  const view = params.view ?? "dashboard";

  // A company sees its own campaigns and invoices; an admin sees all of them.
  const owner = session.role === "company" ? session.id : undefined;
  const [analytics, campaigns, invoices] = await Promise.all([
    getAnalyticsOverview(),
    getCampaigns(owner),
    getInvoices(owner),
  ]);
  const adInvoices = invoices.filter((i) => i.scope === "advertising");

  if (view === "analytics") {
    return <CompanyAnalyticsView session={session} />;
  }

  return <CompanyDashboard session={session} analytics={analytics} campaigns={campaigns} invoices={adInvoices} />;
}
