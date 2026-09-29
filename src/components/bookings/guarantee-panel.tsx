"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { formatDate, formatPrice } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/currency";
import { fileGuaranteeClaimAction } from "@/app/actions/guarantee";
import { MAX_CLAIM_DESCRIPTION, type GuaranteeClaim, type GuaranteeCover } from "@/lib/data/guarantee-terms";
import { useGuestProof } from "./guest-proof";

/**
 * WorkersArena Guarantee on a completed booking (src/lib/data/guarantee.ts):
 *   • covered, no claim → "covered until {date}" + Report a problem;
 *   • a claim filed     → where it stands;
 *   • paid outside      → why it is not covered (the reason to pay on-platform).
 * The cover is computed by the row from the shared nowSeed, so the server
 * render and the first client render agree.
 */
export function GuaranteePanel({
  bookingId,
  cover,
  claim,
  currency,
}: {
  bookingId: string;
  cover: GuaranteeCover;
  claim: GuaranteeClaim | null | undefined;
  currency: string;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const withGuestProof = useGuestProof();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  if (claim) {
    const status = t(`guarantee.status.${claim.status}`)
      .replace("{amount}", formatPrice((claim.refundMinor ?? 0) / 100, claim.currency as CurrencyCode, locale));
    return (
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 text-xs text-ink-600 dark:text-ink-300">
          <p className="font-bold text-ink-900 dark:text-ink-50">{t("guarantee.claimFiled")}</p>
          <p className="mt-0.5">{status}</p>
          {claim.resolutionNote && <p className="mt-1 italic">{claim.resolutionNote}</p>}
        </div>
      </div>
    );
  }

  if (cover.reason === "not-paid-on-platform") {
    return (
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        <ShieldOff className="mt-px size-3.5 shrink-0" />
        <span>{t("guarantee.notCovered")}</span>
      </p>
    );
  }

  if (!cover.covered || !cover.windowEndsAt) return null;

  const submit = () => {
    const form = withGuestProof(new FormData());
    form.set("description", text);
    startTransition(async () => {
      const res = await fileGuaranteeClaimAction(bookingId, form);
      if (res.ok) {
        toast("success", t("guarantee.filedToast"));
        setOpen(false);
        router.refresh();
      } else {
        toast("error", t(res.error === "not-covered" ? "guarantee.notCoveredNow" : "guarantee.fileError"));
      }
    });
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="min-w-0 flex-1 text-xs text-ink-600 dark:text-ink-300">
          <span className="font-bold text-ink-900 dark:text-ink-50">{t("guarantee.name")}</span>{" "}
          {t("guarantee.coveredUntil")
            .replace("{date}", formatDate(cover.windowEndsAt, locale))
            .replace("{amount}", formatPrice(cover.coverMinor / 100, currency as CurrencyCode, locale))}
        </p>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("guarantee.report")}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CLAIM_DESCRIPTION))}
            placeholder={t("guarantee.describe")}
            aria-label={t("guarantee.describe")}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={pending || text.trim().length < 10}>
              {pending ? t("guarantee.sending") : t("guarantee.submit")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
