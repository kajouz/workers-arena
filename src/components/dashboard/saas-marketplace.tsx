"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Package, Check, Star, ExternalLink } from "lucide-react";

interface SaasTool {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  featuresAr: string[];
  category: string;
  trialEnabled: boolean;
  trialDays: number;
}

export function SaasMarketplace() {
  const [tools, setTools] = useState<SaasTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      const response = await fetch("/api/saas/tools");
      const data = await response.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error("Error fetching SaaS tools:", error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: "all", name: "All Tools", nameAr: "جميع الأدوات" },
    { id: "invoicing", name: "Invoicing", nameAr: "الفوترة" },
    { id: "crm", name: "CRM", nameAr: "إدارة العلاقات" },
    { id: "analytics", name: "Analytics", nameAr: "التحليلات" },
    { id: "team", name: "Team", nameAr: "الفريق" },
    { id: "marketing", name: "Marketing", nameAr: "التسويق" },
  ];

  const filteredTools = selectedCategory === "all"
    ? tools
    : tools.filter(t => t.category === selectedCategory);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-1/4" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <span className="font-medium">Premium Tools</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={cn(
                "px-3 py-1 rounded-lg text-sm transition-colors",
                billingPeriod === "monthly"
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={cn(
                "px-3 py-1 rounded-lg text-sm transition-colors",
                billingPeriod === "annual"
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              )}
            >
              Annual (Save 17%)
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm opacity-90">
          Unlock powerful tools to grow your business
        </p>
      </div>

      {/* Category Filter */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors",
                selectedCategory === cat.id
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tools Grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTools.map((tool) => (
          <div
            key={tool.id}
            className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{tool.name}</h3>
                <p className="text-sm text-gray-500">{tool.nameAr}</p>
              </div>
              {tool.trialEnabled && (
                <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  {tool.trialDays}d Free Trial
                </span>
              )}
            </div>
            
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {tool.description}
            </p>

            <div className="mt-3">
              <p className="text-2xl font-bold text-gray-900">
                ${billingPeriod === "monthly" ? tool.monthlyPrice : (tool.annualPrice / 12).toFixed(2)}
                <span className="text-sm font-normal text-gray-500">/mo</span>
              </p>
              {billingPeriod === "annual" && (
                <p className="text-xs text-green-600">
                  ${tool.annualPrice}/year (Save ${(tool.monthlyPrice * 12 - tool.annualPrice).toFixed(0)})
                </p>
              )}
            </div>

            <div className="mt-3 space-y-1">
              {tool.features.slice(0, 3).map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="w-4 h-4 text-green-500" />
                  {feature}
                </div>
              ))}
              {tool.features.length > 3 && (
                <p className="text-xs text-gray-500">
                  +{tool.features.length - 3} more features
                </p>
              )}
            </div>

            <button className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
              {tool.trialEnabled ? "Start Free Trial" : "Subscribe Now"}
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {filteredTools.length === 0 && (
        <div className="p-8 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-2 text-gray-500">No tools in this category</p>
        </div>
      )}
    </div>
  );
}
