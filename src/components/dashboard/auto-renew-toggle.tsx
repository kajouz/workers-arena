"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/providers/locale-provider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { setAutoRenewAction } from "@/app/actions/business";

/**
 * The worker's wallet auto-renew switch (revenue plan Step 2). On by default:
 * when the plan ends, it renews from the prepaid wallet if the balance covers
 * it (/api/cron/wallet); otherwise the usual reminders take over.
 */
export function AutoRenewToggle({ enabled }: { enabled: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  const change = async (next: boolean) => {
    setBusy(true);
    setOn(next);
    const res = await setAutoRenewAction(next);
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      toast("error", t("common.noResults"));
      return;
    }
    router.refresh();
  };

  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
      <span>
        <span className="block text-sm font-bold text-ink-900 dark:text-ink-50">{t("payments.autoRenewLabel")}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">{t("payments.autoRenewHint")}</span>
      </span>
      <Switch checked={on} onCheckedChange={change} disabled={busy} aria-label={t("payments.autoRenewLabel")} />
    </label>
  );
}
