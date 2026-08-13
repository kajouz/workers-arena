import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, RadioTower } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { listPushSubscriptions } from "@/lib/notifications/push-store";
import { PushSubscriptionManager } from "@/components/dashboard/push-subscription-manager";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Push subscriptions" };

export default async function AdminPushSubscriptionsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { t } = await getI18n();
  const subscriptions = await listPushSubscriptions();

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
            <RadioTower className="size-6 text-brand-500" /> {t("admin.pushSubsTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("admin.pushSubsSubtitle")}</p>
        </div>
      </div>

      <div className="mt-8">
        <PushSubscriptionManager initial={subscriptions} />
      </div>
    </div>
  );
}
