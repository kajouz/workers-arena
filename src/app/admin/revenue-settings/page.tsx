import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { redirect } from "next/navigation";
import { RevenueSettingsDashboard } from "@/components/admin/revenue-settings";
import { FeeRulesPanel } from "@/components/admin/fee-rules-panel";
import { PromotionsPanel } from "@/components/admin/promotions-panel";
import { LeadMarketPanel } from "@/components/admin/lead-market-panel";
import {
  feePromotionAttribution,
  listFeeRuleSetVersions,
  listFeeSnapshots,
  loadActiveFeeRuleSet,
} from "@/lib/data/fee-rules-store";
import { listCreditLedger } from "@/lib/data/credit-ledger";
import { listLeadRebates } from "@/lib/data/lead-rebate";
import { getAllLeadRatings } from "@/lib/data/lead-market-store";
import { getCategories, listLeadOffers } from "@/lib/data/repo";

export const metadata: Metadata = {
  title: "Revenue Settings | Admin",
  description: "Configure and manage all revenue streams for WorkersArena",
};

export default async function RevenueSettingsPage() {
  const session = await getSession();
  
  if (!session || session.role !== "admin") {
    redirect("/auth/login");
  }

  // §5/§6 — the live take-rate configuration, its version history and the most
  // recent fee snapshots, loaded server-side (the panel edits the first and
  // audits the last two). §24 adds the campaigns, their snapshot-derived
  // attribution and the credit ledger the bonuses land in.
  const [feeRuleSet, feeVersions, feeSnapshots, attribution, creditLedger, categories, leadOffers, leadRebates] =
    await Promise.all([
      loadActiveFeeRuleSet(),
      listFeeRuleSetVersions(5),
      listFeeSnapshots(50),
      feePromotionAttribution(),
      listCreditLedger(50),
      getCategories(),
      listLeadOffers(30),
      listLeadRebates(50),
    ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <FeeRulesPanel ruleSet={feeRuleSet} versions={feeVersions} snapshots={feeSnapshots.slice(0, 6)} />
        <PromotionsPanel
          ruleSet={feeRuleSet}
          attribution={attribution}
          snapshots={feeSnapshots}
          grants={creditLedger}
          categories={categories.map((c) => ({ slug: c.slug, nameEn: c.nameEn }))}
        />
        {/* §7–§10 — the qualified lead marketplace: its policy, the offers it
            created and the credit ledger its purchases debit. */}
        <LeadMarketPanel ruleSet={feeRuleSet} offers={leadOffers} credits={creditLedger} rebates={leadRebates} ratings={getAllLeadRatings()} />
        <p className="text-xs text-ink-500">
          <a href="/admin/analytics/lead-quality" className="underline hover:text-ink-700">
            View lead quality analytics →
          </a>
        </p>
        <RevenueSettingsDashboard />
      </div>
    </div>
  );
}
