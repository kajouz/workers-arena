"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, Award, ArrowRight } from "lucide-react";

interface CommissionTier {
  id: string;
  name: string;
  nameAr: string;
  minBillings: number;
  maxBillings: number;
  ratePercent: number;
}

interface CommissionInfo {
  tier: CommissionTier;
  lifetimeBillings: number;
  allTiers: CommissionTier[];
}

export function CommissionTierCard() {
  const [info, setInfo] = useState<CommissionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommissionInfo();
  }, []);

  const fetchCommissionInfo = async () => {
    try {
      const response = await fetch("/api/commission-tier?all=true");
      const data = await response.json();
      
      if (data.tiers) {
        // Mock lifetime billings for demo
        const lifetimeBillings = 12500;
        const currentTier = data.tiers.find((t: CommissionTier) => 
          lifetimeBillings >= t.minBillings && lifetimeBillings <= t.maxBillings
        ) || data.tiers[0];

        setInfo({
          tier: currentTier,
          lifetimeBillings,
          allTiers: data.tiers,
        });
      }
    } catch (error) {
      console.error("Error fetching commission info:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-1/4" />
      </div>
    );
  }

  if (!info) {
    return null;
  }

  const currentIndex = info.allTiers.findIndex(t => t.id === info.tier.id);
  const nextTier = info.allTiers[currentIndex + 1];
  const progressToNext = nextTier
    ? ((info.lifetimeBillings - info.tier.minBillings) / (nextTier.minBillings - info.tier.minBillings)) * 100
    : 100;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Current Tier */}
      <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            <span className="font-medium">Commission Tier</span>
          </div>
          <span className="text-sm opacity-90">
            {info.tier.nameAr}
          </span>
        </div>
        <div className="mt-3">
          <p className="text-3xl font-bold">{info.tier.ratePercent}%</p>
          <p className="text-sm opacity-90">current commission rate</p>
        </div>
      </div>

      {/* Progress to Next Tier */}
      {nextTier && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Progress to {nextTier.name}</p>
            <p className="text-sm font-medium text-gray-900">
              ${(nextTier.minBillings - info.lifetimeBillings).toLocaleString()} to go
            </p>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
              style={{ width: `${Math.min(progressToNext, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-500">
              ${info.tier.minBillings.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              ${nextTier.minBillings.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Lifetime Billings */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Lifetime Billings</p>
            <p className="text-xl font-bold text-gray-900">
              ${info.lifetimeBillings.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">You save</p>
            <p className="text-xl font-bold text-green-600">
              {(7 - info.tier.ratePercent)}%
            </p>
          </div>
        </div>
      </div>

      {/* All Tiers */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-sm font-medium text-gray-700 mb-3">All Tiers</p>
        <div className="space-y-2">
          {info.allTiers.map((tier, index) => (
            <div
              key={tier.id}
              className={cn(
                "flex items-center justify-between p-2 rounded-lg",
                tier.id === info.tier.id
                  ? "bg-emerald-100 border border-emerald-200"
                  : "bg-white"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  tier.id === info.tier.id
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-200 text-gray-600"
                )}>
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{tier.name}</p>
                  <p className="text-xs text-gray-500">
                    ${tier.minBillings.toLocaleString()}+
                  </p>
                </div>
              </div>
              <p className={cn(
                "text-sm font-bold",
                tier.id === info.tier.id ? "text-emerald-600" : "text-gray-600"
              )}>
                {tier.ratePercent}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
