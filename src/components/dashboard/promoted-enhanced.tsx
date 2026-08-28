"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Target,
  FlaskConical,
  Star,
  TrendingUp,
  Users,
  MapPin,
  Clock,
  Smartphone,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TargetingOption {
  id: string;
  name: string;
  nameAr: string;
  type: "neighborhood" | "category" | "time" | "device";
  enabled: boolean;
  extraCost: number;
}

interface ABVariant {
  id: string;
  name: string;
  headline: string;
  headlineAr: string;
  description: string;
  descriptionAr: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isWinner: boolean;
}

interface QualityScore {
  overall: number;
  profileCompleteness: number;
  responseTime: number;
  reviewQuality: number;
  bookingRate: number;
  factors: string[];
  factorsAr: string[];
  suggestions: string[];
  suggestionsAr: string[];
}

interface CompetitorData {
  avgBid: number;
  topBid: number;
  yourBid: number;
  suggestedBid: number;
  position: number;
  totalCompetitors: number;
}

interface EnhancedPromotedProfile {
  targeting: TargetingOption[];
  abVariants: ABVariant[];
  qualityScore: QualityScore;
  competitorData: CompetitorData;
  estimatedReach: number;
  estimatedClicks: number;
  estimatedCost: number;
}

const TARGETING_ICONS: Record<string, React.ElementType> = {
  neighborhood: MapPin,
  category: Target,
  time: Clock,
  device: Smartphone,
};

export function PromotedEnhancedCard() {
  const [data, setData] = useState<EnhancedPromotedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<
    "targeting" | "abtest" | "quality" | "competitors"
  >("targeting");
  const [expandedTargeting, setExpandedTargeting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/worker/promoted-enhanced");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching enhanced promoted data:", error);
    } finally {
      setLoading(false);
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

  if (!data) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            <span className="font-medium">Enhanced Promotion</span>
          </div>
          <span className="text-sm opacity-80">تحسين الترويج</span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {[
            { id: "targeting" as const, label: "Targeting", icon: MapPin },
            { id: "abtest" as const, label: "A/B Test", icon: FlaskConical },
            { id: "quality" as const, label: "Quality Score", icon: Star },
            { id: "competitors" as const, label: "Competitors", icon: Users },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeSection === section.id
                    ? "border-pink-500 text-pink-600 bg-pink-50"
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
        {/* Targeting */}
        {activeSection === "targeting" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Geographic & Category Targeting
              </h4>
              <button
                onClick={() => setExpandedTargeting(!expandedTargeting)}
                className="text-sm text-pink-600 hover:text-pink-700"
              >
                {expandedTargeting ? "Collapse" : "Expand All"}
              </button>
            </div>

            {/* Targeting Groups */}
            {(["neighborhood", "category", "time", "device"] as const).map(
              (type) => {
                const Icon = TARGETING_ICONS[type];
                const items = data.targeting.filter((t) => t.type === type);
                const enabledCount = items.filter((t) => t.enabled).length;

                return (
                  <div key={type} className="border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between p-3 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-600" />
                        <span className="font-medium text-sm capitalize">
                          {type}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {enabledCount}/{items.length} active
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                item.enabled
                                  ? "bg-pink-500 border-pink-500"
                                  : "border-gray-300"
                              )}
                            >
                              {item.enabled && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <span className="text-sm">{item.name}</span>
                            {item.extraCost > 0 && (
                              <span className="text-xs text-gray-500">
                                +${item.extraCost}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}

        {/* A/B Testing */}
        {activeSection === "abtest" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Ad Creative A/B Testing
            </h4>
            <div className="space-y-3">
              {data.abVariants.map((variant) => (
                <div
                  key={variant.id}
                  className={cn(
                    "p-4 rounded-lg border-2 transition-all",
                    variant.isWinner
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{variant.name}</span>
                      {variant.isWinner && (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                          Winner
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "font-bold",
                        variant.ctr >= 4.5 ? "text-green-600" : "text-gray-600"
                      )}
                    >
                      {variant.ctr}% CTR
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {variant.headline}
                  </p>
                  <p className="text-sm text-gray-600">{variant.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span>{variant.impressions} impressions</span>
                    <span>{variant.clicks} clicks</span>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        variant.isWinner ? "bg-green-500" : "bg-gray-400"
                      )}
                      style={{
                        width: `${(variant.ctr / 5) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quality Score */}
        {activeSection === "quality" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Profile Quality Score
              </h4>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "text-3xl font-bold",
                    data.qualityScore.overall >= 80
                      ? "text-green-600"
                      : data.qualityScore.overall >= 60
                      ? "text-amber-600"
                      : "text-red-600"
                  )}
                >
                  {data.qualityScore.overall}
                </div>
                <span className="text-sm text-gray-500">/100</span>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Profile",
                  value: data.qualityScore.profileCompleteness,
                },
                { label: "Response", value: data.qualityScore.responseTime },
                { label: "Reviews", value: data.qualityScore.reviewQuality },
                { label: "Bookings", value: data.qualityScore.bookingRate },
              ].map((item) => (
                <div key={item.label} className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">{item.label}</div>
                  <div className="text-xl font-bold">{item.value}%</div>
                  <div className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        item.value >= 80
                          ? "bg-green-500"
                          : item.value >= 60
                          ? "bg-amber-500"
                          : "bg-red-500"
                      )}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Factors */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                What's working:
              </h5>
              <div className="space-y-1">
                {data.qualityScore.factors.map((factor, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Improve your score:
              </h5>
              <div className="space-y-2">
                {data.qualityScore.suggestions.map((suggestion, i) => (
                  <div
                    key={i}
                    className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800"
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Competitors */}
        {activeSection === "competitors" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Competitor Insights
            </h4>

            {/* Position */}
            <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-80">Your Position</div>
                  <div className="text-3xl font-bold">
                    #{data.competitorData.position}
                  </div>
                  <div className="text-sm opacity-80">
                    out of {data.competitorData.totalCompetitors} competitors
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm opacity-80">Your CPC Bid</div>
                  <div className="text-2xl font-bold">
                    ${data.competitorData.yourBid.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Bid Comparison */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Average Bid</span>
                <span className="font-medium">
                  ${data.competitorData.avgBid.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Top Bid</span>
                <span className="font-medium text-green-600">
                  ${data.competitorData.topBid.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded">
                <span className="text-sm text-amber-700">
                  Suggested Bid
                </span>
                <span className="font-medium text-amber-700">
                  ${data.competitorData.suggestedBid.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Estimates */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900 mb-3">
                Monthly Estimates (at current bid)
              </h5>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {data.estimatedReach.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Reach</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {data.estimatedClicks}
                  </div>
                  <div className="text-xs text-gray-500">Clicks</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">
                    ${data.estimatedCost}
                  </div>
                  <div className="text-xs text-gray-500">Cost</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
