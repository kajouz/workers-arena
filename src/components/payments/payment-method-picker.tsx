"use client";

import { CreditCard } from "lucide-react";
import { OMTIconCompact } from "@/components/payments/icons/omt-icon";
import { WishIconCompact } from "@/components/payments/icons/wish-icon";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export type CheckoutMethod = "stripe" | "omt" | "whish";

type MethodConfig = {
  key: CheckoutMethod;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const ALL_METHODS: MethodConfig[] = [
  { key: "stripe", icon: CreditCard, accent: "text-sky-600 dark:text-sky-400" },
  { key: "omt", icon: OMTIconCompact, accent: "text-orange-600 dark:text-orange-400" },
  { key: "whish", icon: WishIconCompact, accent: "text-violet-600 dark:text-violet-400" },
];

/**
 * The Lebanon-first payment-method picker (docs/PAYMENTS.md) — Card/Stripe for
 * online card payments, and the two MANUAL methods (OMT agent / OMT Intra app,
 * Whish wallet) whose checkouts land on the signed /payments/manual
 * instructions page and are confirmed by an admin. Shared by every checkout
 * surface (booking pay card, campaign pay dialog, renew dialog, paid-upgrade
 * dialogs) so the methods can never drift between surfaces.
 */
export function PaymentMethodPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
  methods,
}: {
  value: CheckoutMethod;
  onChange: (m: CheckoutMethod) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Restrict the offered methods (default: all three). Paid upgrades are
   * manual-only, so they pass ["omt", "whish"]. */
  methods?: CheckoutMethod[];
}) {
  const { t } = useLocale();
  const shown = methods ?? ALL_METHODS.map((m) => m.key);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {ALL_METHODS.filter((m) => shown.includes(m.key)).map(({ key, icon: Icon, accent }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-all disabled:opacity-50",
              active
                ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500"
                : "border-ink-200 hover:border-brand-500/40 dark:border-ink-700"
            )}
          >
            <Icon className={cn("size-5", accent)} />
            <span className="text-xs font-black text-ink-900 dark:text-ink-50">
              {t(`payments.method${key[0].toUpperCase()}${key.slice(1)}`)}
            </span>
            {!compact && (
              <span className="text-[10px] leading-tight text-ink-400">
                {t(`payments.method${key[0].toUpperCase()}${key.slice(1)}Hint`)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
