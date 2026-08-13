import type { BookingEmailContext, CampaignRefundContext, Notification } from "./types";
import { daysUntil, REMINDER_WINDOW_DAYS, subscriptionStatus } from "./subscriptions";
import { WORKERS } from "./workers";
import { dispatch } from "@/lib/notifications/dispatcher";
import type { NotificationRecipient } from "@/lib/notifications/types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * NOTIFICATION INBOX (dual adapter — mirrors src/lib/notifications/push-store.ts)
 * ────────────────────────────────────────────────────────────────────────────
 * One API surface (getNotifications / getUnreadCount / markNotificationRead /
 * markAllNotificationsRead / pushNotification) backed by two adapters:
 *
 *   • demo   — the seeded in-memory inbox (default). No database needed; the
 *     array is the persistence layer for the demo dataset.
 *   • prisma — production. Persists to the `Notification` Prisma model
 *     (prisma/schema.prisma): the recipient's user row is resolved from their
 *     email (falling back to the seeded admin owner, mirroring how prisma/seed.ts
 *     attaches every worker to the admin user), `channel: IN_APP` is stamped,
 *     and the original app-level `type` + `href` are round-tripped through the
 *     `data` JSON column (the DB enum is coarser than the app's type union).
 *     Selected when demo mode is OFF (DEMO_MODE=false) and DATABASE_URL is set —
 *     the same gate as src/lib/server/prisma.ts.
 *
 * Outbound delivery (email / sms / push / whatsapp) stays decoupled: every new
 * notification also fans out through the channel dispatcher
 * (src/lib/notifications) via `dispatch()`, so real providers are used when
 * configured and the console providers log everything in demo mode.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Deterministic inbox id for a subscription reminder — shared with the expiry
 * reminder engine (src/lib/notifications/reminders.ts) so a cron run can skip
 * workers whose seeded reminder is already in the inbox. */
export function seededReminderId(kind: "reminder" | "expired", workerId: string, days?: number): string {
  return kind === "expired" ? `n-exp-${workerId}` : `n-rem-${workerId}-${days}`;
}

/* ───────────────────────────── Adapter selection ───────────────────────────── */

/** Which adapter is active. Exported for tests and observability. */
export function inboxAdapterMode(): "demo" | "prisma" {
  // Production requires demo mode OFF + a configured DB.
  if (process.env.DEMO_MODE !== "false") return "demo";
  return process.env.DATABASE_URL ? "prisma" : "demo";
}

/* ────────────────────────────── Demo adapter ────────────────────────────── */

/** Seed a realistic inbox once per process (demo mode only). */
function seed(): Notification[] {
  const now = Date.now();
  const items: Notification[] = [
    {
      id: "n-1",
      type: "system",
      titleEn: "Welcome to WorkersArena",
      titleAr: "مرحباً بك في وركرز أرينا",
      bodyEn: "Complete your profile to get 3× more profile views.",
      bodyAr: "أكمل ملفك لتحصل على 3× مشاهدات لملفك.",
      href: "/dashboard",
      time: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
      read: true,
    },
    {
      id: "n-2",
      type: "lead",
      titleEn: "New service request",
      titleAr: "طلب خدمة جديد",
      bodyEn: "A customer requested a quote for a plumbing job.",
      bodyAr: "طلب عميل عرض سعر لمهمة سباكة.",
      href: "/dashboard",
      time: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      read: false,
    },
    {
      id: "n-3",
      type: "review",
      titleEn: "New 5-star review",
      titleAr: "تقييم جديد بخمس نجوم",
      bodyEn: "Noor E. left you a glowing review.",
      bodyAr: "ترك لك نور تقييماً رائعاً.",
      href: "/dashboard",
      time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      read: false,
    },
  ];

  // ── Subscription expiry reminders (7 / 3 / 1 day + expired) ────────────────
  for (const w of WORKERS) {
    const status = subscriptionStatus(w.subscription);
    const days = daysUntil(w.subscription.expiresAt);
    if (status === "expired") {
      items.unshift({
        id: seededReminderId("expired", w.id),
        type: "subscription",
        titleEn: "Subscription expired",
        titleAr: "انتهى الاشتراك",
        bodyEn: `${w.nameEn} — your profile is hidden until you renew.`,
        bodyAr: `${w.nameAr} — ملفك مخفي حتى التجديد.`,
        href: "/dashboard",
        time: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
        read: false,
      });
    } else if ((REMINDER_WINDOW_DAYS as readonly number[]).includes(days)) {
      items.unshift({
        id: seededReminderId("reminder", w.id, days),
        type: "subscription",
        titleEn: `Subscription renews in ${days} day${days === 1 ? "" : "s"}`,
        titleAr: `الاشتراك يتجدد خلال ${days} ${days === 1 ? "يوم" : "أيام"}`,
        bodyEn: `${w.nameEn} — renew to stay visible in search results.`,
        bodyAr: `${w.nameAr} — جدّد لتبقى ظاهراً في نتائج البحث.`,
        href: "/dashboard",
        time: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
        read: false,
      });
    }
  }

  return items;
}

// In demo mode the inbox is a single global feed (one seeded array for the whole
// demo dataset). In prisma mode `store` is never read — rows come from the DB —
// so we only pay for the seed when it's actually the active adapter. Note this
// runs at module load (before vitest stubs env), and the test host has no
// DEMO_MODE set, so tests still land in demo mode and get the seeded store.
//
// The store lives on globalThis (not module scope) for the same reason as the
// demo booking store: Turbopack dev loads a module once per entry graph, so a
// "payment received" notification pushed from the simulated-checkout API route
// would land in the route graph's copy and never appear on /notifications.
// globalThis is shared across every graph in the same dev-server process.
const INBOX_KEY = "__workersArenaDemoInbox";
const inboxGlobal = globalThis as Record<string, unknown>;
const store: Notification[] =
  (inboxGlobal[INBOX_KEY] as Notification[] | undefined) ??
  (inboxGlobal[INBOX_KEY] = inboxAdapterMode() === "demo" ? seed() : []);

/* ───────────────────────────── Prisma adapter ───────────────────────────── */

/**
 * The app's notification `type` union is richer than the DB enum — the original
 * value is stored in the `data` JSON column and preferred on read-back, so the
 * round trip is lossless.
 */
type DbNotificationType =
  | "LEAD"
  | "REVIEW"
  | "VERIFICATION"
  | "SYSTEM"
  | "SUBSCRIPTION_REMINDER"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT"
  | "ADMIN_ALERT"
  | "PROMO"
  | "BOOKING_REQUEST"
  | "BOOKING_CONFIRMED"
  | "BOOKING_DECLINED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REMINDER"
  | "BOOKING_COMPLETED"
  | "BOOKING_PAID"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_REFUND"
  | "BOOKING_VISIT_SCHEDULED"
  | "CAMPAIGN_REFUNDED";

const APP_TYPE_TO_DB: Record<Notification["type"], DbNotificationType> = {
  lead: "LEAD",
  review: "REVIEW",
  verification: "VERIFICATION",
  system: "SYSTEM",
  subscription: "SUBSCRIPTION_REMINDER",
  campaign: "PROMO",
  bookingRequest: "BOOKING_REQUEST",
  bookingConfirmed: "BOOKING_CONFIRMED",
  bookingDeclined: "BOOKING_DECLINED",
  bookingCancelled: "BOOKING_CANCELLED",
  bookingReminder: "BOOKING_REMINDER",
  bookingCompleted: "BOOKING_COMPLETED",
  bookingPaid: "BOOKING_PAID",
  bookingRescheduled: "BOOKING_RESCHEDULED",
  bookingRefund: "BOOKING_REFUND",
  recurringVisitScheduled: "BOOKING_VISIT_SCHEDULED",
  campaignRefunded: "CAMPAIGN_REFUNDED",
};

/** Fallback when `data.type` is absent (rows written before/without it). */
const DB_TYPE_TO_APP: Record<string, Notification["type"]> = {
  LEAD: "lead",
  REVIEW: "review",
  VERIFICATION: "verification",
  SYSTEM: "system",
  SUBSCRIPTION_REMINDER: "subscription",
  SUBSCRIPTION_EXPIRED: "subscription",
  PAYMENT: "system",
  ADMIN_ALERT: "system",
  PROMO: "campaign",
  BOOKING_REQUEST: "bookingRequest",
  BOOKING_CONFIRMED: "bookingConfirmed",
  BOOKING_DECLINED: "bookingDeclined",
  BOOKING_CANCELLED: "bookingCancelled",
  BOOKING_REMINDER: "bookingReminder",
  BOOKING_COMPLETED: "bookingCompleted",
  BOOKING_REFUND: "bookingRefund",
  BOOKING_VISIT_SCHEDULED: "recurringVisitScheduled",
  CAMPAIGN_REFUNDED: "campaignRefunded",
};

/** Lazy-loads the Prisma singleton — never constructed in demo mode. */
async function withPrisma<T>(fn: (db: import("@prisma/client").PrismaClient) => Promise<T>): Promise<T> {
  const { getPrisma } = await import("@/lib/server/prisma");
  return fn(getPrisma());
}

/**
 * Resolve the user row that owns this inbox record. Production looks the
 * recipient up by email; when no row matches (or no recipient is given) we fall
 * back to the seeded platform admin — the same owner prisma/seed.ts attaches
 * every worker to — so the required `userId` FK is always satisfiable.
 */
async function prismaOwnerId(
  db: import("@prisma/client").PrismaClient,
  recipient?: NotificationRecipient
): Promise<string | null> {
  if (recipient?.email) {
    const user = await db.user.findUnique({ where: { email: recipient.email }, select: { id: true } });
    if (user) return user.id;
  }
  const admin = await db.user.findUnique({ where: { email: "admin@workersarena.com" }, select: { id: true } });
  return admin?.id ?? null;
}

/** Shape of a `Notification` row — structural, so tests need no live DB. */
interface PrismaNotificationRow {
  id: string;
  type: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string | null;
  bodyAr: string | null;
  data: unknown;
  isRead: boolean;
  createdAt: Date;
}

/** Map a DB row back to the app's Notification shape (lossless via data.type). */
export function rowToNotification(row: PrismaNotificationRow): Notification {
  const data = (row.data ?? {}) as { href?: string; type?: Notification["type"] };
  return {
    id: row.id,
    type: data.type ?? DB_TYPE_TO_APP[row.type] ?? "system",
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    bodyEn: row.bodyEn ?? "",
    bodyAr: row.bodyAr ?? "",
    href: data.href,
    time: row.createdAt.toISOString(),
    read: row.isRead,
  };
}

/**
 * The demo inbox is one global feed; production is per-user. `ownerId` scopes a
 * query to one user's rows when provided (production TODO: thread the session
 * user id from the repo layer once NextAuth is wired — demo mode ignores it).
 */
async function prismaGetNotifications(ownerId?: string): Promise<Notification[]> {
  return withPrisma(async (db) => {
    const rows = await db.notification.findMany({
      where: ownerId ? { userId: ownerId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToNotification);
  });
}

async function prismaUnreadCount(ownerId?: string): Promise<number> {
  return withPrisma((db) =>
    db.notification.count({ where: { isRead: false, ...(ownerId ? { userId: ownerId } : {}) } })
  );
}

async function prismaMarkRead(id: string, ownerId?: string): Promise<void> {
  await withPrisma((db) =>
    db.notification.updateMany({
      where: { id, ...(ownerId ? { userId: ownerId } : {}) },
      data: { isRead: true, readAt: new Date() },
    })
  );
}

async function prismaMarkAllRead(ownerId?: string): Promise<void> {
  await withPrisma((db) =>
    db.notification.updateMany({
      where: ownerId ? { userId: ownerId } : undefined,
      data: { isRead: true, readAt: new Date() },
    })
  );
}

async function prismaPush(
  item: Omit<Notification, "id" | "time" | "read"> & { id?: string },
  recipient?: NotificationRecipient
): Promise<Notification> {
  return withPrisma(async (db) => {
    const ownerId = await prismaOwnerId(db, recipient);
    if (!ownerId) {
      console.warn("[notify:inbox] no owner user found — inbox row skipped (channels still dispatched)");
      return {
        ...item,
        id: item.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: new Date().toISOString(),
        read: false,
      };
    }
    const row = await db.notification.create({
      data: {
        userId: ownerId,
        type: APP_TYPE_TO_DB[item.type],
        channel: "IN_APP",
        titleEn: item.titleEn,
        titleAr: item.titleAr,
        bodyEn: item.bodyEn,
        bodyAr: item.bodyAr,
        data: { href: item.href, type: item.type },
      },
    });
    return rowToNotification(row);
  });
}

/* ───────────────────────────── Public API ───────────────────────────── */

/**
 * All notifications, newest first. `ownerId` scopes to one user in prisma mode
 * (production TODO: pass the acting session user id); demo mode ignores it and
 * returns the single global feed.
 */
export async function getNotifications(ownerId?: string): Promise<Notification[]> {
  return inboxAdapterMode() === "prisma"
    ? prismaGetNotifications(ownerId)
    : [...store].sort((a, b) => b.time.localeCompare(a.time));
}

export async function getUnreadCount(ownerId?: string): Promise<number> {
  return inboxAdapterMode() === "prisma" ? prismaUnreadCount(ownerId) : store.filter((n) => !n.read).length;
}

export async function markNotificationRead(id: string, ownerId?: string): Promise<void> {
  if (inboxAdapterMode() === "prisma") return prismaMarkRead(id, ownerId);
  const n = store.find((x) => x.id === id);
  if (n) n.read = true;
}

export async function markAllNotificationsRead(ownerId?: string): Promise<void> {
  if (inboxAdapterMode() === "prisma") return prismaMarkAllRead(ownerId);
  store.forEach((n) => (n.read = true));
}

/**
 * Push a new notification (e.g. after a renewal or verification decision).
 *
 * Persists the inbox record (demo: in-memory · production: prisma.notification)
 * and fans the same payload out to the enabled outbound channels (email / sms /
 * push / whatsapp) via the dispatcher. `recipient` carries addressing info
 * (name/email/phone) used by those channels; when omitted only the in-app inbox
 * record is created.
 *
 * `booking` / `campaignRefund` (optional) are OUTBOUND-ONLY structured
 * contexts — they ride the dispatched ChannelPayload so the email channel can
 * render the confirmation / refund variants (details cards), but they are
 * intentionally NOT stored on the inbox record (demo array / prisma `data`
 * JSON), which stays type-clean.
 */
export async function pushNotification(
  n: Omit<Notification, "id" | "time" | "read"> & {
    booking?: BookingEmailContext;
    campaignRefund?: CampaignRefundContext;
  },
  recipient?: NotificationRecipient
): Promise<Notification> {
  const { booking, campaignRefund, ...core } = n;
  const isPrisma = inboxAdapterMode() === "prisma";
  // Demo path stays synchronous (callers fire-and-forget and read the inbox
  // immediately); the prisma path awaits the write before returning the row.
  const item = isPrisma
    ? await prismaPush(core, recipient)
    : {
        ...core,
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: new Date().toISOString(),
        read: false,
      };
  if (!isPrisma) store.unshift(item);
  // Outbound channels fire-and-forget: a failing provider logs its result and
  // never breaks the action that created the notification.
  void dispatch({
    ...item,
    recipient,
    ...(booking ? { booking } : {}),
    ...(campaignRefund ? { campaignRefund } : {}),
  }).catch((err) => console.error("[notify] dispatch failed", err));
  return item;
}
