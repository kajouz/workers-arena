"use client";

/**
 * Payment workflow v2 — the evidence an admin records when confirming a manual
 * (OMT/Whish) payment (docs/PAYMENTS.md §Confirming): the amount actually
 * received (prefilled with what is still owed) and the OMT/Whish transaction
 * number, which must be unique across all payments and refunds. Shared by the
 * /admin pending-payments card and the dispute view's confirm dialog.
 */
import { useLocale } from "@/components/providers/locale-provider";

export interface PaymentEvidence {
  amount: string;
  txnId: string;
  note: string;
}

export function emptyEvidence(amountMinor: number): PaymentEvidence {
  return { amount: (amountMinor / 100).toFixed(2), txnId: "", note: "" };
}

/** Client-side readiness check; the server re-validates everything. */
export function evidenceReady(e: PaymentEvidence): boolean {
  const amount = Number(e.amount);
  return Number.isFinite(amount) && amount > 0 && e.txnId.replace(/[\s\-_/.]/g, "").length >= 4;
}

export function PaymentEvidenceFields({
  value,
  onChange,
  disabled,
}: {
  value: PaymentEvidence;
  onChange: (next: PaymentEvidence) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const field =
    "mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50";
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-ink-600 dark:text-ink-300">
        {t("payments.adminEvidenceAmount")}
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className={field}
          value={value.amount}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
        />
      </label>
      <label className="block text-xs font-semibold text-ink-600 dark:text-ink-300">
        {t("payments.adminEvidenceTxn")}
        <input
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          className={`${field} font-mono uppercase`}
          value={value.txnId}
          disabled={disabled}
          placeholder="OMT 1234 5678"
          onChange={(e) => onChange({ ...value, txnId: e.target.value })}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-400">{t("payments.adminEvidenceTxnHint")}</span>
      </label>
      <label className="block text-xs font-semibold text-ink-600 dark:text-ink-300">
        {t("payments.adminEvidenceNote")}
        <input
          type="text"
          maxLength={300}
          className={field}
          value={value.note}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </label>
    </div>
  );
}

/** The toast copy key for a confirm result. */
export function evidenceResultKey(res: { ok: boolean; outcome?: string; error?: string }): string {
  if (res.ok) {
    if (res.outcome === "partial") return "payments.adminOutcomePartial";
    if (res.outcome === "awaiting-approval") return "payments.adminOutcomeAwaiting";
    if (res.outcome === "unmatched") return "payments.adminOutcomeUnmatched";
    return "payments.adminPendingDone";
  }
  switch (res.error) {
    case "invalid-txn":
    case "evidence-required":
      return "payments.adminErrorTxn";
    case "duplicate-txn":
      return "payments.adminErrorDuplicate";
    case "invalid-amount":
      return "payments.adminErrorAmount";
    case "same-admin":
      return "payments.adminErrorSameAdmin";
    default:
      return "payments.adminPendingError";
  }
}
