import { formatPrice, type CurrencyCode } from "@/lib/utils";

export function Price({
  amount,
  currency,
  locale,
  className,
}: {
  amount: number;
  currency: CurrencyCode;
  locale: "en" | "ar";
  className?: string;
}) {
  return <span className={className} dir="ltr">{formatPrice(amount, currency, locale)}</span>;
}
