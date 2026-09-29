import { Link } from "@/components/i18n/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { listGuaranteeClaims } from "@/lib/data/guarantee";
import { GUARANTEE_TERMS } from "@/lib/data/guarantee-terms";
import { GuaranteeClaimsCard } from "@/components/admin/guarantee-claims-card";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Guarantee claims" };

/** WorkersArena Guarantee — the admin claims queue (src/lib/data/guarantee.ts). */
export default async function GuaranteeClaimsPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");

  const [{ t }, claims] = await Promise.all([getI18n(), listGuaranteeClaims()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-600">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("guarantee.adminBack")}
      </Link>
      <div>
        <h1 className="text-2xl font-black text-ink-900 dark:text-ink-50">{t("guarantee.adminTitle")}</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {t("guarantee.terms")
            .replace("{days}", String(GUARANTEE_TERMS.windowDays))
            .replace("{cap}", String(GUARANTEE_TERMS.capMinor / 100))}
        </p>
      </div>
      <GuaranteeClaimsCard claims={claims} />
    </div>
  );
}
