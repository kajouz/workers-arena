import type { Metadata } from "next";
import { getSession } from "@/lib/auth-demo";
import { Link } from "@/components/i18n/link";
import { RevenueSettingsDashboard } from "@/components/admin/revenue-settings";
import { FeeRulesPanel } from "@/components/admin/fee-rules-panel";
import { PromotionsPanel } from "@/components/admin/promotions-panel";
import { LeadMarketPanel } from "@/components/admin/lead-market-panel";
import { SurgeReportCard } from "@/components/admin/surge-report-card";
import { ReferralConfigPanel } from "@/components/admin/referral-config-panel";
import { PlanCatalogPanel } from "@/components/admin/plan-catalog-panel";
import {
  feePromotionAttribution,
  listFeeRuleSetVersions,
  listFeeSnapshots,
  loadActiveFeeRuleSet,
} from "@/lib/data/fee-rules-store";
import { listCreditLedger } from "@/lib/data/credit-ledger";
import { listLeadRebates } from "@/lib/data/lead-rebate";
import { listLeadRefunds } from "@/lib/data/lead-refund-store";
import { computeSurgeReport } from "@/lib/data/surge-report";
import { getAllLeadRatings } from "@/lib/data/lead-market-store";
import { loadPlanCatalog } from "@/lib/data/fee-rules-store";
import { getCategories, listLeadOffers } from "@/lib/data/repo";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata: Metadata = {
  title: "Revenue Settings | Admin",
  description: "Configure and manage all revenue streams for WorkersArena",
};

export default async function RevenueSettingsPage() {
  const session = await getSession();
  
  if (!session || session.role !== "admin") {
    return await localeRedirect("/auth/login");
  }

  // §5/§6 — the live take-rate configuration, its version history and the most
  // recent fee snapshots, loaded server-side (the panel edits the first and
  // audits the last two). §24 adds the campaigns, their snapshot-derived
  // attribution and the credit ledger the bonuses land in.
  const [feeRuleSet, feeVersions, feeSnapshots, attribution, creditLedger, categories, leadOffers, leadRebates, refundRequests, planCatalog] =
    await Promise.all([
      loadActiveFeeRuleSet(),
      listFeeRuleSetVersions(5),
      listFeeSnapshots(50),
      feePromotionAttribution(),
      listCreditLedger(50),
      getCategories(),
      listLeadOffers(500),
      listLeadRebates(50),
      listLeadRefunds(),
      loadPlanCatalog(),
    ]);

  // Phase 2 — the 30-day emergency-surge evaluation, computed server-side
  // from the same offers/refunds the lead-market panel audits.
  const surgeReport = computeSurgeReport(leadOffers, refundRequests, { windowDays: 30 });

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
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
        <LeadMarketPanel ruleSet={feeRuleSet} offers={leadOffers} credits={creditLedger} rebates={leadRebates} ratings={getAllLeadRatings()} refundRequests={refundRequests} surgeReport={surgeReport} />
        {/* Phase 2 — measure the 1.5× emergency premium before tuning it. */}
        <SurgeReportCard report={surgeReport} />
        <ReferralConfigPanel ruleSet={feeRuleSet} />
        {/* §5 plans — admin-editable subscription pricing (overrides over the shipped catalog). */}
        <PlanCatalogPanel
          initial={{
            plans: planCatalog.plans,
            trialDays: planCatalog.trialDays,
            trialDaysByPlan: planCatalog.trialDaysByPlan,
            categoryTiers: planCatalog.categoryTiers,
          }}
        />
        <p className="text-xs text-ink-500">
          <Link href="/admin/analytics/lead-quality" className="underline hover:text-ink-700">
            View lead quality analytics →
          </Link>
        </p>
        <RevenueSettingsDashboard />
      </div>
    </div>
  );
}
