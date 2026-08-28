"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Coins, Zap, TrendingUp, Package, Megaphone, ChevronDown, ChevronRight, Award, Percent, BarChart3, Bell, Target, Users, CreditCard, Trophy, Smartphone } from "lucide-react";
import { CreditBalanceCard } from "./credit-balance";
import { TokenWalletCard } from "./token-wallet";
import { CommissionTierCard } from "./commission-tier";
import { SaasMarketplace } from "./saas-marketplace";
import { PromotedCampaignCard } from "./promoted-campaign";
import { RevenueAnalyticsCard } from "./revenue-analytics";
import { SmartNotificationsCard } from "./smart-notifications";
import { PromotedEnhancedCard } from "./promoted-enhanced";
import { ReferralRevenueCard } from "./referral-revenue";
import { FlexiblePaymentsCard } from "./flexible-payments";
import { GamificationCard } from "./gamification-achievements";
import { MobileFeaturesCard } from "./mobile-features";

type Tab = "overview" | "credits" | "tokens" | "commission" | "tools" | "promoted" | "analytics" | "notifications" | "enhanced-promo" | "referrals" | "payments" | "gamification" | "mobile";

const TABS: { id: Tab; label: string; labelAr: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", labelAr: "نظرة عامة", icon: TrendingUp },
  { id: "credits", label: "Lead Credits", labelAr: "رصيد العملاء", icon: Coins },
  { id: "tokens", label: "Tokens", labelAr: "الرموز", icon: Zap },
  { id: "commission", label: "Commission", labelAr: " العمولة", icon: Percent },
  { id: "analytics", label: "Analytics", labelAr: "التحليلات", icon: BarChart3 },
  { id: "notifications", label: "Alerts", labelAr: "التنبيهات", icon: Bell },
  { id: "enhanced-promo", label: "Enhanced Promo", labelAr: "ترويج متقدم", icon: Target },
  { id: "referrals", label: "Referrals", labelAr: "الإحالات", icon: Users },
  { id: "payments", label: "Payments", labelAr: "المدفوعات", icon: CreditCard },
  { id: "gamification", label: "Rewards", labelAr: "المكافآت", icon: Trophy },
  { id: "mobile", label: "Mobile", labelAr: "الهاتف", icon: Smartphone },
  { id: "tools", label: "Premium Tools", labelAr: "الأدوات المتقدمة", icon: Package },
  { id: "promoted", label: "Promote", labelAr: "الترويج", icon: Megaphone },
];

export function WorkerRevenueTools() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 bg-blue-50"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CreditBalanceCard />
            <TokenWalletCard />
            <CommissionTierCard />
            <PromotedCampaignCard />
          </div>
        )}

        {activeTab === "credits" && <CreditBalanceCard />}

        {activeTab === "tokens" && <TokenWalletCard />}

        {activeTab === "commission" && <CommissionTierCard />}

        {activeTab === "analytics" && <RevenueAnalyticsCard />}

        {activeTab === "notifications" && <SmartNotificationsCard />}

        {activeTab === "enhanced-promo" && <PromotedEnhancedCard />}

        {activeTab === "referrals" && <ReferralRevenueCard />}

        {activeTab === "payments" && <FlexiblePaymentsCard />}

        {activeTab === "gamification" && <GamificationCard />}

        {activeTab === "mobile" && <MobileFeaturesCard />}

        {activeTab === "tools" && <SaasMarketplace />}

        {activeTab === "promoted" && <PromotedCampaignCard />}
      </div>
    </div>
  );
}
