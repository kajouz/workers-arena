import { Link } from "@/components/i18n/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth-demo";
import { getI18n } from "@/lib/i18n/server";
import { getReviewModerationStats, listReviewQueue } from "@/lib/data/review-moderation-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewModerationPanel } from "@/components/admin/review-moderation-panel";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Review moderation" };

/** How many already-decided reviews the trail shows under the queue. */
const DECIDED_TRAIL = 10;

export default async function AdminReviewsPage() {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");

  const { t } = await getI18n();
  const [queue, stats] = await Promise.all([listReviewQueue(), getReviewModerationStats()]);
  // Only reviews an admin actually decided (`moderatedAt`) belong in the trail:
  // the demo dataset's pre-moderation reviews are treated as approved so their
  // ratings survive, but nobody moderated them and listing them as "recently
  // decided by —" would invent a decision history that does not exist.
  const decided = queue
    .filter((item) => item.moderatedAt)
    .sort((a, b) => (b.moderatedAt ?? "").localeCompare(a.moderatedAt ?? ""))
    .slice(0, DECIDED_TRAIL);

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
            <ShieldCheck className="size-6 text-brand-500" /> {t("admin.reviewModerationTitle")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-500 dark:text-ink-400">{t("admin.reviewModerationSubtitle")}</p>
        </div>
        <Badge variant="outline" className="px-3 py-1.5">
          {stats.pending} {t("admin.reviewModerationEntries")}
        </Badge>
      </div>

      <div className="mt-8">
        <ReviewModerationPanel pending={queue.filter((i) => i.status === "pending")} decided={decided} stats={stats} />
      </div>

      <Card className="mt-6 border-brand-500/20 bg-brand-500/[0.03]">
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.reviewAuditNote")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-500 dark:text-ink-400">{t("admin.reviewAuditBody")}</CardContent>
      </Card>
    </div>
  );
}
