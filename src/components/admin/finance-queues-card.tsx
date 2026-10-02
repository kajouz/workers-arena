"use client";

/**
 * Payment workflow v2 — the finance queues on /admin (docs/PAYMENTS.md
 * §Workflow v2). Everything money-bearing that waits on a person, in one card:
 *
 *  - amounts recorded by one admin that need a DIFFERENT admin's approval
 *    (four-eyes above the threshold, or no receipt photo);
 *  - unmatched receipts — money that arrived after its reference closed —
 *    each resolved by booking a refund;
 *  - refunds owed back, each closed only when finance records the OMT/Whish
 *    transfer that returned the money;
 *  - overdue job balances (D+7 and later), with the write-off decision;
 *  - "settled directly" declarations the customer denied or left unanswered.
 *
 * The card renders only when at least one queue is non-empty.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import {
  approveManualTrancheAction,
  markRefundSentAction,
  rejectManualTrancheAction,
  resolveUnmatchedPaymentAction,
  writeOffBalanceAction,
} from "@/app/actions/business";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/utils";
import { evidenceResultKey } from "@/components/admin/payment-evidence-fields";

export interface FinanceQueues {
  awaitingApproval: Array<{ id: string; label: string; amountMinor: number; txnId: string; enteredBy: string; enteredByMe: boolean; createdAt: string }>;
  unmatched: Array<{ id: string; label: string; amountMinor: number; txnId: string; createdAt: string }>;
  refunds: Array<{ paymentId: string; label: string; amountMinor: number; method: string; createdAt: string }>;
  overdue: Array<{ bookingId: string; number: string; customer: string; outstandingMinor: number; stage: number }>;
  outsideReview: Array<{ bookingId: string; number: string; customer: string; disputed: boolean }>;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-ink-50">
        {title} <Badge variant="outline">{count}</Badge>
      </h3>
      {children}
    </section>
  );
}

const ROW = "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-4 py-2.5 dark:bg-ink-800";

export function FinanceQueuesCard({ queues }: { queues: FinanceQueues }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [refundTxn, setRefundTxn] = useState<Record<string, string>>({});
  const money = (minor: number) => formatPrice(minor / 100, "USD", locale);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; outcome?: string; error?: string }>, okKey = "payments.financeDone") => {
    if (busy) return;
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast("success", t(res.outcome ? evidenceResultKey(res) : okKey).replace("{remaining}", ""));
      router.refresh();
    } else {
      toast("error", t(evidenceResultKey(res)));
    }
  };

  return (
    <Card className="border-brand-500/30">
      <CardHeader className="flex-row items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-brand-500" />
        <CardTitle className="text-base">{t("payments.financeTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title={t("payments.financeApprovals")} count={queues.awaitingApproval.length}>
          {queues.awaitingApproval.map((a) => (
            <div key={a.id} className={ROW}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{a.label}</p>
                <p className="text-[11px] text-ink-400">
                  <span className="font-mono">{a.txnId}</span> · {t("payments.financeEnteredBy").replace("{name}", a.enteredBy || "—")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{money(a.amountMinor)}</span>
                <Button
                  size="sm"
                  disabled={a.enteredByMe || busy !== null}
                  title={a.enteredByMe ? t("payments.adminErrorSameAdmin") : undefined}
                  onClick={() => void run(`a-${a.id}`, () => approveManualTrancheAction(a.id))}
                >
                  {t("payments.financeApprove")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`r-${a.id}`, () => rejectManualTrancheAction(a.id))}>
                  {t("payments.financeReject")}
                </Button>
              </div>
            </div>
          ))}
        </Section>

        <Section title={t("payments.financeUnmatched")} count={queues.unmatched.length}>
          {queues.unmatched.map((u) => (
            <div key={u.id} className={ROW}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{u.label}</p>
                <p className="font-mono text-[11px] text-ink-400">{u.txnId}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{money(u.amountMinor)}</span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`u-${u.id}`, () => resolveUnmatchedPaymentAction(u.id))}>
                  {t("payments.financeBookRefund")}
                </Button>
              </div>
            </div>
          ))}
        </Section>

        <Section title={t("payments.financeRefunds")} count={queues.refunds.length}>
          {queues.refunds.map((r) => (
            <div key={r.paymentId} className={ROW}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{r.label}</p>
                <p className="text-[11px] uppercase text-ink-400">{r.method}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black">{money(r.amountMinor)}</span>
                <input
                  aria-label={t("payments.adminEvidenceTxn")}
                  className="w-36 rounded-lg border border-ink-200 bg-white px-2 py-1 font-mono text-xs uppercase dark:border-ink-700 dark:bg-ink-900"
                  placeholder={t("payments.financeRefundTxn")}
                  autoComplete="off"
                  value={refundTxn[r.paymentId] ?? ""}
                  onChange={(e) => setRefundTxn({ ...refundTxn, [r.paymentId]: e.target.value })}
                />
                <Button
                  size="sm"
                  disabled={busy !== null || (refundTxn[r.paymentId] ?? "").trim().length < 4}
                  onClick={() => void run(`s-${r.paymentId}`, () => markRefundSentAction(r.paymentId, refundTxn[r.paymentId] ?? ""))}
                >
                  {t("payments.financeRefundSent")}
                </Button>
              </div>
            </div>
          ))}
        </Section>

        <Section title={t("payments.financeOverdue")} count={queues.overdue.length}>
          {queues.overdue.map((o) => (
            <div key={o.bookingId} className={ROW}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                  {o.number} — {o.customer}
                </p>
                <p className="text-[11px] text-ink-400">{t(`payments.financeStage${o.stage}`)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">{money(o.outstandingMinor)}</span>
                {o.stage >= 5 && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`w-${o.bookingId}`, () => writeOffBalanceAction(o.bookingId))}>
                    {t("payments.financeWriteOff")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title={t("payments.financeOutside")} count={queues.outsideReview.length}>
          {queues.outsideReview.map((o) => (
            <div key={o.bookingId} className={ROW}>
              <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                {o.number} — {o.customer}
              </p>
              <Badge variant={o.disputed ? "danger" : "outline"}>
                {o.disputed ? t("payments.financeOutsideDenied") : t("payments.financeOutsideUnanswered")}
              </Badge>
            </div>
          ))}
        </Section>
      </CardContent>
    </Card>
  );
}
