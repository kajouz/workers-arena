"use client";

import { useState } from "react";
import { Plus, Megaphone } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { createCampaignAction } from "@/app/actions/business";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

const AD_TYPES = ["banner", "slider", "featuredCard", "sponsoredSearch", "sponsoredCategory", "popup", "native", "video"] as const;
const PLACEMENTS = ["Homepage · Banner", "Sponsored search", "Category · Cleaning", "Featured cards", "Popup · Homepage", "Sidebar"];

export function CampaignBuilder() {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nameEn: "",
    nameAr: "",
    placement: PLACEMENTS[0],
    adType: "banner" as (typeof AD_TYPES)[number],
    budget: 500,
  });

  const submit = async () => {
    setBusy(true);
    const fd = new FormData();
    fd.set("nameEn", form.nameEn);
    fd.set("nameAr", form.nameAr);
    fd.set("placement", form.placement);
    fd.set("adType", form.adType);
    fd.set("budget", String(form.budget));
    const res = await createCampaignAction(undefined, fd);
    setBusy(false);
    if (res.ok && res.checkoutUrl) {
      // Self-serve ad purchasing: the campaign is created PENDING and the
      // company is sent to the hosted checkout — it goes live once the
      // payment webhook confirms. The simulated checkout (dev) completes
      // instantly and redirects back to /company?paid=1.
      setOpen(false);
      window.location.href = res.checkoutUrl;
    } else {
      toast("error", res.error ?? t("common.noResults"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus className="size-4" /> {t("company.createCampaign")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-brand-500" /> {t("company.newCampaignTitle")}
          </DialogTitle>
          <DialogDescription>{t("company.newCampaignSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("company.nameEn")}</Label>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="Villa renovation — Riyadh" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("company.nameAr")}</Label>
            <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="تجديد فيلا — الرياض" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("company.placementLabel")}</Label>
            <select
              value={form.placement}
              onChange={(e) => setForm({ ...form, placement: e.target.value })}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
            >
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("company.adTypeLabel")}</Label>
            <select
              value={form.adType}
              onChange={(e) => setForm({ ...form, adType: e.target.value as typeof AD_TYPES[number] })}
              className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
            >
              {AD_TYPES.map((ad) => (
                <option key={ad} value={ad}>{t(`company.${ad}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("company.budgetLabel")}</Label>
            <Input
              type="number"
              min={50}
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
            />
            <p className="text-xs text-ink-400">
              {t("company.checkoutAmount").replace("{amount}", String(form.budget || 0))}
            </p>
          </div>
        </div>
        <Button onClick={submit} disabled={busy || !form.nameEn.trim() || !form.nameAr.trim()} size="lg" className="w-full">
          {busy ? t("common.loading") : t("company.createCampaign")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
