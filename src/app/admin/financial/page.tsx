import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { FinancialAnalysis } from "@/components/dashboard/financial-analysis";

export const metadata = { title: "Financial Analysis — Admin" };

export default async function FinancialAnalysisPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" /> Back to Dashboard
        </Link>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
          <Calculator className="size-6 text-brand-500" /> Financial Analysis
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Platform economics, unit economics, and contribution margin analysis
        </p>
      </div>

      <FinancialAnalysis />
    </div>
  );
}
