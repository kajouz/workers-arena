"use client";

import { ShieldCheck, ShieldAlert, Loader2, ShieldX } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { Worker } from "@/lib/data/types";
import { submitVerificationAction } from "@/app/actions/business";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS: Record<Worker["verification"], { icon: React.ReactNode; tone: string }> = {
  verified: { icon: <ShieldCheck className="size-5 text-emerald-500" />, tone: "success" },
  pending: { icon: <Loader2 className="size-5 animate-spin text-amber-500" />, tone: "default" },
  rejected: { icon: <ShieldX className="size-5 text-red-500" />, tone: "danger" },
};

export function VerificationBanner({ worker }: { worker: Worker }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const status = worker.verification;
  const noteKey =
    status === "verified" ? "verification.verifiedNote" : status === "pending" ? "verification.pendingNote" : "verification.rejectedNote";
  const actionKey = status === "rejected" ? "verification.resubmit" : "verification.submit";
  const toastKey = "verification.submitted";

  const submit = async () => {
    setBusy(true);
    const res = await submitVerificationAction();
    setBusy(false);
    if (res.ok) {
      toast("success", t(toastKey));
      router.refresh();
    }
  };

  return (
    <Card className={status === "verified" ? "border-emerald-500/30 bg-emerald-500/5" : status === "rejected" ? "border-red-500/30 bg-red-500/5" : ""}>
      <CardContent className="flex items-center gap-4 p-5">
        {STATUS[status].icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-ink-900 dark:text-ink-50">{t("verification.title")}</p>
            <Badge variant={STATUS[status].tone as "success" | "default" | "danger"}>{t(`verification.${status}`)}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{t(noteKey)}</p>
        </div>
        {status !== "verified" && (
          <Button variant="outline" size="sm" onClick={submit} disabled={busy} className="shrink-0">
            <ShieldAlert className="size-4" /> {t(actionKey)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
