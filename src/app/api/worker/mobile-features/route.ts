import { NextResponse } from "next/server";

/**
 * GET /api/worker/mobile-features
 * Returns mobile-exclusive feature data including:
 * - Push notification preferences
 * - Quick-respond templates
 * - Offline balance cache
 * - Mobile-only bonuses
 */

interface PushNotificationPreference {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  enabled: boolean;
  type: "leads" | "bookings" | "payments" | "promotions" | "achievements";
}

interface QuickRespondTemplate {
  id: string;
  name: string;
  nameAr: string;
  message: string;
  messageAr: string;
  category: "accept" | "decline" | "reschedule" | "follow_up";
  usageCount: number;
}

interface OfflineBalance {
  credits: number;
  tokens: number;
  lastSynced: string;
  isStale: boolean;
}

interface MobileBonus {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  reward: number;
  rewardType: "credits" | "tokens";
  expiresAt: string;
  claimed: boolean;
}

interface MobileFeatures {
  pushPreferences: PushNotificationPreference[];
  quickRespondTemplates: QuickRespondTemplate[];
  offlineBalance: OfflineBalance;
  mobileBonuses: MobileBonus[];
  appVersion: string;
  lastAppUpdate: string;
  isMobileApp: boolean;
}

function generatePushPreferences(): PushNotificationPreference[] {
  return [
    {
      id: "new_lead",
      name: "New Lead Alert",
      nameAr: "تنبيه عميل محتمل جديد",
      description: "Get notified when a new customer inquiry arrives",
      descriptionAr: "احصل على إشعار عند وصول استفسار عميل جديد",
      enabled: true,
      type: "leads",
    },
    {
      id: "booking_request",
      name: "Booking Request",
      nameAr: "طلب حجز",
      description: "Get notified when a customer books your service",
      descriptionAr: "احصل على إشعار عند حجز العميل لخدمتك",
      enabled: true,
      type: "bookings",
    },
    {
      id: "payment_received",
      name: "Payment Received",
      nameAr: "تم استلام الدفع",
      description: "Get notified when you receive a payment",
      descriptionAr: "احصل على إشعار عند استلام الدفع",
      enabled: true,
      type: "payments",
    },
    {
      id: "promotional_offers",
      name: "Promotional Offers",
      nameAr: "العروض الترويجية",
      description: "Get notified about special offers and bonuses",
      descriptionAr: "احصل على إشعارات عن العروض الخاصة والمكافآت",
      enabled: false,
      type: "promotions",
    },
    {
      id: "achievement_unlocked",
      name: "Achievement Unlocked",
      nameAr: "تم فتح إنجاز",
      description: "Get notified when you earn a new badge or achievement",
      descriptionAr: "احصل على إشعار عند كسب شارة أو إنجاز جديد",
      enabled: true,
      type: "achievements",
    },
  ];
}

function generateQuickRespondTemplates(): QuickRespondTemplate[] {
  return [
    {
      id: "accept_1",
      name: "Standard Accept",
      nameAr: "قبول عادي",
      message:
        "Thank you for your inquiry! I'm available at the requested time. Looking forward to helping you.",
      messageAr:
        "شكراً لاستفسارك! أنا متاح في الوقت المطلوب. أتطلع لمساعدتك.",
      category: "accept",
      usageCount: 45,
    },
    {
      id: "accept_2",
      name: "Emergency Accept",
      nameAr: "قبول طوارئ",
      message:
        "I understand this is urgent. I can be there within 30 minutes. Is that works for you?",
      messageAr:
        "أفهم أن هذا عاجل. يمكنني أن أكون هناك خلال 30 دقيقة. هل هذا مناسب لك؟",
      category: "accept",
      usageCount: 12,
    },
    {
      id: "decline_1",
      name: "Polite Decline",
      nameAr: "رفض مهذب",
      message:
        "Thank you for reaching out. Unfortunately, I'm fully booked during that time. I recommend checking back next week.",
      messageAr:
        "شكراً لتواصلك. للأسف، أنا محجوز بالكامل خلال ذلك الوقت. أنصحك بالتحقق الأسبوع القادم.",
      category: "decline",
      usageCount: 8,
    },
    {
      id: "reschedule_1",
      name: "Reschedule Request",
      nameAr: "طلب إعادة جدولة",
      message:
        "I'd love to help! However, that time doesn't work for me. Would [alternative time] work better?",
      messageAr:
        "أود المساعدة! ومع ذلك، ذلك الوقت لا يناسبني. هل [وقت بديل] سيكون أفضل؟",
      category: "reschedule",
      usageCount: 15,
    },
    {
      id: "follow_up_1",
      name: "Follow Up",
      nameAr: "متابعة",
      message:
        "Hi! Just checking in to see if you still need help with your project. I'm available this week.",
      messageAr:
        "مرحباً! فقط أريد التحقق مما إذا كنت لا تزال بحاجة للمساعدة في مشروعك. أنا متاح هذا الأسبوع.",
      category: "follow_up",
      usageCount: 22,
    },
  ];
}

function generateOfflineBalance(): OfflineBalance {
  return {
    credits: 25,
    tokens: 15,
    lastSynced: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    isStale: false,
  };
}

function generateMobileBonuses(): MobileBonus[] {
  const now = new Date();
  return [
    {
      id: "mobile_bonus_1",
      name: "Mobile First Booking",
      nameAr: "أول حجز عبر الهاتف",
      description:
        "Complete your first booking through the mobile app for bonus credits",
      descriptionAr:
        "أكمل أول حجز عبر تطبيق الهاتف للحصول على رصيد إضافي",
      reward: 10,
      rewardType: "credits",
      expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
      claimed: false,
    },
    {
      id: "mobile_bonus_2",
      name: "Push Notification Response",
      nameAr: "استجابة إشعار الدفع",
      description:
        "Respond to a lead within 5 minutes of push notification for bonus tokens",
      descriptionAr:
        "الرد على عميل محتمل خلال 5 دقائق من إشعار الدفع للحصول على رموز إضافية",
      reward: 5,
      rewardType: "tokens",
      expiresAt: new Date(now.getTime() + 60 * 86400000).toISOString(),
      claimed: false,
    },
    {
      id: "mobile_bonus_3",
      name: "App Install Bonus",
      nameAr: "مكافأة تثبيت التطبيق",
      description: "Welcome bonus for installing the mobile app",
      descriptionAr: "مكافأة ترحيب لتثبيت تطبيق الهاتف",
      reward: 25,
      rewardType: "credits",
      expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
      claimed: true,
    },
  ];
}

export async function GET() {
  try {
    const data: MobileFeatures = {
      pushPreferences: generatePushPreferences(),
      quickRespondTemplates: generateQuickRespondTemplates(),
      offlineBalance: generateOfflineBalance(),
      mobileBonuses: generateMobileBonuses(),
      appVersion: "1.2.0",
      lastAppUpdate: "2026-08-25",
      isMobileApp: true,
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch mobile features" },
      { status: 500 }
    );
  }
}
