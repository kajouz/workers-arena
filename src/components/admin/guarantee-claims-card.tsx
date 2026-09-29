"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/components/i18n/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { formatDate, formatPrice } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/currency";
import { resolveGuaranteeClaimAction } from "@/app/actions/guarantee";
import type { GuaranteeClaim, GuaranteeOutcome } from "@/lib/data/guarantee-terms";

/**
 * Admin queue for WorkersArena Guarantee claims (src/lib/data/guarantee.ts):
 * open claims oldest first, each resolved once as "worker sent back",
 * "refunded $X" (≤ the claim's cover) or "rejected". Paying a refund out is
 * the usual manual OMT/Whish step; this records the decision.
 */
export function GuaranteeClaimsCard({ claims }: { claims: GuaranteeClaim[] }) {
  const { t } = useLocale();
  const open = claims.filter((c) => c.status === "open");
  const resolved = claims.filter((c) => c.status !== "open");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-emerald-600" />
          {t("guarantee.adminTitle")}
        </CardTitle>
        <Badge variant={open.length > 0 ? "danger" : "secondary"}>
          {t("guarantee.adminOpen").replace("{n}", String(open.length))}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 && <p className="text-sm text-ink-500">{t("guarantee.adminEmpty")}</p>}
        {open.map((claim) => (
          <OpenClaim key={claim.id} claim={claim} />
        ))}
        {resolved.length > 0 && (
          <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{t("guarantee.adminRecent")}</p>
            <ul className="space-y-1.5 text-xs text-ink-600 dark:text-ink-300">
              {resolved.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/bookings/${c.bookingNumber}`} className="font-semibold hover:underline">
                    {c.bookingNumber}
                  </Link>{" "}
                  · {c.customerName} · <ClaimStatus claim={c} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimStatus({ claim }: { claim: GuaranteeClaim }) {
  const { locale, t } = useLocale();
  return (
    <span>
      {t(`guarantee.status.${claim.status}`).replace(
        "{amount}",
        formatPrice((claim.refundMinor ?? 0) / 100, claim.currency as CurrencyCode, locale)
      )}
    </span>
  );
}

function OpenClaim({ claim }: { claim: GuaranteeClaim }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refund, setRefund] = useState(String(claim.coverMinor / 100));
  const [note, setNote] = useState("");

  const resolve = (outcome: GuaranteeOutcome) => {
    startTransition(async () => {
      const res = await resolveGuaranteeClaimAction(claim.id, outcome, Number(refund), note);
      if (res.ok) {
        toast("success", t("guarantee.adminResolved"));
        router.refresh();
      } else {
        toast("error", t(res.error === "invalid-refund" ? "guarantee.adminInvalidRefund" : "guarantee.adminError"));
      }
    });
  };

  return (
    <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/admin/bookings/${claim.bookingNumber}`} className="font-bold text-brand-600 hover:underline">
          {claim.bookingNumber}
        </Link>
        <span className="text-ink-600 dark:text-ink-300">{claim.customerName}</span>
        <span className="text-xs text-ink-400">{formatDate(claim.createdAt, locale)}</span>
        <span className="ms-auto text-xs text-ink-500">
          {t("guarantee.adminCover").replace("{amount}", formatPrice(claim.coverMinor / 100, claim.currency as CurrencyCode, locale))}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700 dark:text-ink-200">{claim.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("guarantee.adminNote")}
          aria-label={t("guarantee.adminNote")}
          className="h-8 min-w-40 flex-1 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending} onClick={() => resolve("redo")}>
          {t("guarantee.adminRedo")}
        </Button>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={claim.coverMinor / 100}
            step="0.01"
            value={refund}
            onChange={(e) => setRefund(e.target.value)}
            aria-label={t("guarantee.adminRefundAmount")}
            className="h-8 w-24 text-xs"
          />
          <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={() => resolve("refunded")}>
            {t("guarantee.adminRefund")}
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-red-600 dark:text-red-400"
          disabled={pending}
          onClick={() => resolve("rejected")}
        >
          {t("guarantee.adminReject")}
        </Button>
      </div>
    </div>
  );
}
