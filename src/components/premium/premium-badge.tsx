"use client";

import { Crown, Star, Shield, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type PremiumTier = "basic" | "pro" | "enterprise";

interface PremiumBadgeProps {
  tier: PremiumTier;
  compact?: boolean;
  className?: string;
}

const TIER_CONFIG: Record<PremiumTier, {
  icon: typeof Crown;
  label: string;
  labelAr: string;
  colors: string;
  glow: string;
}> = {
  basic: {
    icon: Star,
    label: "Verified",
    labelAr: "موثق",
    colors: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    glow: "",
  },
  pro: {
    icon: Shield,
    label: "Pro",
    labelAr: "محترف",
    colors: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    glow: "shadow-blue-500/20",
  },
  enterprise: {
    icon: Crown,
    label: "Premium",
    labelAr: "مميز",
    colors: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    glow: "shadow-amber-500/20",
  },
};

/**
 * Premium badge component for worker cards and profiles
 */
export function PremiumBadge({ tier, compact = false, className }: PremiumBadgeProps) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  if (tier === "basic") return null; // Basic tier doesn't show a badge

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold",
        config.colors,
        config.glow && `shadow-lg ${config.glow}`,
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      <Icon className={cn(compact ? "size-3" : "size-3.5")} />
      {!compact && config.label}
    </span>
  );
}

/**
 * Promoted listing badge
 */
export function PromotedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400",
        className
      )}
    >
      <TrendingUp className="size-3" />
      Promoted
    </span>
  );
}

/**
 * Emergency badge for workers available 24/7
 */
export function EmergencyBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-red-500/10 font-bold text-red-600 dark:text-red-400",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      <Zap className={cn(compact ? "size-3" : "size-3.5")} />
      {!compact && "Emergency"}
    </span>
  );
}

interface PremiumFeaturesProps {
  tier: PremiumTier;
}

/**
 * Premium features list for worker profiles
 */
export function PremiumFeatures({ tier }: PremiumFeaturesProps) {
  const features: Record<PremiumTier, string[]> = {
    basic: [],
    pro: [
      "Priority in search results",
      "Pro badge on profile",
      "Advanced analytics",
      "Priority support",
    ],
    enterprise: [
      "Top placement in search results",
      "Premium badge on profile",
      "Advanced analytics dashboard",
      "Dedicated account manager",
      "Custom branding options",
      "API access",
    ],
  };

  const tierFeatures = features[tier];
  if (tierFeatures.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Crown className="size-5 text-amber-500" />
        <h3 className="text-sm font-bold text-ink-900 dark:text-ink-50">
          {tier === "enterprise" ? "Premium Features" : "Pro Features"}
        </h3>
      </div>
      <ul className="space-y-2">
        {tierFeatures.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
            <span className="size-1.5 rounded-full bg-amber-500" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Upgrade CTA for workers
 */
export function UpgradeCTA({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 p-6 text-center", className)}>
      <Crown className="mx-auto size-8 text-brand-500" />
      <h3 className="mt-3 text-lg font-bold text-ink-900 dark:text-ink-50">
        Upgrade to Pro
      </h3>
      <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
        Get more bookings with priority placement, advanced analytics, and a Pro badge.
      </p>
      <button className="mt-4 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600">
        View Plans
      </button>
    </div>
  );
}
