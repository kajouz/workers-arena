"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  Copy,
  Share2,
  Trophy,
  Gift,
  TrendingUp,
  Award,
  ChevronRight,
  Check,
  ExternalLink,
} from "lucide-react";

interface ReferralEarnings {
  totalEarned: number;
  thisMonth: number;
  lastMonth: number;
  pending: number;
  history: {
    date: string;
    description: string;
    descriptionAr: string;
    credits: number;
  }[];
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  nameAr: string;
  referrals: number;
  earned: number;
  isCurrentUser?: boolean;
}

interface ReferralProgram {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  activeReferred: number;
  earnings: ReferralEarnings;
  leaderboard: LeaderboardEntry[];
  bonusRules: {
    action: string;
    actionAr: string;
    reward: number;
    description: string;
    descriptionAr: string;
  }[];
  tierBenefits: {
    tier: string;
    tierAr: string;
    minReferrals: number;
    bonusMultiplier: number;
    perks: string[];
    perksAr: string[];
  }[];
}

export function ReferralRevenueCard() {
  const [program, setProgram] = useState<ReferralProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<
    "overview" | "leaderboard" | "rules" | "tiers"
  >("overview");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/worker/referrals");
      const data = await response.json();
      setProgram(data);
    } catch (error) {
      console.error("Error fetching referral data:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = async () => {
    if (!program) return;
    try {
      await navigator.clipboard.writeText(program.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const shareReferralLink = async () => {
    if (!program) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join WorkersArena",
          text: "Join WorkersArena using my referral link and earn bonus credits!",
          url: program.referralLink,
        });
      } catch (error) {
        console.error("Failed to share:", error);
      }
    } else {
      copyReferralCode();
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!program) {
    return null;
  }

  const currentTier = program.tierBenefits.find(
    (t) => program.totalReferred >= t.minReferrals
  );
  const nextTier = program.tierBenefits.find(
    (t) => t.minReferrals > program.totalReferred
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span className="font-medium">Referral Program</span>
          </div>
          <span className="text-sm opacity-80">برنامج الإحالات</span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {[
            { id: "overview" as const, label: "Overview", icon: TrendingUp },
            { id: "leaderboard" as const, label: "Leaderboard", icon: Trophy },
            { id: "rules" as const, label: "How to Earn", icon: Gift },
            { id: "tiers" as const, label: "Tiers", icon: Award },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeSection === section.id
                    ? "border-emerald-500 text-emerald-600 bg-emerald-50"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {/* Overview */}
        {activeSection === "overview" && (
          <div className="space-y-4">
            {/* Referral Code */}
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
              <div className="text-sm text-emerald-700 mb-2">
                Your Referral Code
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 px-4 py-3 bg-white border border-emerald-300 rounded-lg text-center">
                  <span className="text-2xl font-mono font-bold text-emerald-700">
                    {program.referralCode}
                  </span>
                </div>
                <button
                  onClick={copyReferralCode}
                  className={cn(
                    "p-3 rounded-lg transition-colors",
                    copied
                      ? "bg-green-500 text-white"
                      : "bg-emerald-500 text-white hover:bg-emerald-600"
                  )}
                >
                  {copied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={shareReferralLink}
                  className="p-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
                <ExternalLink className="w-3 h-3" />
                <span className="truncate">{program.referralLink}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-emerald-600">
                  {program.totalReferred}
                </div>
                <div className="text-xs text-emerald-600">Total Referred</div>
              </div>
              <div className="p-3 bg-teal-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-teal-600">
                  {program.activeReferred}
                </div>
                <div className="text-xs text-teal-600">Active Referred</div>
              </div>
            </div>

            {/* Earnings */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-gray-900">
                  Earnings Summary
                </span>
                <span className="text-2xl font-bold text-emerald-600">
                  {program.earnings.totalEarned} credits
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">This Month:</span>
                  <span className="ml-2 font-medium">
                    {program.earnings.thisMonth}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Last Month:</span>
                  <span className="ml-2 font-medium">
                    {program.earnings.lastMonth}
                  </span>
                </div>
              </div>
            </div>

            {/* Current Tier */}
            {currentTier && (
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-amber-700">
                      Current Tier
                    </div>
                    <div className="text-lg font-bold text-amber-800">
                      {currentTier.tier} ({currentTier.bonusMultiplier}x bonus)
                    </div>
                  </div>
                  {nextTier && (
                    <div className="text-right">
                      <div className="text-xs text-amber-600">
                        {nextTier.minReferrals - program.totalReferred} more
                        referrals to {nextTier.tier}
                      </div>
                      <div className="w-24 h-2 bg-amber-200 rounded-full mt-1">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{
                            width: `${
                              (program.totalReferred / nextTier.minReferrals) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        {activeSection === "leaderboard" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Top Referrers This Month
            </h4>
            <div className="space-y-2">
              {program.leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    entry.isCurrentUser
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-gray-50"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold",
                      entry.rank === 1
                        ? "bg-yellow-400 text-yellow-900"
                        : entry.rank === 2
                        ? "bg-gray-300 text-gray-700"
                        : entry.rank === 3
                        ? "bg-amber-600 text-amber-100"
                        : "bg-gray-200 text-gray-600"
                    )}
                  >
                    {entry.rank}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-xs text-gray-500">
                      {entry.nameAr}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-600">
                      {entry.referrals} referrals
                    </div>
                    <div className="text-xs text-gray-500">
                      {entry.earned} credits earned
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rules */}
        {activeSection === "rules" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              How to Earn Referral Credits
            </h4>
            <div className="space-y-3">
              {program.bonusRules.map((rule, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {rule.action}
                    </span>
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded">
                      +{rule.reward} credits
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{rule.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {rule.descriptionAr}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tiers */}
        {activeSection === "tiers" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Referral Tier Benefits
            </h4>
            <div className="space-y-3">
              {program.tierBenefits.map((tier) => (
                <div
                  key={tier.tier}
                  className={cn(
                    "p-4 rounded-lg border-2",
                    currentTier?.tier === tier.tier
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{tier.tier}</span>
                      {currentTier?.tier === tier.tier && (
                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-emerald-600">
                      {tier.bonusMultiplier}x bonus
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {tier.minReferrals}+ referrals required
                  </div>
                  <ul className="space-y-1">
                    {tier.perks.map((perk, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <Check className="w-4 h-4 text-emerald-500" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
