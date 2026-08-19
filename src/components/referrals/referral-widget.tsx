"use client";

import { useState } from "react";
import { Gift, Copy, Check, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface ReferralStats {
  code: string;
  clicks: number;
  signups: number;
  conversions: number;
  reward: number;
  currency: string;
}

interface ReferralWidgetProps {
  stats?: ReferralStats;
  onCopyCode?: (code: string) => void;
}

/**
 * Referral widget showing referral code and stats
 */
export function ReferralWidget({
  stats = {
    code: "REF-ABC123",
    clicks: 24,
    signups: 8,
    conversions: 3,
    reward: 15000,
    currency: "LBP",
  },
  onCopyCode,
}: ReferralWidgetProps) {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(stats.code);
    setCopied(true);
    onCopyCode?.(stats.code);
    setTimeout(() => setCopied(false), 2000);
  };

  const referralLink = `https://workersarena.com/register?ref=${stats.code}`;

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/5 to-violet-500/5 p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-brand-500/10">
          <Gift className="size-6 text-brand-500" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
            {locale === "ar" ? "ادعُ أصدقاءك" : "Refer Friends"}
          </h3>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {locale === "ar"
              ? "احصل على مكافآت عند تسجيل أصدقائك"
              : "Earn rewards when your friends sign up"}
          </p>
        </div>
      </div>

      {/* Referral code */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "كود الإحالة" : "Your Referral Code"}
        </label>
        <div className="flex gap-2">
          <Input
            value={stats.code}
            readOnly
            className="font-mono text-lg font-bold"
          />
          <Button
            variant={copied ? "default" : "outline"}
            onClick={handleCopy}
            className={cn(copied && "bg-emerald-500 text-white")}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Referral link */}
      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "رابط الإحالة" : "Referral Link"}
        </label>
        <div className="flex gap-2">
          <Input
            value={referralLink}
            readOnly
            className="text-sm"
            dir="ltr"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(referralLink);
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/50 p-3 text-center dark:bg-ink-800/50">
          <Users className="mx-auto size-5 text-brand-500" />
          <p className="mt-1 text-lg font-bold text-ink-900 dark:text-ink-50">
            {stats.clicks}
          </p>
          <p className="text-[10px] text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "نقرات" : "Clicks"}
          </p>
        </div>
        <div className="rounded-xl bg-white/50 p-3 text-center dark:bg-ink-800/50">
          <Users className="mx-auto size-5 text-emerald-500" />
          <p className="mt-1 text-lg font-bold text-ink-900 dark:text-ink-50">
            {stats.signups}
          </p>
          <p className="text-[10px] text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "تسجيلات" : "Signups"}
          </p>
        </div>
        <div className="rounded-xl bg-white/50 p-3 text-center dark:bg-ink-800/50">
          <TrendingUp className="mx-auto size-5 text-amber-500" />
          <p className="mt-1 text-lg font-bold text-ink-900 dark:text-ink-50">
            {stats.conversions}
          </p>
          <p className="text-[10px] text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "تحويلات" : "Conversions"}
          </p>
        </div>
      </div>

      {/* Reward */}
      <div className="mt-4 rounded-xl bg-brand-500/10 p-4 text-center">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          {locale === "ar" ? "مكافآتك" : "Your Rewards"}
        </p>
        <p className="text-2xl font-black text-brand-600 dark:text-brand-400">
          {stats.reward.toLocaleString()} {stats.currency}
        </p>
      </div>
    </div>
  );
}
