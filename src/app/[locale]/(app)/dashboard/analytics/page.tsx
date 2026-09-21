import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerBookings, getWorkerLeadOffers } from "@/lib/data/repo";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Analytics | Dashboard" };

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session || session.role !== "worker") return await localeRedirect("/auth/login");

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) return await localeRedirect("/dashboard");

  const [bookings, leadOffers] = await Promise.all([
    getWorkerBookings(worker.id),
    getWorkerLeadOffers(worker.id),
  ]);

  return (
    <AnalyticsDashboard
      worker={worker}
      bookings={bookings}
      leadOffers={leadOffers}
    />
  );
}
