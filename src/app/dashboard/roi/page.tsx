import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-demo";
import { getWorkerBySlug, getWorkerRoi } from "@/lib/data/repo";
import { WorkerRoiDashboard } from "@/components/dashboard/worker-roi-dashboard";

export const metadata = { title: "ROI Dashboard" };

export default async function RoiPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "worker") redirect("/dashboard");

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) redirect("/dashboard");

  const params = await searchParams;
  const report = await getWorkerRoi(worker.id, { month: params.month });

  return <WorkerRoiDashboard report={report} />;
}
