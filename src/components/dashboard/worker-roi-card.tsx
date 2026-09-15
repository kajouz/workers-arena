"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { WorkerRoi } from "@/lib/data/worker-roi";

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

interface RoiCardProps {
  roi: WorkerRoi | null;
  liveLeadCount: number;
}

export function WorkerRoiCard({ roi, liveLeadCount }: RoiCardProps) {
  const { t } = useLocale();
  if (!roi) return null;

  const multiple = roi.returnMultiple;

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t("roi.returnMultiple")} — {roi.month.key}</h3>
        <Link
          href="/dashboard/roi"
          className="text-xs text-primary hover:underline"
        >
          {t("roi.title")} →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="space-y-1">
          <p className="text-2xl font-bold">
            {multiple !== null ? `${multiple}×` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{t("roi.returnMultiple")}</p>
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold">{roi.leadsBought}</p>
          <p className="text-xs text-muted-foreground">{t("roi.leadsBought")}</p>
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-bold">
            {money(roi.gmvMinor)}
          </p>
          <p className="text-xs text-muted-foreground">{t("roi.gmv")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
        <span>
          {t("roi.funnel")}:{" "}
          {roi.winRatePct !== null ? `${roi.winRatePct}%` : "—"}
        </span>
        <span>
          {t("roi.platformFees")}:{" "}
          {money(roi.effectiveFeesMinor)}
          {roi.rebatesMinor > 0 && (
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
              −{money(roi.rebatesMinor)} rebate
            </Badge>
          )}
        </span>
        {liveLeadCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {liveLeadCount} {t("roi.leadsBought")}
          </Badge>
        )}
      </div>
    </div>
  );
}
