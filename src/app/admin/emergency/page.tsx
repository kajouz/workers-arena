import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { EmergencyDashboard } from "@/components/dashboard/emergency-dashboard";

export const metadata = { title: "Emergency Dashboard — Admin" };

export default async function EmergencyPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  return <EmergencyDashboard />;
}
