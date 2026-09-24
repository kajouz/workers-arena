"use client";

import { useState, useEffect } from "react";
import { cn, formatDate } from "@/lib/utils";
import {
  Share2,
  Copy,
  Gift,
  Users,
  CheckCircle,
  Clock,
  DollarSign,
  Award,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  ExternalLink,
  TrendingUp,
  Star,
} from "lucide-react";

interface ReferralCode {
  id: string;
  code: string;
  userId: string;
  userName: string;
  createdAt: string;
  isActive: boolean;
}

interface Referral {
  id: string;
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  status: "pending" | "completed" | "rewarded";
  createdAt: string;
  completedAt?: string;
  rewardedAt?: string;
  rewardAmount?: number;
  rewardType: "credit" | "discount" | "premium_days";
}

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  currentBalance: number;
  referralCode: string;
  referralLink: string;
}

interface ReferralReward {
  id: string;
  type: "credit" | "discount" | "premium_days";
  amount: number;
  description: string;
  descriptionAr?: string;
  minReferrals: number;
}

const REWARD_TIERS: ReferralReward[] = [
  {
    id: "1",
    type: "credit",
    amount: 10,
    description: "10 USD credit for each successful referral",
    descriptionAr: "10 دولار ائتمان لكل إحالة ناجحة",
    minReferrals: 1,
  },
  {
    id: "2",
    type: "discount",
    amount: 20,
    description: "20% discount on next subscription renewal",
    descriptionAr: "خصم 20% على تجديد الاشتراك التالي",
    minReferrals: 3,
  },
  {
    id: "3",
    type: "premium_days",
    amount: 30,
    description: "30 days free Premium upgrade",
    descriptionAr: "30 يوم ترقية مجانية إلى Premium",
    minReferrals: 5,
  },
  {
    id: "4",
    type: "credit",
    amount: 50,
    description: "50 USD bonus after 10 referrals",
    descriptionAr: "50 دولار مكافأة بعد 10 إحالات",
    minReferrals: 10,
  },
];

