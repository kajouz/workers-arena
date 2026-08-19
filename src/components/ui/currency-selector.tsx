"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { useLocale } from "@/components/providers/locale-provider";

interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  available?: CurrencyCode[];
  className?: string;
}

/**
 * Currency selector dropdown
 */
export function CurrencySelector({
  value,
  onChange,
  available = ["USD", "LBP", "SAR"],
  className,
}: CurrencySelectorProps) {
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const isArabic = locale === "ar";

  const selectedCurrency = CURRENCIES[value];

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <span className="font-bold">{selectedCurrency.symbol}</span>
          <span>{isArabic ? selectedCurrency.nameAr : selectedCurrency.name}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift dark:border-ink-800 dark:bg-ink-900">
            {available.map((code) => {
              const currency = CURRENCIES[code];
              const isSelected = code === value;

              return (
                <button
                  key={code}
                  onClick={() => {
                    onChange(code);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition-colors hover:bg-ink-50 dark:hover:bg-ink-800",
                    isSelected && "bg-brand-500/5"
                  )}
                >
                  <span className="w-8 text-center text-lg font-bold">
                    {currency.symbol}
                  </span>
                  <div className="flex-1">
                    <p className="font-bold text-ink-900 dark:text-ink-50">
                      {isArabic ? currency.nameAr : currency.name}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {currency.code}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="size-4 text-brand-500" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inline currency display with conversion
 */
export function CurrencyDisplay({
  amount,
  fromCurrency,
  toCurrency,
  className,
}: {
  amount: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  className?: string;
}) {
  const { locale } = useLocale();
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);

  // Simple conversion (in production, use the convertCurrency function)
  useEffect(() => {
    if (fromCurrency === toCurrency) {
      setConvertedAmount(amount);
      return;
    }

    // Mock conversion rates
    const rates: Record<string, number> = {
      "USD-LBP": 89000,
      "LBP-USD": 1 / 89000,
      "USD-SAR": 3.75,
      "SAR-USD": 1 / 3.75,
      "LBP-SAR": 3.75 / 89000,
      "SAR-LBP": 89000 / 3.75,
    };

    const key = `${fromCurrency}-${toCurrency}`;
    const rate = rates[key] ?? 1;
    setConvertedAmount(amount * rate);
  }, [amount, fromCurrency, toCurrency]);

  if (convertedAmount === null) return null;

  const formatAmount = (val: number) => {
    const config = CURRENCIES[toCurrency];
    return val.toLocaleString(locale === "ar" ? "ar-LB" : "en-US", {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    });
  };

  return (
    <span className={className}>
      {formatAmount(convertedAmount)} {CURRENCIES[toCurrency].symbol}
    </span>
  );
}
