import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getNotificationsList, getNotificationsUnreadCount } from "@/lib/data/repo";

export const revalidate = 0;

/** GET /api/notifications — the signed-in user's list + unread count for the header bell. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ items: [], unread: 0 });
  const [items, unread] = await Promise.all([
    getNotificationsList(session.id),
    getNotificationsUnreadCount(session.id),
  ]);
  return NextResponse.json({ items: items.slice(0, 10), unread });
}
