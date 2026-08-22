import { Link2 } from "lucide-react";
import { getPaymentProvider } from "@/lib/payments/registry";
import { getI18n } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OMTIcon } from "@/components/payments/icons/omt-icon";
import { WishIcon } from "@/components/payments/icons/wish-icon";

export const metadata = { title: "Payment instructions" };

/**
 * GET /payments/manual — the MANUAL (OMT/Whish) checkout landing page
 * (docs/PAYMENTS.md §manual methods). OMT and Whish have no hosted checkout
 * and no webhook: `createCheckout` mints this signed URL (same HMAC contract
 * as the simulated provider, verified through the provider's OWN
 * verifyWebhook so one verify path serves all), and the page shows the
 * customer how to pay offline — the exact amount + the unique reference to
 * include — with the steps for the chosen provider. The platform confirms
 * receipt from the /admin pending-payments card, then the booking / purchase
 * activates (the manual twin of a webhook confirm).
 */
export default async function ManualPaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, t } = await getI18n();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : raw[k]);

  const provider = one("provider")?.toUpperCase() === "WHISH" ? "WHISH" : one("provider")?.toUpperCase() === "OMT" ? "OMT" : null;
  const body = JSON.stringify({
    bookingId: one("bookingId") ?? undefined,
    campaignId: one("campaignId") ?? undefined,
    paymentId: one("paymentId") ?? undefined,
    ref: one("ref") ?? undefined,
    amount: Number(one("amount") ?? "0"),
    sig: one("sig") ?? undefined,
  });

  let verified = false;
  if (provider) {
    try {
      verified = (await getPaymentProvider(provider).verifyWebhook(new Headers(), body)) !== null;
    } catch {
      verified = false;
    }
  }
  const ref = one("ref");
  const amount = Number(one("amount") ?? "0");
  const description = one("desc") ?? "";

  if (!provider || !verified || !ref) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <Link2 className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-black text-ink-900 dark:text-ink-50">{t("payments.manualInvalid")}</h1>
        <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{t("payments.manualInvalidBody")}</p>
      </main>
    );
  }

  const methodName = provider === "OMT" ? t("payments.methodOmt") : t("payments.methodWhish");
  const steps =
    provider === "OMT"
      ? [t("payments.omtStep1"), t("payments.omtStep2"), t("payments.omtStep3")]
      : [t("payments.whishStep1"), t("payments.whishStep2"), t("payments.whishStep3")];

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl">
          {provider === "OMT" ? (
            <OMTIcon className="size-12" />
          ) : (
            <WishIcon className="size-12" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-black text-ink-900 dark:text-ink-50">
            {t("payments.manualTitle").replace("{method}", methodName)}
          </h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">{description}</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("payments.manualAmount")}</p>
            <p className="mt-1 text-2xl font-black text-ink-900 dark:text-ink-50">
              {`$${(amount / 100).toLocaleString(locale === "ar" ? "en-US" : "en-US")}`}
            </p>
            {description && <p className="mt-1 text-xs text-ink-400">{description}</p>}
          </div>

          <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t("payments.manualReference")}</p>
            <p className="mt-1 select-all font-mono text-lg font-black tracking-wide text-brand-600 dark:text-brand-400">{ref}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">{t("payments.manualReferenceHint")}</p>
          </div>

          <div>
            <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("payments.manualStepsTitle")}</p>
            <ol className="mt-2.5 space-y-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink-600 dark:text-ink-300">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-[11px] font-black text-brand-600 dark:text-brand-400">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <Badge variant="outline" className="w-full justify-center py-2 text-xs">
            {t("payments.manualConfirming")}
          </Badge>
          <p className="text-center text-[11px] leading-relaxed text-ink-400">{t("payments.manualNote")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
