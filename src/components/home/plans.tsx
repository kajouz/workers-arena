"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Crown } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ANNUAL_PAID_MONTHS } from "@/lib/data/subscriptions";
import type { BillingPeriod } from "@/lib/data/types";

interface Plan {
  key: "basic" | "professional" | "premium" | "enterprise";
  price: number;
  popular?: boolean;
  features: string[];
}

const PLANS: Plan[] = [
  {
    key: "basic",
    price: 29,
    features: ["listings", "leads"],
  },
  {
    key: "professional",
    price: 59,
    popular: true,
    features: ["listings", "leads", "boost", "badge"],
  },
  {
    key: "premium",
    price: 119,
    features: ["listings", "leads", "boost", "badge", "stats", "gallery"],
  },
  {
    key: "enterprise",
    price: 299,
    features: ["listings", "leads", "boost", "badge", "stats", "gallery", "emergency", "support", "ads"],
  },
];

export function Plans() {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const annual = period === "annual";

  return (
    <section id="plans" className="relative overflow-hidden py-20">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/5 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={t("plans.popular")} title={t("plans.title")} subtitle={t("plans.subtitle")} />

        {/* Billing period — annual pays 10 months for 12 (2 months free). */}
        <div className="mb-8 flex flex-col items-center gap-2">
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
                {t("plans.saveTwoMonths")}
              </span>
            </button>
          </div>
          {annual && <p className="text-xs font-semibold text-ink-500 dark:text-ink-400">{t("plans.annualHint")}</p>}
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => (
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
                <span className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50">${annual ? plan.price * ANNUAL_PAID_MONTHS : plan.price}</span>
                <span className="text-sm font-medium text-ink-400">{annual ? t("plans.perYear") : t("plans.perMonth")}</span>
                {annual && (
                  <span className="ms-1 rounded-full emerald-badge-lg px-2 py-0.5 text-[10px] font-black">
                    {t("plans.save")} ${plan.price * (12 - ANNUAL_PAID_MONTHS)}
                  </span>
                )}
              </div>
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
          ))}
        </div>
      </div>
    </section>
  );
}
