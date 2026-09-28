"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { compressPhoto } from "@/lib/mobile/camera";
import { formatDateTime } from "@/lib/utils";
import { uploadPaymentReceiptAction } from "@/app/actions/payment-receipts";
import type { ManualLinkParams } from "@/lib/payments/manual-link";

/**
 * Step 3 — "Paid already? Send a photo of your receipt" on the OMT/Whish
 * instructions page. The photo is shrunk in the browser (JPEG, ≤1400px wide)
 * before upload; the signed link's own fields go with it so the server can
 * re-verify which payment it belongs to.
 */
export function ReceiptUpload({ link, uploadedAt }: { link: ManualLinkParams; uploadedAt: string | null }) {
  const { locale, t } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [sentAt, setSentAt] = useState<string | null>(uploadedAt);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setJustSent(false);
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const compressed = await compressPhoto(raw, 1400, 72);
      const res = await uploadPaymentReceiptAction(link, compressed);
      if (res.ok) {
        setPreview(compressed);
        setSentAt(res.uploadedAt);
        setJustSent(true);
      } else {
        setError(
          res.error === "invalid-link"
            ? t("payments.receiptErrorLink")
            : res.error === "too-large"
              ? t("payments.receiptErrorLarge")
              : t("payments.receiptErrorImage")
        );
      }
    } catch {
      setError(t("payments.receiptErrorImage"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-ink-200/80 p-4 dark:border-ink-700">
      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("payments.receiptTitle")}</p>
      <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">{t("payments.receiptHint")}</p>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL preview, not a remote asset
        <img src={preview} alt={t("payments.adminPendingReceiptAlt")} className="max-h-48 w-full rounded-lg object-contain" />
      )}
      {justSent ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> {t("payments.receiptSent")}
        </p>
      ) : sentAt ? (
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {t("payments.receiptSentAt").replace("{time}", formatDateTime(sentAt, locale))}
        </p>
      ) : null}
      {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
        <Camera className="size-4" />
        {busy ? t("payments.receiptSending") : sentAt ? t("payments.receiptReplace") : t("payments.receiptChoose")}
      </Button>
    </div>
  );
}
