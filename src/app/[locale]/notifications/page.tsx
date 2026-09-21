import { CheckCheck, BellRing } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/auth-demo";
import { getNotificationsList, getNotificationsUnreadCount } from "@/lib/data/repo";
import { markAllReadAction, markReadAction } from "@/app/actions/business";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PushNotificationCard } from "@/components/notifications/push-notification-card";
import { timeAgo, cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

const TYPE_STYLE: Record<string, string> = {
  subscription: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  verification: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  lead: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  review: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  system: "bg-ink-500/10 text-ink-600 dark:text-ink-400",
  campaign: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
  bookingRequest: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  bookingConfirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bookingDeclined: "bg-red-500/10 text-red-700 dark:text-red-400",
  bookingCancelled: "bg-red-400/10 text-red-600 dark:text-red-400",
  bookingReminder: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bookingCompleted: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
};

export default async function NotificationsPage() {
  const { locale, t } = await getI18n();
  const session = await getSession();
  const [items, unread] = await Promise.all([getNotificationsList(), getNotificationsUnreadCount()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">{t("notifications.title")}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("notifications.subtitle")}</p>
        </div>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <Button variant="outline" size="sm">
              <CheckCheck className="size-4" /> {t("notifications.markAll")}
            </Button>
          </form>
        )}
      </div>

      {session && (
        <div className="mt-8">
          <PushNotificationCard />
        </div>
      )}

      <div className={session ? "mt-6 space-y-3" : "mt-8 space-y-3"}>
        {items.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <BellRing className="size-10 text-ink-300 dark:text-ink-600" />
              <p className="font-bold text-ink-900 dark:text-ink-50">{t("notifications.empty")}</p>
              <p className="text-sm text-ink-400">{t("notifications.emptyBody")}</p>
            </CardContent>
          </Card>
        )}

        {items.map((n) => (
          <Card key={n.id} className={cn("transition-opacity", !n.read && "border-brand-500/40 bg-brand-500/[0.03]")}>
            <CardContent className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5">
              <Badge className={cn("mt-0.5 shrink-0 px-2.5 py-1", TYPE_STYLE[n.type])}>
                {t(`notifications.types.${n.type}`)}
              </Badge>
              <div className="order-last min-w-0 flex-1 basis-full sm:order-none sm:basis-0">
                <p className="text-sm font-black text-ink-900 dark:text-ink-50">{locale === "ar" ? n.titleAr : n.titleEn}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                  {locale === "ar" ? n.bodyAr : n.bodyEn}
                </p>
                <p className="mt-1.5 text-xs text-ink-400">{timeAgo(n.time, locale)}</p>
              </div>
              {!n.read && (
                <form action={markReadAction} className="ms-auto shrink-0 sm:ms-0">
                  <input type="hidden" name="id" value={n.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {t("notifications.markRead")}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
