"use client";

import {
  Megaphone,
  Eye,
  MousePointerClick,
  Target,
  Wallet,
  Receipt,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import type { SessionUser } from "@/lib/auth-demo";
import type { AnalyticsOverview, Campaign, Invoice } from "@/lib/data/types";
import { StatCard } from "./stat-card";
import { BarList } from "./charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GradientAvatar } from "@/components/ui/avatar";
import { formatCompact, formatDate } from "@/lib/utils";
import { payCampaignAction } from "@/app/actions/business";
import { CampaignBuilder } from "./campaign-builder";
import { PaymentMethodPicker, type CheckoutMethod } from "@/components/payments/payment-method-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const AD_TYPES = [
  { key: "banner", hue: 205 },
  { key: "slider", hue: 260 },
  { key: "featuredCard", hue: 30 },
  { key: "sponsoredSearch", hue: 150 },
  { key: "sponsoredCategory", hue: 190 },
  { key: "popup", hue: 330 },
  { key: "native", hue: 110 },
  { key: "video", hue: 280 },
] as const;

const STATUS_STYLE: Record<Campaign["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ended: "bg-ink-500/10 text-ink-500 dark:text-ink-400",
  // Created but unpaid — does not serve ads until the checkout confirms.
  pending: "bg-ink-500/10 text-ink-500 dark:text-ink-400",
};

