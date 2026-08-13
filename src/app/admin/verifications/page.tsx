import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, History, XCircle } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { getVerificationLogs } from "@/lib/data/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradientAvatar } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Verification history" };

export default async function AdminVerificationsPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard");

  const { locale, t } = await getI18n();
  const logs = await getVerificationLogs();

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
            <History className="size-6 text-brand-500" /> {t("admin.verificationHistoryTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("admin.verificationHistorySubtitle")}</p>
        </div>
        <Badge variant="outline" className="px-3 py-1.5">
          {logs.length} {t("admin.verificationEntries")}
        </Badge>
      </div>

      <div className="mt-8 space-y-3">
        {logs.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <History className="size-10 text-ink-300 dark:text-ink-600" />
              <p className="font-bold text-ink-900 dark:text-ink-50">{t("admin.verificationEmpty")}</p>
              <p className="text-sm text-ink-400">{t("admin.verificationEmptyBody")}</p>
            </CardContent>
          </Card>
        )}

        {logs.map((log, i) => (
          <Card key={log.id} className="overflow-hidden">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
              <GradientAvatar name={log.workerNameEn} hue={90} className="size-10 shrink-0" />
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? log.workerNameAr : log.workerNameEn}
                  </p>
                  <Badge
                    variant={log.action === "approved" ? "success" : "danger"}
                    className="shrink-0 px-2.5 py-1"
                  >
                    {log.action === "approved" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                    {log.action === "approved" ? t("verification.approve") : t("verification.reject")}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                  {t("admin.verificationBy")} <span className="font-semibold text-ink-700 dark:text-ink-200">{log.adminName}</span> · {timeAgo(log.time, locale)}
                </p>
              </div>
              {i === 0 && (
                <Badge variant="premium" className="ms-auto shrink-0">
                  {t("admin.latest")}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-brand-500/20 bg-brand-500/[0.03]">
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.verificationAuditNote")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-500 dark:text-ink-400">
          {t("admin.verificationAuditBody")}
        </CardContent>
      </Card>
    </div>
  );
}
