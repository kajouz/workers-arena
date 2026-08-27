"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Zap, ShoppingCart, Clock, Gift } from "lucide-react";

interface TokenBalance {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalPurchased: number;
  totalExpired: number;
  expiresAt: string;
}

interface TokenPackage {
  id: string;
  tokens: number;
  price: number;
  bonusTokens: number;
  popular: boolean;
}

export function TokenWalletCard() {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPackages, setShowPackages] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [balanceRes, packagesRes] = await Promise.all([
        fetch("/api/tokens/balance"),
        fetch("/api/tokens/packages"),
      ]);

      const balanceData = await balanceRes.json();
      const packagesData = await packagesRes.json();

      setBalance(balanceData.balance);
      setPackages(packagesData.packages || []);
    } catch (error) {
      console.error("Error fetching token data:", error);
    } finally {
      setLoading(false);
    }
  };

  const daysUntilExpiry = balance?.expiresAt
    ? Math.max(0, Math.ceil((new Date(balance.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-1/4" />
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Balance Header */}
      <div className="p-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <span className="font-medium">Application Tokens</span>
          </div>
          <button
            onClick={() => setShowPackages(!showPackages)}
            className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded-lg text-sm hover:bg-white/30 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            Buy More
          </button>
        </div>
        <div className="mt-3">
          <p className="text-3xl font-bold">{balance.balance}</p>
          <p className="text-sm opacity-90">tokens available</p>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-100 rounded">
            <Gift className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{balance.totalEarned}</p>
            <p className="text-xs text-gray-500">Earned</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 rounded">
            <Zap className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{balance.totalSpent}</p>
            <p className="text-xs text-gray-500">Spent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-100 rounded">
            <ShoppingCart className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{balance.totalPurchased}</p>
            <p className="text-xs text-gray-500">Purchased</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-100 rounded">
            <Clock className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{balance.totalExpired}</p>
            <p className="text-xs text-gray-500">Expired</p>
          </div>
        </div>
      </div>

      {/* Expiry Warning */}
      {daysUntilExpiry > 0 && daysUntilExpiry <= 30 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Clock className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-700">
              {daysUntilExpiry} days until tokens expire. Use them before they&apos;re gone!
            </p>
          </div>
        </div>
      )}

      {/* How to Earn */}
      <div className="px-4 pb-4">
        <p className="text-xs font-medium text-gray-500 mb-2">How to earn tokens:</p>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">• Complete a booking: +2 tokens</p>
          <p className="text-xs text-gray-600">• Get a 5-star review: +1 token</p>
          <p className="text-xs text-gray-600">• Monthly activity bonus: +5 tokens</p>
        </div>
      </div>

      {/* Purchase Packages */}
      {showPackages && (
        <div className="p-4 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Buy Token Packages</h4>
          <div className="grid grid-cols-3 gap-3">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                className={cn(
                  "p-3 rounded-lg border-2 text-left transition-all hover:border-purple-500",
                  pkg.popular
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                {pkg.popular && (
                  <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {pkg.tokens + pkg.bonusTokens}
                </p>
                <p className="text-sm text-gray-500">
                  ${pkg.price}
                </p>
                {pkg.bonusTokens > 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    +{pkg.bonusTokens} bonus!
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
