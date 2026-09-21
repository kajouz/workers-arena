import { getSession } from "@/lib/auth-demo";
import { EmergencyDashboard } from "@/components/dashboard/emergency-dashboard";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Emergency Dashboard — Admin" };

export default async function EmergencyPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");

  return <EmergencyDashboard />;
}