export function CompanyDashboard({
  session,
  analytics: a,
  campaigns,
  invoices,
}: {
  session: SessionUser;
  analytics: AnalyticsOverview;
  campaigns: Campaign[];
  invoices: Invoice[];
}) {
  const { locale, t } = useLocale();
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<CheckoutMethod>("stripe");
  const [paying, setPaying] = useState(false);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const ctr = ((totalClicks / totalImpressions) * 100).toFixed(2);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const impressionsSeries = a.viewsSeries.slice(0, 12).map((p) => p.value * 4);

  // "Pay now" — re-mint the hosted checkout for a PENDING campaign (idempotent)
  // and send the company there. The campaign goes live once paid. The method
  // picker lets a Lebanon company pay via OMT/Whish (manual — the admin
  // confirms receipt) instead of a card.
  const payNow = async () => {
    if (!payFor || paying) return;
    setPaying(true);
    const res = await payCampaignAction(payFor, payMethod);
    setPaying(false);
    if (res.ok && res.url) {
      window.location.href = res.url;
    } else {
      toast("error", t("common.noResults"));
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <GradientAvatar name={session.name} hue={session.hue} className="size-14" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
              {t("company.title")}
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">{t("company.subtitle")}</p>
          </div>
        </div>
        <CampaignBuilder />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("company.activeCampaigns")} value={campaigns.filter((c) => c.status === "active").length} icon={<Megaphone className="size-5" />} trend={20} color="#8b5cf6" index={0} />
        <StatCard label={t("company.impressions")} value={formatCompact(totalImpressions)} icon={<Eye className="size-5" />} trend={14} spark={impressionsSeries} color="#0ea5e9" index={1} />
        <StatCard label={t("company.clicks")} value={formatCompact(totalClicks)} icon={<MousePointerClick className="size-5" />} trend={18} color="#f97316" index={2} />
        <StatCard label={t("company.ctr")} value={`${ctr}%`} icon={<Target className="size-5" />} trend={3.2} color="#10b981" index={3} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* campaigns table */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("company.performance")}</CardTitle>
            <Badge variant="outline">
              <BarChart3 className="size-3" /> {t("company.impressions")}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                    <th className="px-6 py-3 text-start font-semibold">{t("company.campaignName")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("company.placement")}</th>
                    <th className="px-4 py-3 text-end font-semibold">{t("company.impressions")}</th>
                    <th className="px-4 py-3 text-end font-semibold">{t("company.clicks")}</th>
                    <th className="px-4 py-3 text-end font-semibold">{t("company.ctr")}</th>
                    <th className="px-6 py-3 text-end font-semibold">{t("admin.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40">
                      <td className="px-6 py-4">
                        <p className="font-bold text-ink-900 dark:text-ink-50">{locale === "ar" ? c.nameAr : c.nameEn}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                          <Wallet className="size-3" />
                          {formatCompact(c.spent)} / {formatCompact(c.budget)} · {t(`company.${c.adType}`)}
                          {c.status === "pending" && ` · ${t("company.awaitingPayment")}`}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-ink-500 dark:text-ink-400">{c.placement}</td>
                      <td className="px-4 py-4 text-end font-bold text-ink-900 dark:text-ink-50">{formatCompact(c.impressions)}</td>
                      <td className="px-4 py-4 text-end font-bold text-ink-900 dark:text-ink-50">{formatCompact(c.clicks)}</td>
                      <td className="px-4 py-4 text-end font-bold text-brand-600 dark:text-brand-400">{c.ctr}%</td>
                      <td className="px-6 py-4 text-end">
                        <div className="flex items-center justify-end gap-2">
                          <Badge className={STATUS_STYLE[c.status]}>
                            {t(`company.status${c.status[0].toUpperCase()}${c.status.slice(1)}`)}
                          </Badge>
                          {c.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPayMethod("stripe");
                                setPayFor(c.id);
                              }}
                              title={t("company.awaitingPayment")}
                            >
                              {t("company.payNow")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("company.payments")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800">
                <span className="text-sm text-ink-500 dark:text-ink-400">{t("company.budget")}</span>
                <span className="font-black text-ink-900 dark:text-ink-50">${formatCompact(totalBudget)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800">
                <span className="text-sm text-ink-500 dark:text-ink-400">{t("company.spent")}</span>
                <span className="font-black text-brand-600 dark:text-brand-400">${formatCompact(totalSpent)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800">
                <span className="text-sm text-ink-500 dark:text-ink-400">{t("company.remaining")}</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">${formatCompact(totalBudget - totalSpent)}</span>
              </div>
            </CardContent>
          </Card>

          {/* invoices */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Receipt className="size-4 text-brand-500" />
              <CardTitle className="text-base">{t("company.invoicesList")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.slice(0, 4).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-2.5 dark:bg-ink-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{inv.number}</p>
                    <p className="truncate text-xs text-ink-400">{locale === "ar" ? inv.descriptionAr : inv.descriptionEn}</p>
                    <p className="text-[11px] text-ink-400">{formatDate(inv.date, locale)}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-black text-ink-900 dark:text-ink-50">${formatCompact(inv.amount)}</p>
                    <Badge
                      variant={inv.status === "paid" ? "success" : "outline"}
                      className={`mt-0.5 text-[10px] ${inv.status === "refunded" ? "bg-sky-500/10 text-sky-700 dark:text-sky-400" : ""}`}
                    >
                      {t(`company.status${inv.status[0].toUpperCase()}${inv.status.slice(1)}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("company.adsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {AD_TYPES.map((ad) => (
                  <div
                    key={ad.key}
                    className="flex items-center gap-2.5 rounded-xl border border-ink-100 px-3 py-2.5 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-500/40 dark:border-ink-800 dark:text-ink-300"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: `hsl(${ad.hue} 70% 50%)` }}
                    />
                    {t(`company.${ad.key}`)}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-ink-400">{t("company.adLearnMore")}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* §Lebanon — pick the payment method before paying a PENDING campaign.
          OMT/Whish are manual: the company lands on the signed instructions
          page and the admin confirms receipt. */}
      <Dialog open={payFor !== null} onOpenChange={(open) => !open && !paying && setPayFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payments.purchaseChooseMethod")}</DialogTitle>
            <DialogDescription>
              {campaigns.find((c) => c.id === payFor) ? (locale === "ar" ? campaigns.find((c) => c.id === payFor)!.nameAr : campaigns.find((c) => c.id === payFor)!.nameEn) : ""}
            </DialogDescription>
          </DialogHeader>
          <PaymentMethodPicker value={payMethod} onChange={setPayMethod} disabled={paying} />
          <Button onClick={payNow} disabled={paying} size="lg" className="w-full">
            {paying ? t("common.loading") : t("company.payNow")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
