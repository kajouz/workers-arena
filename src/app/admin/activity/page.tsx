import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { listActivityEntries } from "@/lib/data/activity";
import { ActivityHistoryManager } from "@/components/dashboard/activity-history-manager";

export const metadata = { title: "Activity history" };

export default async function AdminActivityHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { t } = await getI18n();
  const initial = await listActivityEntries({ page: 1, pageSize: 20 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("admin.backToOverview")}
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            <History className="size-6 text-brand-500" /> {t("admin.activityHistoryTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("admin.activityHistorySubtitle")}</p>
        </div>
      </div>

      <div className="mt-8">
        <ActivityHistoryManager initial={initial} />
      </div>
    </div>
  );
}
