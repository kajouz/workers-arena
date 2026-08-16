"use client";

/**
 * §Lebanon — the worker's paid-upgrade purchase (docs/BUSINESS-MODEL.md §5.1,
 * revenue first, no Stripe): verification tier / featured slot / emergency
 * marker bought via the MANUAL OMT/Whish methods. The purchase mints the
 * signed /payments/manual instructions page; the worker pays offline with the
 * reference and the platform confirms receipt from the /admin pending-payments
 * card, which activates the capability. No card needed.
 */
import { useState } from "react";
import { BadgeCheck, Crown, Siren } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { Worker } from "@/lib/data/types";
import { purchaseUpgradeAction } from "@/app/actions/business";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { PaymentMethodPicker, type CheckoutMethod } from "@/components/payments/payment-method-picker";

type Scope = "verification" | "featured" | "emergency";

const OPTIONS: { scope: Scope; icon: typeof Crown; price: string; titleKey: string; descKey: string }[] = [
  { scope: "verification", icon: BadgeCheck, price: "$9 / $19", titleKey: "payments.purchaseVerificationTitle", descKey: "payments.purchaseVerificationBasic" },
  { scope: "featured", icon: Crown, price: "$49", titleKey: "payments.purchaseFeatured", descKey: "payments.purchaseFeatured" },
  { scope: "emergency", icon: Siren, price: "$9", titleKey: "payments.purchaseEmergency", descKey: "payments.purchaseEmergency" },
];

export function UpgradeDialog({ worker }: { worker: Worker }) {
  const { t } = useLocale();
  const [scope, setScope] = useState<Scope>("verification");
  const [tier, setTier] = useState<"basic" | "professional">("basic");
  const [method, setMethod] = useState<CheckoutMethod>("omt");
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    const f = new FormData();
    f.set("scope", scope);
    f.set("method", method);
    f.set("workerSlug", worker.slug);
    if (scope === "verification") f.set("tier", tier);
    const res = await purchaseUpgradeAction(f);
    setBusy(false);
    if (res.ok && res.url) {
      window.location.href = res.url;
    } else {
      toast("error", t("common.noResults"));
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && !busy && setScope("verification")}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Crown className="size-4" /> {t("payments.purchaseTitle")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payments.purchaseTitle")}</DialogTitle>
          <DialogDescription>{t("payments.purchaseSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {OPTIONS.map(({ scope: s, icon: Icon, price, titleKey, descKey }) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setScope(s);
                if (s !== "verification") setTier("basic");
              }}
              disabled={busy}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start transition-all disabled:opacity-50",
                scope === s ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500" : "border-ink-200 hover:border-brand-500/40 dark:border-ink-700"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4 text-brand-500" />
                <span>
                  <span className="block text-sm font-black text-ink-900 dark:text-ink-50">{t(titleKey)}</span>
                  <span className="text-xs text-ink-400">{t(descKey)}</span>
                </span>
              </span>
              <span className="text-sm font-black text-brand-600 dark:text-brand-400">{price}</span>
            </button>
          ))}
        </div>

        {scope === "verification" && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            <button
              type="button"
              onClick={() => setTier("basic")}
              disabled={busy}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-bold transition-all disabled:opacity-50",
                tier === "basic" ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50" : "text-ink-500"
              )}
            >
              {t("payments.purchaseVerificationBasic")}
            </button>
            <button
              type="button"
              onClick={() => setTier("professional")}
              disabled={busy}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-bold transition-all disabled:opacity-50",
                tier === "professional" ? "bg-white text-ink-900 shadow-soft dark:bg-ink-950 dark:text-ink-50" : "text-ink-500"
              )}
            >
              {t("payments.purchaseVerificationPro")}
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-bold text-ink-500 dark:text-ink-400">{t("payments.purchaseChooseMethod")}</p>
          <PaymentMethodPicker value={method} onChange={setMethod} disabled={busy} methods={["omt", "whish"]} />
          <p className="text-[11px] leading-relaxed text-ink-400">{t("payments.purchaseNote")}</p>
        </div>

        <Button onClick={buy} disabled={busy} size="lg" className="w-full">
          {busy ? t("common.loading") : t("payments.purchasePay").replace("{method}", t(`payments.method${method[0].toUpperCase()}${method.slice(1)}`))}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
