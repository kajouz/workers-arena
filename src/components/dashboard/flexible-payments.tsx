"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  Wallet,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  ArrowRight,
  Smartphone,
  Landmark,
} from "lucide-react";

interface InstallmentPlan {
  id: string;
  name: string;
  nameAr: string;
  months: number;
  monthlyPayment: number;
  totalAmount: number;
  interestRate: number;
  eligibleProducts: string[];
}

interface WalletTopUp {
  id: string;
  method: string;
  methodAr: string;
  bonus: number;
  minAmount: number;
  maxAmount: number;
  processingTime: string;
  processingTimeAr: string;
  icon: string;
}

interface BusinessAccount {
  tier: string;
  tierAr: string;
  monthlyFee: number;
  features: string[];
  featuresAr: string[];
  bulkDiscount: number;
  creditLimit: number;
  dedicatedSupport: boolean;
}

interface PaymentMethod {
  id: string;
  type: "card" | "wallet" | "bank";
  name: string;
  nameAr: string;
  last4?: string;
  isDefault: boolean;
  expiryDate?: string;
}

interface PaymentOptions {
  installmentPlans: InstallmentPlan[];
  walletTopUps: WalletTopUp[];
  businessAccounts: BusinessAccount[];
  paymentMethods: PaymentMethod[];
  walletBalance: {
    usd: number;
    lbp: number;
  };
}

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  card: CreditCard,
  wallet: Wallet,
  bank: Landmark,
};

export function FlexiblePaymentsCard() {
  const [options, setOptions] = useState<PaymentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<
    "wallet" | "installments" | "business" | "methods"
  >("wallet");
  const [selectedTopUp, setSelectedTopUp] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/worker/payment-options");
      const data = await response.json();
      setOptions(data);
    } catch (error) {
      console.error("Error fetching payment options:", error);
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

  if (!options) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            <span className="font-medium">Payment Options</span>
          </div>
          <span className="text-sm opacity-80">خيارات الدفع</span>
        </div>
      </div>

      {/* Wallet Balance */}
      <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-violet-700">Wallet Balance</div>
            <div className="text-2xl font-bold text-violet-800">
              ${options.walletBalance.usd.toFixed(2)}
            </div>
            <div className="text-sm text-violet-600">
              {options.walletBalance.lbp.toLocaleString()} LBP
            </div>
          </div>
          <button className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors">
            Top Up
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {[
            { id: "wallet" as const, label: "Top Up", icon: Wallet },
            {
              id: "installments" as const,
              label: "Installments",
              icon: Calendar,
            },
            { id: "business" as const, label: "Business", icon: Building2 },
            {
              id: "methods" as const,
              label: "My Cards",
              icon: CreditCard,
            },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeSection === section.id
                    ? "border-violet-500 text-violet-600 bg-violet-50"
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
        {/* Wallet Top Up */}
        {activeSection === "wallet" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Top Up Wallet</h4>
            <div className="space-y-3">
              {options.walletTopUps.map((method) => (
                <div
                  key={method.id}
                  onClick={() => setSelectedTopUp(method.id)}
                  className={cn(
                    "p-4 rounded-lg border-2 cursor-pointer transition-all",
                    selectedTopUp === method.id
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{method.icon}</span>
                      <div>
                        <div className="font-medium">{method.method}</div>
                        <div className="text-sm text-gray-500">
                          {method.methodAr}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {method.bonus > 0 && (
                        <div className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mb-1">
                          +{method.bonus}% bonus
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {method.processingTime}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      placeholder={`$${method.minAmount} - $${method.maxAmount}`}
                      value={selectedTopUp === method.id ? topUpAmount : ""}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="px-4 py-2 bg-violet-500 text-white rounded-lg text-sm hover:bg-violet-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Top Up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installment Plans */}
        {activeSection === "installments" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Pay in Installments
            </h4>
            <p className="text-sm text-gray-600">
              Split large purchases into easy monthly payments with 0% interest
              on 3-month plans.
            </p>
            <div className="space-y-3">
              {options.installmentPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-sm text-gray-500">{plan.nameAr}</div>
                    </div>
                    {plan.interestRate === 0 && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        0% Interest
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-lg font-bold text-violet-600">
                        ${plan.monthlyPayment.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">/month</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{plan.months}</div>
                      <div className="text-xs text-gray-500">months</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        ${plan.totalAmount}
                      </div>
                      <div className="text-xs text-gray-500">total</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-500">
                    Available for: {plan.eligibleProducts.join(", ")}
                  </div>
                  <button className="w-full mt-3 py-2 bg-violet-500 text-white rounded-lg text-sm hover:bg-violet-600 transition-colors">
                    Select Plan
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business Accounts */}
        {activeSection === "business" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Business Accounts
            </h4>
            <p className="text-sm text-gray-600">
              For companies managing multiple workers. Get bulk discounts and
              dedicated support.
            </p>
            <div className="space-y-3">
              {options.businessAccounts.map((account) => (
                <div
                  key={account.tier}
                  className={cn(
                    "p-4 rounded-lg border-2",
                    account.tier === "Business"
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{account.tier}</div>
                      <div className="text-sm text-gray-500">
                        {account.tierAr}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-violet-600">
                        ${account.monthlyFee}
                      </div>
                      <div className="text-xs text-gray-500">/month</div>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-4">
                    {account.features.map((feature, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <Check className="w-4 h-4 text-violet-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-gray-600">
                      Bulk Discount:
                    </span>
                    <span className="font-medium text-green-600">
                      {account.bulkDiscount}% off credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-gray-600">Credit Limit:</span>
                    <span className="font-medium">
                      ${account.creditLimit.toLocaleString()}
                    </span>
                  </div>
                  {account.dedicatedSupport && (
                    <div className="flex items-center gap-2 text-sm text-violet-600">
                      <Check className="w-4 h-4" />
                      Dedicated Account Manager
                    </div>
                  )}
                  <button
                    className={cn(
                      "w-full mt-3 py-2 rounded-lg text-sm transition-colors",
                      account.tier === "Business"
                        ? "bg-violet-500 text-white hover:bg-violet-600"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    )}
                  >
                    {account.tier === "Business" ? "Current Plan" : "Upgrade"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Methods */}
        {activeSection === "methods" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">
                Saved Payment Methods
              </h4>
              <button className="text-sm text-violet-600 hover:text-violet-700">
                + Add New
              </button>
            </div>
            <div className="space-y-3">
              {options.paymentMethods.map((method) => {
                const Icon = PAYMENT_ICONS[method.type];
                return (
                  <div
                    key={method.id}
                    className={cn(
                      "p-4 rounded-lg border-2",
                      method.isDefault
                        ? "border-violet-500 bg-violet-50"
                        : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Icon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <div className="font-medium">{method.name}</div>
                          <div className="text-sm text-gray-500">
                            {method.nameAr}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {method.isDefault && (
                          <span className="px-2 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded">
                            Default
                          </span>
                        )}
                        {method.expiryDate && (
                          <span className="text-sm text-gray-500">
                            Exp: {method.expiryDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
