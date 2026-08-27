import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { redirect } from "next/navigation";
import { RevenueSettingsDashboard } from "@/components/admin/revenue-settings";

export const metadata: Metadata = {
  title: "Revenue Settings | Admin",
  description: "Configure and manage all revenue streams for WorkersArena",
};

export default async function RevenueSettingsPage() {
  const session = await getSession();
  
  if (!session || session.role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RevenueSettingsDashboard />
      </div>
    </div>
  );
}
