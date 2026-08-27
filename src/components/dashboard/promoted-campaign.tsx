"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Megaphone, TrendingUp, Eye, MousePointerClick, DollarSign, Pause, Play } from "lucide-react";

interface PromotedCampaign {
  id: string;
  maxCpc: number;
  dailyBudget: number;
  totalSpent: number;
  impressions: number;
  clicks: number;
  status: 'active' | 'paused' | 'budget_exceeded' | 'ended';
}

export function PromotedCampaignCard() {
  const [campaign, setCampaign] = useState<PromotedCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Mock campaign data for demo
    setCampaign({
      id: "promo-1",
      maxCpc: 2.50,
      dailyBudget: 25,
      totalSpent: 150,
      impressions: 1250,
      clicks: 45,
      status: "active",
    });
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-1/4" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-center">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-2 font-medium text-gray-900">Promote Your Profile</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get more visibility in search results with CPC bidding
          </p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Create Campaign
          </button>
        </div>
      </div>
    );
  }

  const ctr = campaign.impressions > 0
    ? ((campaign.clicks / campaign.impressions) * 100).toFixed(1)
    : "0.0";

  const avgCpc = campaign.clicks > 0
    ? (campaign.totalSpent / campaign.clicks).toFixed(2)
    : "0.00";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Campaign Header */}
      <div className="p-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            <span className="font-medium">Promoted Profile</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              campaign.status === "active"
                ? "bg-green-400/20 text-green-100"
                : "bg-gray-400/20 text-gray-100"
            )}>
              {campaign.status === "active" ? "Active" : "Paused"}
            </span>
            <button
              onClick={() => setCampaign({
                ...campaign,
                status: campaign.status === "active" ? "paused" : "active",
              })}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              {campaign.status === "active" ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Eye className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{campaign.impressions.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Impressions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MousePointerClick className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{campaign.clicks}</p>
            <p className="text-xs text-gray-500">Clicks</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{ctr}%</p>
            <p className="text-xs text-gray-500">CTR</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">${campaign.totalSpent}</p>
            <p className="text-xs text-gray-500">Total Spent</p>
          </div>
        </div>
      </div>

      {/* Campaign Settings */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-900">Campaign Settings</h4>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showSettings ? "Hide" : "Edit"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Max CPC Bid</p>
            <p className="font-medium text-gray-900">${campaign.maxCpc.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Daily Budget</p>
            <p className="font-medium text-gray-900">${campaign.dailyBudget}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Avg. CPC</p>
            <p className="font-medium text-gray-900">${avgCpc}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Budget Used Today</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-500 rounded-full"
                  style={{ width: `${Math.min((campaign.totalSpent / (campaign.dailyBudget * 30)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {Math.round((campaign.totalSpent / (campaign.dailyBudget * 30)) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {showSettings && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max CPC Bid ($)
              </label>
              <input
                type="number"
                value={campaign.maxCpc}
                onChange={(e) => setCampaign({
                  ...campaign,
                  maxCpc: parseFloat(e.target.value) || 0,
                })}
                min="0.50"
                max="10"
                step="0.25"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <p className="mt-1 text-xs text-gray-500">Min: $0.50, Max: $10.00</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Budget ($)
              </label>
              <input
                type="number"
                value={campaign.dailyBudget}
                onChange={(e) => setCampaign({
                  ...campaign,
                  dailyBudget: parseFloat(e.target.value) || 0,
                })}
                min="5"
                max="100"
                step="5"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <p className="mt-1 text-xs text-gray-500">Min: $5, Max: $100</p>
            </div>
            <button className="w-full px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 transition-colors">
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
