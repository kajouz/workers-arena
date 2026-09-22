"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * §SETTLEMENT — "this job still owes money, and here is why it matters"
 * ────────────────────────────────────────────────────────────────────────────
 * The second payment leg (docs/booking-take-rate.md §6). A finished job whose
 * quote the platform never collected is not payable: `creditEarnings` credits
 * nothing until the money is actually received (src/lib/data/booking-settlement.ts).
 *
 * This card is the customer-facing half of that rule — it names the outstanding
 * balance and collects it through the same rails as the deposit (Stripe-shaped
 * URL, or a signed OMT/Whish reference the admin confirms) — and the
 * worker-facing half, where a worker SEES that their payout is waiting on the
 * customer rather than wondering where the money went.
 *
 * ONE component, both sides: `role` picks the copy and the action. Keeping it
 * shared means the amount, the state words and the promise ("paying releases
 * the payout") can never drift between the two rows.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Clock, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/utils";
import { payBookingBalanceAction } from "@/app/actions/bookings";
import { PaymentMethodPicker, type CheckoutMethod } from "@/components/payments/payment-method-picker";
import { useGuestProof } from "./guest-proof";
import type { CurrencyCode } from "@/lib/currency";

export interface SettlementNoteProps {
  bookingId: string;
  /** Which side is reading — the customer can pay, the worker can only wait. */
  role: "customer" | "worker";
  /** Minor units still outstanding (never 0 — the caller hides the card). */
  outstandingMinor: number;
  currency: CurrencyCode;
  /** Minor units the worker will receive once it lands. */
  workerNetMinor: number;
  className?: string;
}

export function BookingSettlementNote({
  bookingId,
  role,
  outstandingMinor,
  currency,
  workerNetMinor,
  className,
}: SettlementNoteProps) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const withGuestProof = useGuestProof();
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<CheckoutMethod>("omt");
  const [, startTransition] = useTransition();
  const amount = formatPrice(outstandingMinor / 100, currency, locale);
  const net = formatPrice(workerNetMinor / 100, currency, locale);

  const pay = () => {
    if (paying) return;
    setPaying(true);
    startTransition(async () => {
      // §Lebanon — the balance is collected on the manual rails; a "stripe"
      // selection (the picker's routing case) falls back to OMT.
      const res = await payBookingBalanceAction(
        bookingId,
        method === "whish" ? "whish" : "omt",
        withGuestProof(new FormData())
      );
      if (res.ok && res.url) {
        window.location.href = res.url;
        return;
      }
      setPaying(false);
      toast("error", t("booking.settlementFailed"));
    });
  };

  return (
    <div
      className={
        "mt-3 flex flex-wrap items-center gap-3 rounded-xl border p-3 " +
        (role === "customer"
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-sky-500/25 bg-sky-500/5") +
        (className ? ` ${className}` : "")
      }
    >
      <span
        aria-hidden="true"
        className={
          "grid size-9 shrink-0 place-items-center rounded-lg " +
          (role === "customer" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-sky-500/10 text-sky-600 dark:text-sky-400")
        }
      >
        {role === "customer" ? <ReceiptText className="size-4" /> : <Clock className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
          {role === "customer"
            ? t("booking.settlementDueTitle", { amount })
            : t("booking.settlementWaitingTitle", { amount })}
        </p>
        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
          {role === "customer"
            ? t("booking.settlementDueBody", { net })
            : t("booking.settlementWaitingBody")}
        </p>
      </div>

      {role === "customer" && (
        <div className="flex flex-wrap items-center gap-2">
          <PaymentMethodPicker value={method} onChange={setMethod} />
          <Button size="sm" onClick={pay} disabled={paying}>
            <Banknote className="me-1.5 size-4" />
            {paying ? t("booking.settlementPaying") : t("booking.settlementPay", { amount })}
          </Button>
        </div>
      )}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="text-[11px] font-semibold text-ink-400 underline-offset-2 hover:underline"
      >
        {t("booking.settlementRefresh")}
      </button>
    </div>
  );
}
