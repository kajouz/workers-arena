import { getPrisma } from "@/lib/server/prisma";
import { pushNotification } from "./notifications";
import { recordSubscriptionEventOnce } from "./subscription-lifecycle-store";

const DAY_MS = 86_400_000;

function localeOf(languages: unknown): "en" | "ar" {
  return Array.isArray(languages) && (languages[0] as { code?: string } | undefined)?.code === "ar" ? "ar" : "en";
}

/** Scan real subscriptions, claim each reminder once, and record expiry events. */
export async function prismaRunSubscriptionReminderEngine(): Promise<{
  dispatched: number;
  alreadySent: number;
  total: number;
}> {
  const prisma = getPrisma();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * DAY_MS);
  const rows = await prisma.subscription.findMany({
    where: {
      status: { not: "CANCELED" },
      expiresAt: { lte: horizon },
    },
    include: {
      worker: { select: { id: true, nameEn: true, nameAr: true, phone: true, email: true, languages: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  let dispatched = 0;
  let alreadySent = 0;
  for (const row of rows) {
    const remainingDays = Math.round((row.expiresAt.getTime() - now.getTime()) / DAY_MS);
    const expired = row.expiresAt.getTime() <= now.getTime();
    const window = expired ? 4 : remainingDays === 7 ? 1 : remainingDays === 3 ? 2 : remainingDays === 1 ? 3 : 0;
    if (window === 0) continue;

    const claimed = await prisma.subscription.updateMany({
      where: { id: row.id, lastReminderSent: { lt: window } },
      data: {
        lastReminderSent: window,
        ...(expired ? { status: "EXPIRED" as const } : {}),
      },
    });
    if (claimed.count === 0) {
      alreadySent += 1;
      continue;
    }

    if (expired) {
      await recordSubscriptionEventOnce({
        workerId: row.workerId,
        subscriptionId: row.id,
        type: "expired",
        fromPlan: row.plan.toLowerCase() as "basic" | "professional" | "premium" | "enterprise",
        source: "cron",
      });
    }

    const locale = localeOf(row.worker.languages);
    const message = expired
      ? {
          type: "subscription" as const,
          titleEn: "Subscription expired",
          titleAr: "انتهى الاشتراك",
          bodyEn: `${row.worker.nameEn} — your profile is hidden from search results until you renew.`,
          bodyAr: `${row.worker.nameAr} — ملفك مخفي من نتائج البحث حتى التجديد.`,
          href: "/dashboard",
        }
      : {
          type: "subscription" as const,
          titleEn: `Subscription renews in ${remainingDays} day${remainingDays === 1 ? "" : "s"}`,
          titleAr: `الاشتراك يتجدد خلال ${remainingDays} ${remainingDays === 1 ? "يوم" : "أيام"}`,
          bodyEn: `${row.worker.nameEn} — renew to stay visible in search results.`,
          bodyAr: `${row.worker.nameAr} — جدّد لتبقى ظاهراً في نتائج البحث.`,
          href: "/dashboard",
        };
    await pushNotification(message, {
      name: row.worker.nameEn,
      email: row.worker.email ?? undefined,
      phone: row.worker.phone,
      locale,
    });
    dispatched += 1;
  }
  return { dispatched, alreadySent, total: rows.filter((row) => {
    const days = Math.round((row.expiresAt.getTime() - now.getTime()) / DAY_MS);
    return row.expiresAt.getTime() <= now.getTime() || days === 7 || days === 3 || days === 1;
  }).length };
}
