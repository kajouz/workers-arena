"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Coins, ShoppingCart, History, AlertCircle } from "lucide-react";

interface CreditBalance {
  balance: number;
  totalPurchased: number;
  totalSpent: number;
  totalRefunded: number;
}

interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  bonusCredits: number;
  popular: boolean;
}

export function CreditBalanceCard() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPackages, setShowPackages] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [balanceRes, packagesRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/packages"),
      ]);

      const balanceData = await balanceRes.json();
      const packagesData = await packagesRes.json();

      setBalance(balanceData.balance);
      setPackages(packagesData.packages || []);
    } catch (error) {
      console.error("Error fetching credit data:", error);
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

  if (!balance) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Balance Header */}
      <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            <span className="font-medium">Lead Credits</span>
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
          <p className="text-sm opacity-90">credits available</p>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg font-semibold text-gray-900">{balance.totalPurchased}</p>
          <p className="text-xs text-gray-500">Purchased</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{balance.totalSpent}</p>
          <p className="text-xs text-gray-500">Spent</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{balance.totalRefunded}</p>
          <p className="text-xs text-gray-500">Refunded</p>
        </div>
      </div>

      {/* Low Balance Warning */}
      {balance.balance < 5 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-700">
              Low credits! Buy more to keep sending leads to customers.
            </p>
          </div>
        </div>
      )}

      {/* Purchase Packages */}
      {showPackages && (
        <div className="p-4 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Buy Credit Packages</h4>
          <div className="grid grid-cols-2 gap-3">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                className={cn(
                  "p-3 rounded-lg border-2 text-left transition-all hover:border-orange-500",
                  pkg.popular
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                {pkg.popular && (
                  <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {pkg.credits + pkg.bonusCredits} Credits
                </p>
                <p className="text-sm text-gray-500">
                  ${pkg.price} (${(pkg.price / (pkg.credits + pkg.bonusCredits)).toFixed(2)}/credit)
                </p>
                {pkg.bonusCredits > 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    +{pkg.bonusCredits} bonus credits!
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
