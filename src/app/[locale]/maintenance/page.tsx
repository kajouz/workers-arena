import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { Link } from "@/components/i18n/link";
import { getI18n } from "@/lib/i18n/server";

// Served (via the proxy's rewrite) in place of every public page while
// maintenance mode is on — see src/proxy.ts. Kept outside the (public) group
// so the header's links don't lead back to more of this page.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MaintenancePage() {
  const { t } = await getI18n();
  return (
    <main id="main" className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
        <Wrench className="size-8" />
      </span>
      <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50">{t("maintenance.title")}</h1>
      <p className="max-w-md text-ink-600 dark:text-ink-300">{t("maintenance.body")}</p>
      <Link href="/auth/login" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">
        {t("maintenance.admin")}
      </Link>
    </main>
  );
}
