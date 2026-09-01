"use client";

import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { BillingPeriod, SubscriptionPlan, Worker } from "@/lib/data/types";
import { ANNUAL_PAID_MONTHS, ANNUAL_TERM_MONTHS, PLANS, planPrice } from "@/lib/data/subscriptions";
import { renewSubscriptionAction } from "@/app/actions/business";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { PaymentMethodPicker, type CheckoutMethod } from "@/components/payments/payment-method-picker";

export function RenewDialog({ worker }: { worker: Worker }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [plan, setPlan] = useState<SubscriptionPlan>(worker.subscription.plan);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [method, setMethod] = useState<CheckoutMethod>("stripe");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    setBusy(true);
    const f = new FormData();
    f.set("plan", plan);
    f.set("period", period);
    f.set("workerSlug", worker.slug);
    f.set("method", method);
    const res = await renewSubscriptionAction(f);
    setBusy(false);
    if (res.ok && res.url) {
      // Manual (OMT/Whish) renewal — land on the signed instructions page; the
      // subscription extends once an admin confirms receipt.
      window.location.href = res.url;
    } else if (res.ok) {
      toast("success", t("subscription.renewed").replace("{days}", String(res.days ?? 30)));
      setOpen(false);
      router.refresh();
    } else {
      toast("error", t("common.noResults"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <CalendarClock className="size-4" /> {t("dashboard.renewNow")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("subscription.renewTitle")}</DialogTitle>
          <DialogDescription>{t("subscription.renewSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* Billing period — annual pays 10 months for 12 (2 months free). */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          <button
            onClick={() => setPeriod("monthly")}
            disabled={busy}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-bold transition-all disabled:opacity-50",
              period === "monthly"
                ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50"
                : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
            )}
          >
            {t("plans.monthly")}
          </button>
          <button
            onClick={() => setPeriod("annual")}
            disabled={busy}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm font-bold transition-all disabled:opacity-50",
              period === "annual"
                ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50"
                : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
            )}
          >
            {t("plans.annual")}
            <span className="ms-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-200">
              {t("plans.saveTwoMonths")}
            </span>
          </button>
        </div>
        {period === "annual" && (
          <p className="-mt-1 text-[11px] text-ink-400">{t("plans.annualHint")}</p>
        )}

        <div className="space-y-2">
          {(Object.keys(PLANS) as SubscriptionPlan[]).map((key) => {
            const monthly = PLANS[key].price;
            const price = planPrice(key, period);
            return (
              <button
                key={key}
                onClick={() => setPlan(key)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start transition-all",
                  plan === key
                    ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500"
                    : "border-ink-200 hover:border-brand-500/40 dark:border-ink-700"
                )}
              >
                <span>
                  <span className="block text-sm font-black text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? PLANS[key].labelAr : PLANS[key].labelEn}
                  </span>
                  <span className="text-xs text-ink-400">
                    ${price} {period === "annual" ? t("plans.perYear").trim() : t("plans.perMonth").trim()}
                    {period === "annual" && (
                      <span className="ms-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                        · {t("plans.save")} ${monthly * ANNUAL_TERM_MONTHS - price}
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border",
                    plan === key ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300 dark:border-ink-600"
                  )}
                >
                  {plan === key && <Check className="size-3" />}
                </span>
              </button>
            );
          })}
        </div>
        {worker.subscription.status === "active" && (
          <Badge variant="outline" className="mx-auto">
            {t("dashboard.currentPlan")}: {locale === "ar" ? PLANS[worker.subscription.plan].labelAr : PLANS[worker.subscription.plan].labelEn}
          </Badge>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-ink-500 dark:text-ink-400">{t("payments.purchaseChooseMethod")}</p>
          <PaymentMethodPicker value={method} onChange={setMethod} disabled={busy} />
          {(method === "omt" || method === "whish") && (
            <p className="text-[11px] leading-relaxed text-ink-400">{t("payments.purchaseNote")}</p>
          )}
        </div>
        <Button onClick={submit} disabled={busy} size="lg" className="w-full">
          {busy ? t("common.loading") : t("subscription.renewNow")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
