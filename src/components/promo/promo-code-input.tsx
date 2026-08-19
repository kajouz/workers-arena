"use client";

import { useState } from "react";
import { Tag, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface PromoCodeInputProps {
  onApply?: (code: string) => Promise<{ success: boolean; discount?: number; message?: string }>;
  appliedCode?: string;
  discount?: number;
  onRemove?: () => void;
}

/**
 * Promo code input with validation
 */
export function PromoCodeInput({
  onApply,
  appliedCode,
  discount,
  onRemove,
}: PromoCodeInputProps) {
  const { locale } = useLocale();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!code.trim() || !onApply) return;

    setLoading(true);
    setError(null);

    try {
      const result = await onApply(code.trim());
      if (result.success) {
        setCode("");
      } else {
        setError(result.message ?? "Invalid promo code");
      }
    } catch {
      setError("Failed to validate promo code");
    } finally {
      setLoading(false);
    }
  };

  // Applied state
  if (appliedCode) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <Tag className="size-4 text-emerald-500" />
        <div className="flex-1">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {appliedCode}
          </p>
          {discount !== undefined && (
            <p className="text-xs text-emerald-600 dark:text-emerald-300">
              {discount}% {locale === "ar" ? "خصم" : "discount applied"}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-emerald-600 hover:text-emerald-700"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  // Input state
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder={locale === "ar" ? "أدخل كود الخصم" : "Enter promo code"}
            className="ps-10 font-mono uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
            disabled={loading}
          />
        </div>
        <Button
          onClick={handleApply}
          disabled={!code.trim() || loading}
          variant="outline"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            locale === "ar" ? "تطبيق" : "Apply"
          )}
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <X className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Promo code badge showing applied discount
 */
export function PromoBadge({
  code,
  discount,
  onRemove,
}: {
  code: string;
  discount: number;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
      <Tag className="size-3" />
      {code} - {discount}% off
      {onRemove && (
        <button onClick={onRemove} className="ml-1 hover:text-emerald-700">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
