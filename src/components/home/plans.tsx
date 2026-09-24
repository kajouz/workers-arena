"use client";

import { useMemo, useState } from "react";
import { Link } from "@/components/i18n/link";
import { motion } from "framer-motion";
import { Calculator, Check, Crown, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ANNUAL_PAID_MONTHS } from "@/lib/data/subscriptions";
import { CATEGORY_TIER_MAP, PLAN_CATALOG, effectiveTakeRate } from "@/lib/data/subscription-plans";
import { effectiveMonthlyPriceWithOverrides, type ResolvedPlanCatalog } from "@/lib/data/plan-catalog-overrides";
import { CATEGORIES } from "@/lib/data/categories";
import type { BillingPeriod, SubscriptionPlan } from "@/lib/data/types";

interface Plan {
  key: SubscriptionPlan;
  popular?: boolean;
  features: string[];
}

/** Presentation-only feature keys per plan — prices/labels come from the catalog. */
const FEATURES: Record<Plan["key"], string[]> = {
  basic: ["listings", "leads"],
  professional: ["listings", "leads", "boost", "badge"],
  premium: ["listings", "leads", "boost", "badge", "stats", "gallery"],
  enterprise: ["listings", "leads", "boost", "badge", "stats", "gallery", "emergency", "support", "ads"],
};

const PLANS: Plan[] = PLAN_CATALOG.map((entry) => ({
  key: entry.plan,
  popular: entry.plan === "professional",
  features: FEATURES[entry.plan],
}));

/** The trade chips: only trades whose price actually differs from the base. */
const ADJUSTED_TRADES = CATEGORIES.filter((c) => c.slug in CATEGORY_TIER_MAP);

const TIER_BADGE: Record<string, string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  high: "text-amber-700 dark:text-amber-400",
};

