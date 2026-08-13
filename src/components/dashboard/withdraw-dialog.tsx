"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestPayoutAction } from "@/app/actions/payouts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import type { WorkerBalance } from "@/lib/data/types";
import { formatPrice } from "@/lib/utils";

/**
 * Worker withdrawal request (docs/payouts.md §4). Opens a dialog capped at
 * available − pending (pending reservations are already committed to review);
 * submits in MAJOR units (the action converts ×100 to minor, like the booking
 * quote actions). The balance only moves once an admin approves the request.
 */
export function WithdrawDialog({
  workerId,
  balance,
}: {
  workerId: string;
  balance: WorkerBalance;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const maxMinor = Math.max(0, balance.availableMinor - balance.pendingMinor);
  const maxMajor = maxMinor / 100;

  const submit = async () => {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0 || busy) return;
    if (Math.round(value * 100) > maxMinor) {
      toast("error", t("dashboard.payoutsInsufficient"));
      return;
    }
    setBusy(true);
    const res = await requestPayoutAction(workerId, value);
    setBusy(false);
    if (res.ok) {
      toast("success", t("dashboard.payoutsRequested"));
      setOpen(false);
      setAmount("");
    } else {
      toast("error", res.error === "insufficient" ? t("dashboard.payoutsInsufficient") : t("common.noResults"));
    }
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)} disabled={maxMinor <= 0}>
        {t("dashboard.payoutsWithdraw")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dashboard.payoutsWithdraw")}</DialogTitle>
          <DialogDescription>{t("dashboard.payoutsWithdrawHint")}</DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          min={0.01}
          max={maxMajor}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`${formatPrice(maxMajor, balance.currency, locale)}`}
        />
        <p className="text-xs text-ink-400">
          {t("dashboard.payoutsMax")} {formatPrice(maxMajor, balance.currency, locale)}
        </p>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !amount}>
            {t("dashboard.payoutsConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
