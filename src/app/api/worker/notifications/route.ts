import { NextResponse } from "next/server";

/**
 * GET /api/worker/notifications
 * Returns smart notifications for the worker including:
 * - Low credit/token balance warnings
 * - Token expiry alerts
 * - Tier upgrade/downgrade notifications
 * - Achievement unlocked notifications
 * - Promoted campaign status alerts
 */

interface SmartNotification {
  id: string;
  type:
    | "low_balance"
    | "token_expiry"
    | "tier_change"
    | "achievement"
    | "campaign"
    | "promo";
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  severity: "info" | "warning" | "success" | "urgent";
  actionLabel?: string;
  actionLabelAr?: string;
  actionUrl?: string;
  createdAt: string;
  read: boolean;
}

function generateNotifications(): SmartNotification[] {
  const now = new Date();

  return [
    {
      id: "notif_1",
      type: "low_balance",
      title: "Low Credit Balance",
      titleAr: "رصيد منخفض",
      message:
        "You have only 5 credits left. Buy more to continue responding to leads.",
      messageAr:
        "لديك فقط 5 رصيد. اشترِ المزيد لمواصلة الرد على العملاء المحتملين.",
      severity: "warning",
      actionLabel: "Buy Credits",
      actionLabelAr: "شراء رصيد",
      actionUrl: "/dashboard?tab=credits",
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
      read: false,
    },
    {
      id: "notif_2",
      type: "token_expiry",
      title: "Tokens Expiring Soon",
      titleAr: "الرموز تنتهي قريباً",
      message:
        "12 tokens will expire in 30 days. Use them to apply for jobs before they're lost.",
      messageAr:
        "12 رمز ستنهي صلاحيتها خلال 30 يوماً. استخدمها للتقديم على الوظائف قبل فوات الأوان.",
      severity: "urgent",
      actionLabel: "Browse Jobs",
      actionLabelAr: "تصفح الوظائف",
      actionUrl: "/search",
      createdAt: new Date(now.getTime() - 7200000).toISOString(),
      read: false,
    },
    {
      id: "notif_3",
      type: "tier_change",
      title: "🎉 Tier Upgrade Available!",
      titleAr: "🎉 ترقية متاحة!",
      message:
        "You're only $2,501 away from Gold tier (10% commission). Keep growing!",
      messageAr:
        "أنت على بُعد $2,501 فقط من الشtier الذهبي (عمولة 10%). واصل النمو!",
      severity: "success",
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      read: false,
    },
    {
      id: "notif_4",
      type: "campaign",
      title: "Promoted Campaign Paused",
      titleAr: "تم إيقاف الحملة الترويجية",
      message:
        "Your promoted profile campaign was paused due to budget exhaustion. Top up to resume visibility.",
      messageAr:
        "تم إيقاف حملة ملفك الشخصي المروج بسبب نفقات الميزانية. أعد التعبئة لاستئناف الظهور.",
      severity: "warning",
      actionLabel: "Edit Budget",
      actionLabelAr: "تعديل الميزانية",
      actionUrl: "/dashboard?tab=promoted",
      createdAt: new Date(now.getTime() - 172800000).toISOString(),
      read: true,
    },
    {
      id: "notif_5",
      type: "achievement",
      title: "🏆 Achievement Unlocked!",
      titleAr: "🏆 تم فتح إنجاز!",
      message:
        "You've earned the 'Quick Responder' badge for responding to 90% of leads within 1 hour!",
      messageAr:
        "لقد حصلت على شارة 'المستجيب السريع' للرد على 90% من العملاء المحتملين خلال ساعة!",
      severity: "success",
      createdAt: new Date(now.getTime() - 259200000).toISOString(),
      read: true,
    },
    {
      id: "notif_6",
      type: "promo",
      title: "Special Offer: 20% Bonus Credits",
      titleAr: "عرض خاص: 20% رصيد إضافي",
      message:
        "Limited time: Buy 30+ credits and get 20% bonus. Ends in 48 hours!",
      messageAr:
        "عرض محدود: اشترِ 30+ رصيد واحصل على 20% إضافية. ينتهي خلال 48 ساعة!",
      severity: "info",
      actionLabel: "Claim Offer",
      actionLabelAr: "احصل على العرض",
      actionUrl: "/dashboard?tab=credits",
      createdAt: new Date(now.getTime() - 345600000).toISOString(),
      read: true,
    },
  ];
}

export async function GET() {
  try {
    const notifications = generateNotifications();
    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications,
      unreadCount,
      hasUrgent: notifications.some(
        (n) => n.severity === "urgent" && !n.read
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
