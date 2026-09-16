"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLAN CATALOG PANEL — admin editor for the subscription plan pricing
 * ────────────────────────────────────────────────────────────────────────────
 * Reprices the four plans without a deploy: per-plan monthly price, lead
 * quota, extra-lead price and search boost, plus the trial length and the
 * category-tier multipliers the pricing page applies. Saving appends a new
 * FeeRuleSet version (append-only, audited) via savePlanCatalogAction.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, RotateCcw, Save } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { savePlanCatalogAction, type PlanCatalogPayload } from "@/app/actions/plan-catalog";
import { DEFAULT_PLAN_CATALOG_OVERRIDES, normalizePlanCatalogOverrides } from "@/lib/data/plan-catalog-overrides";
import { CATEGORY_TIER_MAP } from "@/lib/data/subscription-plans";
import { CATEGORIES } from "@/lib/data/categories";

const PLAN_KEYS = ["basic", "professional", "premium", "enterprise"] as const;

const PLAN_LABELS: Record<(typeof PLAN_KEYS)[number], { en: string; ar: string }> = {
  basic: { en: "Starter", ar: "مبدأية" },
  professional: { en: "Growth", ar: "نمو" },
  premium: { en: "Pro", ar: "احترافي" },
  enterprise: { en: "Business", ar: "أعمال" },
};

/** Trades the tier multipliers actually touch — shown as a hint, not editable. */
const LOW_TRADES = CATEGORIES.filter((c) => CATEGORY_TIER_MAP[c.slug] === "low").map((c) => c.nameEn);
const HIGH_TRADES = CATEGORIES.filter((c) => CATEGORY_TIER_MAP[c.slug] === "high").map((c) => c.nameEn);

export function PlanCatalogPanel({ initial }: { initial: PlanCatalogPayload }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [config, setConfig] = useState<PlanCatalogPayload>(initial);
  const [busy, setBusy] = useState(false);

  const setPlan = (key: (typeof PLAN_KEYS)[number], patch: Partial<PlanCatalogPayload["plans"]["basic"]>) =>
    setConfig((c) => ({ ...c, plans: { ...c.plans, [key]: { ...c.plans[key], ...patch } } }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await savePlanCatalogAction(config);
    setBusy(false);
    if (res.ok) {
      toast("success", t("admin.planCatalog.saved").replace("{version}", String(res.version)));
      router.refresh();
    } else {
      toast("error", res.error === "unauthorized" ? t("admin.planCatalog.unauthorized") : t("admin.planCatalog.invalid"));
    }
  };

  const reset = () => {
    const def = normalizePlanCatalogOverrides(DEFAULT_PLAN_CATALOG_OVERRIDES);
    setConfig({
      plans: {
        basic: def.plans!.basic,
        professional: def.plans!.professional,
        premium: def.plans!.premium,
        enterprise: def.plans!.enterprise,
      },
      trialDays: def.trialDays ?? 30,
      categoryTiers: def.categoryTiers ?? { low: 0.5, mid: 1, high: 1.5 },
    });
    toast("info", t("admin.planCatalog.resetToast"));
  };

  const num = (v: number, onChange: (v: number) => void) => (
    <Input
      type="number"
      step="any"
      value={v}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular-nums"
    />
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-brand-600" />
            {t("admin.planCatalog.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("admin.planCatalog.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
            <RotateCcw className="me-1.5 h-4 w-4" />
            {t("admin.planCatalog.reset")}
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="me-1.5 h-4 w-4" />
            {t("admin.planCatalog.save")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Per-plan pricing rows */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs font-bold text-ink-400">
                <th className="pb-2 text-start">{t("admin.planCatalog.plan")}</th>
                <th className="pb-2 text-start">{t("admin.planCatalog.price")}</th>
                <th className="pb-2 text-start">{t("admin.planCatalog.leads")}</th>
                <th className="pb-2 text-start">{t("admin.planCatalog.extraLead")}</th>
                <th className="pb-2 text-start">{t("admin.planCatalog.boost")}</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_KEYS.map((key) => (
                <tr key={key} className="border-t border-ink-100 dark:border-ink-800">
                  <td className="py-2 pe-3 font-bold text-ink-800 dark:text-ink-100">
                    {locale === "ar" ? PLAN_LABELS[key].ar : PLAN_LABELS[key].en}
                  </td>
                  <td className="py-2 pe-3">{num(config.plans[key].monthlyPriceUsd, (v) => setPlan(key, { monthlyPriceUsd: v }))}</td>
                  <td className="py-2 pe-3">{num(config.plans[key].includedLeads, (v) => setPlan(key, { includedLeads: v }))}</td>
                  <td className="py-2 pe-3">{num(config.plans[key].extraLeadPriceUsd, (v) => setPlan(key, { extraLeadPriceUsd: v }))}</td>
                  <td className="py-2 pe-3">{num(config.plans[key].searchBoost, (v) => setPlan(key, { searchBoost: v }))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trial + category multipliers */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("admin.planCatalog.trialDays")}</span>
            {num(config.trialDays, (v) => setConfig((c) => ({ ...c, trialDays: v })))}
            <span className="block text-[11px] text-ink-500 dark:text-ink-400">{t("admin.planCatalog.trialDaysHint")}</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("admin.planCatalog.tierLow")}</span>
              {num(config.categoryTiers.low, (v) => setConfig((c) => ({ ...c, categoryTiers: { ...c.categoryTiers, low: v } })))}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("admin.planCatalog.tierMid")}</span>
              {num(config.categoryTiers.mid, (v) => setConfig((c) => ({ ...c, categoryTiers: { ...c.categoryTiers, mid: v } })))}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("admin.planCatalog.tierHigh")}</span>
              {num(config.categoryTiers.high, (v) => setConfig((c) => ({ ...c, categoryTiers: { ...c.categoryTiers, high: v } })))}
            </label>
          </div>
        </div>
        <p className="text-[11px] text-ink-400">
          {t("admin.planCatalog.tiersHint")
            .replace("{low}", LOW_TRADES.slice(0, 3).join(", "))
            .replace("{high}", HIGH_TRADES.slice(0, 3).join(", "))}
        </p>

        <Badge variant="outline" className="mx-auto">
          {t("admin.planCatalog.versioned")}
        </Badge>
      </CardContent>
    </Card>
  );
}