export function ReferralSystem({ locale = "en" }: { locale?: "en" | "ar" }) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "rewards">("overview");

  useEffect(() => {
    // Mock data
    setStats({
      totalReferrals: 12,
      completedReferrals: 8,
      pendingReferrals: 4,
      totalRewardsEarned: 180,
      currentBalance: 120,
      referralCode: "KHALED2025",
      referralLink: "https://workers-arena.vercel.app/ref/KHALED2025",
    });

    setReferrals([
      {
        id: "1",
        referrerId: "u1",
        referrerName: "Khaled Al Harbi",
        referredId: "u2",
        referredName: "Ali Hassan",
        referredEmail: "ali@example.com",
        status: "rewarded",
        createdAt: "2025-01-10T10:00:00Z",
        completedAt: "2025-01-12T14:00:00Z",
        rewardedAt: "2025-01-12T14:30:00Z",
        rewardAmount: 10,
        rewardType: "credit",
      },
      {
        id: "2",
        referrerId: "u1",
        referrerName: "Khaled Al Harbi",
        referredId: "u3",
        referredName: "Omar Al Mutairi",
        referredEmail: "omar@example.com",
        status: "rewarded",
        createdAt: "2025-01-08T09:00:00Z",
        completedAt: "2025-01-09T11:00:00Z",
        rewardedAt: "2025-01-09T11:30:00Z",
        rewardAmount: 10,
        rewardType: "credit",
      },
      {
        id: "3",
        referrerId: "u1",
        referrerName: "Khaled Al Harbi",
        referredId: "u4",
        referredName: "Bilal Mansour",
        referredEmail: "bilal@example.com",
        status: "completed",
        createdAt: "2025-01-15T08:00:00Z",
        completedAt: "2025-01-16T10:00:00Z",
        rewardType: "credit",
      },
      {
        id: "4",
        referrerId: "u1",
        referrerName: "Khaled Al Harbi",
        referredId: "u5",
        referredName: "Anas Barakat",
        referredEmail: "anas@example.com",
        status: "pending",
        createdAt: "2025-01-17T14:00:00Z",
        rewardType: "credit",
      },
    ]);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareVia = (platform: "whatsapp" | "email" | "twitter") => {
    if (!stats) return;
    const message = locale === "ar"
      ? "انضم إلى WorkersArena واستخدم رميزي للحصول على مكافأة: " + stats.referralCode
      : "Join WorkersArena and use my code for a reward: " + stats.referralCode;
    const url = stats.referralLink;

    switch (platform) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(message + " " + url)}`, "_blank");
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent("Join WorkersArena")}&body=${encodeURIComponent(message + "\n\n" + url)}`, "_blank");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`, "_blank");
        break;
    }
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    rewarded: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  };

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.totalReferrals}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Total Referrals</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.completedReferrals}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Completed</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Gift className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">${stats.totalRewardsEarned}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Rewards Earned</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">${stats.currentBalance}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Balance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Code Card */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Your Referral Code</h3>
            <p className="text-blue-100 text-sm">
              Share this code with friends and earn rewards when they join!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg px-4 py-2 font-mono text-xl font-bold tracking-wider">
              {stats.referralCode}
            </div>
            <button
              onClick={() => copyToClipboard(stats.referralCode)}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              {copied ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => shareVia("whatsapp")}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
          <button
            onClick={() => shareVia("email")}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={() => shareVia("twitter")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-400 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Twitter
          </button>
          <button
            onClick={() => copyToClipboard(stats.referralLink)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
            Copy Link
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ink-200 dark:border-ink-800">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "overview"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Gift className="w-4 h-4 inline mr-2" />
            Reward Tiers
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "history"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            History
          </button>
        </nav>
      </div>

      {/* Reward Tiers */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Reward Tiers</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REWARD_TIERS.map((tier, index) => {
              const isUnlocked = stats.completedReferrals >= tier.minReferrals;
              return (
                <div
                  key={tier.id}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all",
                    isUnlocked
                      ? "border-green-500 bg-green-50"
                      : "border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                        isUnlocked ? "bg-green-500 text-white" : "bg-ink-300 dark:bg-ink-700 text-ink-600 dark:text-ink-300"
                      )}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-ink-50">
                          {tier.type === "credit" && `$${tier.amount} Credit`}
                          {tier.type === "discount" && `${tier.amount}% Discount`}
                          {tier.type === "premium_days" && `${tier.amount} Days Premium`}
                        </p>
                        <p className="text-sm text-ink-500 dark:text-ink-400">
                          {locale === "ar" ? tier.descriptionAr : tier.description}
                        </p>
                      </div>
                    </div>
                    {isUnlocked && (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-ink-200 dark:bg-ink-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          isUnlocked ? "bg-green-500" : "bg-ink-400 dark:bg-ink-600"
                        )}
                        style={{
                          width: `${Math.min((stats.completedReferrals / tier.minReferrals) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-ink-600 dark:text-ink-300">
                      {stats.completedReferrals}/{tier.minReferrals}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Referral History */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="bg-ink-50 dark:bg-ink-950">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Referred User</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Date</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Reward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {referrals.map((referral) => (
                <tr key={referral.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-ink-900 dark:text-ink-50">{referral.referredName}</p>
                      <p className="text-sm text-ink-500 dark:text-ink-400">{referral.referredEmail}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">
                    {formatDate(referral.createdAt, locale)}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[referral.status])}>
                      {referral.status.charAt(0).toUpperCase() + referral.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {referral.rewardAmount ? (
                      <span className="text-green-600 font-medium">
                        +${referral.rewardAmount}
                      </span>
                    ) : (
                      <span className="text-ink-400 dark:text-ink-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

/**
 * Referral banner component for homepage/dashboard
 */
export function ReferralBanner({ locale = "en" }: { locale?: "en" | "ar" }) {
  return (
    <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-white/20 rounded-xl">
          <Award className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">
            {locale === "ar" ? "ادعُ أصدقاءك واحصل على مكافآت!" : "Invite Friends & Earn Rewards!"}
          </h3>
          <p className="text-purple-100 text-sm">
            {locale === "ar"
              ? "احصل على 10 دولارات لكل إحالة ناجحة"
              : "Get $10 for each successful referral"}
          </p>
        </div>
        <button className="px-4 py-2 bg-white dark:bg-ink-900 text-purple-600 font-medium rounded-lg hover:bg-purple-50 transition-colors">
          {locale === "ar" ? "شارك الآن" : "Share Now"}
        </button>
      </div>
    </div>
  );
}
