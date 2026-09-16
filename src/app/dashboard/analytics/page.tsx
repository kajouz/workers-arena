import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerBookings, getWorkerLeadOffers } from "@/lib/data/repo";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";

export const metadata = { title: "Analytics | Dashboard" };

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session || session.role !== "worker") redirect("/auth/login");

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) redirect("/dashboard");

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
