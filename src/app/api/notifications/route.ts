import { NextResponse } from "next/server";
import { getNotificationsList, getNotificationsUnreadCount } from "@/lib/data/repo";

export const revalidate = 0;

/** GET /api/notifications — list + unread count for the header bell. */
export async function GET() {
  const [items, unread] = await Promise.all([getNotificationsList(), getNotificationsUnreadCount()]);
  return NextResponse.json({ items: items.slice(0, 10), unread });
}
