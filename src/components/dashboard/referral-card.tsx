"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REFERRAL CARD — worker dashboard widget for the referral program
 * ────────────────────────────────────────────────────────────────────────────
 * Shows the worker's referral code, link, stats, and a share button.
 * Uses server actions to fetch stats and generate codes.
 */

import { useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Users, Copy, Share2, Gift, TrendingUp } from "lucide-react";
import { generateReferralCodeAction, getReferralStatsAction } from "@/app/actions/referrals";
import type { ReferralStats } from "@/lib/data/referral";

export function ReferralCard({ stats: initialStats }: { stats?: ReferralStats | null }) {
  const { t } = useLocale();
  const [stats, setStats] = useState<ReferralStats | null>(initialStats ?? null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStats = async () => {
    if (loading) return;
    setLoading(true);
    const res = await getReferralStatsAction();
    setLoading(false);
    if (res.ok) setStats(res.stats);
  };

  // Load stats on mount if not provided
  if (!stats && !loading) {
    loadStats();
  }

  const handleCopyLink = async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.link);
      setCopied(true);
      toast("success", t("referral.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("error", "Failed to copy");
    }
  };

  const handleShare = async () => {
    if (!stats) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join WorkersArena",
          text: `Use my referral code: ${stats.code}`,
          url: stats.link,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Card className="border-purple-500/30 bg-purple-500/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400">
            <Users className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold">{t("referral.title")}</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">{t("referral.subtitle")}</p>
          </div>
        </div>

        {stats ? (
          <div className="space-y-3">
            {/* Referral code + link */}
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-ink-100 px-3 py-1.5 font-mono text-sm font-bold text-ink-900 dark:bg-ink-800 dark:text-ink-50">
                {stats.code}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                <Copy className="size-3.5 me-1" />
                {copied ? "✓" : t("referral.copyLink")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleShare}>
                <Share2 className="size-3.5" />
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-800/50">
                <p className="text-lg font-bold tabular-nums">{stats.totalReferrals}</p>
                <p className="text-[10px] text-ink-500 dark:text-ink-400">{t("referral.totalReferrals")}</p>
              </div>
              <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-800/50">
                <p className="text-lg font-bold tabular-nums text-purple-600 dark:text-purple-400">
                  {stats.totalCreditsEarned}
                </p>
                <p className="text-[10px] text-ink-500 dark:text-ink-400">{t("referral.creditsEarned")}</p>
              </div>
              <div className="rounded-lg bg-ink-50 p-2 text-center dark:bg-ink-800/50">
                <p className="text-lg font-bold tabular-nums">{stats.monthlyReferrals}</p>
                <p className="text-[10px] text-ink-500 dark:text-ink-400">{t("referral.thisMonth")}</p>
              </div>
            </div>

            {/* How it works */}
            <p className="text-[11px] text-ink-400 dark:text-ink-500">
              {t("referral.howItWorks")}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={loadStats} disabled={loading}>
              {loading ? "…" : t("referral.generateCode")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