export function Plans({ catalog }: { /** The admin-editable catalog in force (overrides over the shipped defaults) — loaded server-side. */ catalog: ResolvedPlanCatalog }) {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  // FINDING 15: the worker-pricing block (plans + calculator) is ~3,285px on
  // its own. Collapsed behind a toggle on phones so the homepage isn't 15
  // screens; open by default on desktop where there's vertical room.
  const [expanded, setExpanded] = useState(false);
  // §Category pricing — null = the base (mid-tier) price; picking a trade
  // reprices every plan through effectiveMonthlyPrice().
  const [trade, setTrade] = useState<string | null>(null);
  // §Effective rate calculator — the "what will it really cost me" panel.
  const [jobs, setJobs] = useState(8);
  const [avgJob, setAvgJob] = useState(80);
  const annual = period === "annual";

  // Prices flow through the ADMIN catalog: an edit in revenue settings is
  // live here on the next render, no deploy needed.
  const priceFor = (plan: SubscriptionPlan) => effectiveMonthlyPriceWithOverrides(catalog, plan, trade);

  // Recomputed per trade — effectiveTakeRate() prices the plan's subscription
  // through the same category multiplier, so the calculator matches the cards.
  const rates = useMemo(
    () =>
      PLANS.map((p) => ({
        key: p.key,
        rate: effectiveTakeRate(p.key, jobs, avgJob, trade),
      })),
    [jobs, avgJob, trade]
  );
  const bestKey = rates.reduce((a, b) => (b.rate < a.rate ? b : a)).key;

  return (
    <section id="plans" className="relative overflow-hidden py-20">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/5 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={t("plans.popular")} title={t("plans.title")} subtitle={t("plans.subtitle")} />

        {/* FINDING 15 — mobile-only collapse toggle. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full border border-ink-200/80 bg-white px-5 py-2.5 text-sm font-bold text-ink-700 shadow-soft lg:hidden dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >
          {expanded ? t("plans.hidePlans") : t("plans.showPlans")}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>

        {/* Collapsed below `lg` until the toggle is pressed; always open above. */}
        <div className={cn(expanded ? "block" : "hidden", "lg:block")}>
        {/* Billing period — annual pays 9 months for 12 (3 months free). */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            <button
              onClick={() => setPeriod("monthly")}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-bold transition-all",
                !annual
                  ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50"
                  : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
              )}
            >
              {t("plans.monthly")}
            </button>
            <button
              onClick={() => setPeriod("annual")}
              className={cn(
                "relative rounded-lg px-4 py-2 text-sm font-bold transition-all",
                annual
                  ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50"
                  : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
              )}
            >
              {t("plans.annual")}
              <span className="ms-1.5 rounded-full emerald-badge-md px-1.5 py-0.5 text-[10px] font-black">
                {t("plans.saveThreeMonths")}
              </span>
            </button>
          </div>
          {annual && <p className="text-xs font-semibold text-ink-500 dark:text-ink-400">{t("plans.annualHint")}</p>}
        </div>

        {/* Trade selector — the category-adjusted pricing (§Lebanon pricing):
            pick your trade and every plan reprices to what that trade pays. */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <p className="text-sm font-bold text-ink-700 dark:text-ink-200">{t("plans.categoryAdjust")}</p>
          <div className="flex max-w-3xl flex-wrap justify-center gap-1.5">
            <button
              onClick={() => setTrade(null)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold transition-all",
                trade === null
                  ? "bg-brand-600 text-white shadow-soft"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
              )}
            >
              {t("plans.categoryStandard")}
            </button>
            {ADJUSTED_TRADES.map((c) => (
              <button
                key={c.slug}
                onClick={() => setTrade(c.slug)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition-all",
                  trade === c.slug
                    ? "bg-brand-600 text-white shadow-soft"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
                )}
              >
                {locale === "ar" ? c.nameAr : c.nameEn}
              </button>
            ))}
          </div>
          <p className="max-w-xl text-center text-xs text-ink-400">{t("plans.categoryAdjustHint")}</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => {
            const monthly = priceFor(plan.key);
            const tier = trade ? CATEGORY_TIER_MAP[trade] : null;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className={cn(
                  "relative flex flex-col rounded-3xl border bg-white p-7 transition-all duration-300 hover:-translate-y-1 dark:bg-ink-900",
                  plan.popular
                    ? "border-brand-500/60 shadow-glow ring-1 ring-brand-500/20"
                    : "border-ink-200/80 shadow-soft hover:shadow-lift dark:border-ink-800"
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-1 text-xs font-black uppercase tracking-wider text-white shadow-glow rtl:translate-x-1/2">
                    {t("plans.popular")}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t(`plans.${plan.key}`)}</h3>
                  {plan.key === "premium" && <Crown className="size-4 text-violet-500" />}
                </div>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t(`plans.${plan.key}Body`)}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50">
                    ${annual ? monthly * ANNUAL_PAID_MONTHS : monthly}
                  </span>
                  <span className="text-sm font-medium text-ink-400">{annual ? t("plans.perYear") : t("plans.perMonth")}</span>
                  {annual && (
                    <span className="ms-1 rounded-full emerald-badge-lg px-2 py-0.5 text-[10px] font-black">
                      {t("plans.save")} ${monthly * (12 - ANNUAL_PAID_MONTHS)}
                    </span>
                  )}
                </div>
                {tier && tier !== "mid" && (
                  <span className={cn("mt-1 text-[11px] font-bold", TIER_BADGE[tier])}>
                    {tier === "low" ? "−50%" : "+50%"} · {t("plans.categoryAdjust")}
                  </span>
                )}
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-ink-600 dark:text-ink-300">
                      <span className="emerald-icon flex size-5 shrink-0 items-center justify-center rounded-full emerald-badge-sm">
                        <Check className="size-3" />
                      </span>
                      {t(`plans.features.${f}`)}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/register" className="mt-7">
                  <Button variant={plan.popular ? "default" : "outline"} className="w-full">
                    {t("plans.choose")}
                  </Button>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Effective-take-rate calculator — subscription + platform fees as one
            % of GMV, so a worker can see the upgrade that pays for itself. */}
        <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-ink-200/80 bg-white p-6 shadow-soft dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-brand-500" />
            <h3 className="text-base font-black text-ink-900 dark:text-ink-50">{t("plans.calcTitle")}</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="flex items-center justify-between text-xs font-bold text-ink-500 dark:text-ink-400">
                {t("plans.calcJobs")}
                <span className="text-ink-900 dark:text-ink-50">{jobs}</span>
              </span>
              <input
                type="range"
                min={1}
                max={50}
                value={jobs}
                onChange={(e) => setJobs(Number(e.target.value))}
                className="mt-2 w-full accent-brand-600"
              />
            </label>
            <label className="block">
              <span className="flex items-center justify-between text-xs font-bold text-ink-500 dark:text-ink-400">
                {t("plans.calcAvgJob")}
                <span className="text-ink-900 dark:text-ink-50">${avgJob}</span>
              </span>
              <input
                type="range"
                min={20}
                max={500}
                step={10}
                value={avgJob}
                onChange={(e) => setAvgJob(Number(e.target.value))}
                className="mt-2 w-full accent-brand-600"
              />
            </label>
          </div>
          <p className="mt-4 text-xs font-semibold text-ink-500 dark:text-ink-400">
            {t("plans.effectiveRate").replace("{jobs}", String(jobs)).replace("{avgJob}", String(avgJob))}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {rates.map((r) => (
              <div
                key={r.key}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm",
                  r.key === bestKey
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-ink-200/80 dark:border-ink-800"
                )}
              >
                <span className="font-bold text-ink-700 dark:text-ink-200">{t(`plans.${r.key}`)}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("font-black", r.key === bestKey ? "text-emerald-700 dark:text-emerald-400" : "text-ink-900 dark:text-ink-50")}>
                    {r.rate.toFixed(1)}%
                  </span>
                  {r.key === bestKey && (
                    <span className="rounded-full emerald-badge-md px-2 py-0.5 text-[10px] font-black">
                      {t("plans.calcBest")}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-400">{t("plans.trialHint")}</p>
        </div>
        </div>
      </div>
    </section>
  );
}
