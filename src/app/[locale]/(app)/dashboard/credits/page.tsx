import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { Coins, ArrowLeft } from "lucide-react";
import { Link } from "@/components/i18n/link";
import { CreditBalanceCard } from "@/components/dashboard/credit-balance";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata: Metadata = {
  title: "Platform Credits",
};

const DEMO_WORKER_SLUG = "khaled-al-harbi-plumbing";

export default async function CreditsPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/");
  if (session.role !== "worker" && session.role !== "admin") return await localeRedirect("/dashboard");

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Platform Credits</h1>
        </div>

        <p className="text-sm text-ink-500 dark:text-ink-400">
          Credits let you buy qualified leads from the marketplace. Each credit equals $1.
          Purchase via OMT or Whish — admin confirms, credits granted instantly.
        </p>

        <CreditBalanceCard />

        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4">
          <h2 className="font-semibold text-ink-900 dark:text-ink-50 mb-2">How credits work</h2>
          <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-300">
            <li className="flex gap-2">
              <span className="text-amber-500 font-bold">1.</span>
              Browse qualified leads at{" "}
              <Link href="/dashboard/leads" className="text-orange-600 hover:underline">
                /dashboard/leads
              </Link>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 font-bold">2.</span>
              Buy a lead with credits — the price depends on the lead grade (bronze $5, silver $9, gold $20, emergency $35)
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 font-bold">3.</span>
              When the job completes, the lead cost is rebated against the platform fee
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500 font-bold">4.</span>
              Rate the lead after the job — your feedback adjusts future pricing
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
