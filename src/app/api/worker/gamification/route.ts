import { NextResponse } from "next/server";

/**
 * GET /api/worker/gamification
 * Returns gamification data including:
 * - Badges earned and available
 * - Activity streaks
 * - Monthly challenges
 * - Progress tracking
 */

interface Badge {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  earned: boolean;
  earnedAt?: string;
  progress?: number;
  maxProgress?: number;
}

interface Streak {
  type: "daily" | "weekly" | "monthly";
  current: number;
  best: number;
  lastActivity: string;
  isActive: boolean;
}

interface Challenge {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  reward: number;
  rewardType: "credits" | "tokens" | "badge";
  progress: number;
  maxProgress: number;
  expiresAt: string;
  completed: boolean;
}

interface Achievement {
  id: string;
  name: string;
  nameAr: string;
  level: number;
  maxLevel: number;
  xp: number;
  xpToNextLevel: number;
  title: string;
  titleAr: string;
}

interface GamificationData {
  badges: Badge[];
  streaks: Streak[];
  challenges: Challenge[];
  achievement: Achievement;
  totalXP: number;
  level: number;
  pointsThisMonth: number;
}

function generateBadges(): Badge[] {
  return [
    {
      id: "quick_responder",
      name: "Quick Responder",
      nameAr: "المستجيب السريع",
      description: "Respond to 90% of leads within 1 hour",
      descriptionAr: "الرد على 90% من العملاء المحتملين خلال ساعة",
      icon: "⚡",
      earned: true,
      earnedAt: "2026-08-15",
    },
    {
      id: "five_star",
      name: "5-Star Worker",
      nameAr: "عامل 5 نجوم",
      description: "Maintain 5-star rating for 30 days",
      descriptionAr: "الحفاظ على تقييم 5 نجوم لمدة 30 يوماً",
      icon: "⭐",
      earned: true,
      earnedAt: "2026-08-20",
    },
    {
      id: "booking_master",
      name: "Booking Master",
      nameAr: "سيد الحجوزات",
      description: "Complete 50 bookings",
      descriptionAr: "إتمام 50 حجز",
      icon: "🏆",
      earned: false,
      progress: 67,
      maxProgress: 100,
    },
    {
      id: "streak_king",
      name: "Streak King",
      nameAr: "ملك التتابع",
      description: "Maintain a 30-day activity streak",
      descriptionAr: "الحفاظ على سلسلة نشاط لمدة 30 يوماً",
      icon: "🔥",
      earned: false,
      progress: 12,
      maxProgress: 30,
    },
    {
      id: "referral_champion",
      name: "Referral Champion",
      nameAr: "بطل الإحالات",
      description: "Refer 10 workers to the platform",
      descriptionAr: "إحالة 10 عمال إلى المنصة",
      icon: "🤝",
      earned: false,
      progress: 4,
      maxProgress: 10,
    },
    {
      id: "top_rated",
      name: "Top Rated",
      nameAr: "الأعلى تقييماً",
      description: "Be in the top 10% of workers in your category",
      descriptionAr: "كن في أعلى 10% من العمال في فئتك",
      icon: "👑",
      earned: true,
      earnedAt: "2026-08-01",
    },
    {
      id: "early_bird",
      name: "Early Bird",
      nameAr: "البومة الصباحية",
      description: "Complete 5 bookings before 9 AM",
      descriptionAr: "إتمام 5 حجوزات قبل الساعة 9 صباحاً",
      icon: "🌅",
      earned: false,
      progress: 3,
      maxProgress: 5,
    },
    {
      id: "social_butterfly",
      name: "Social Butterfly",
      nameAr: "الفراشة الاجتماعية",
      description: "Get 20 reviews from customers",
      descriptionAr: "الحصول على 20 تقييم من العملاء",
      icon: "🦋",
      earned: false,
      progress: 12,
      maxProgress: 20,
    },
  ];
}

function generateStreaks(): Streak[] {
  return [
    {
      type: "daily",
      current: 12,
      best: 45,
      lastActivity: "2026-08-28",
      isActive: true,
    },
    {
      type: "weekly",
      current: 8,
      best: 12,
      lastActivity: "2026-08-28",
      isActive: true,
    },
    {
      type: "monthly",
      current: 3,
      best: 6,
      lastActivity: "2026-08-28",
      isActive: true,
    },
  ];
}

function generateChallenges(): Challenge[] {
  const now = new Date();
  return [
    {
      id: "ch_1",
      name: "Weekend Warrior",
      nameAr: "محارب عطلة نهاية الأسبوع",
      description: "Complete 5 bookings this weekend",
      descriptionAr: "إتمام 5 حجوزات هذا عطلة نهاية الأسبوع",
      reward: 50,
      rewardType: "credits",
      progress: 2,
      maxProgress: 5,
      expiresAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
      completed: false,
    },
    {
      id: "ch_2",
      name: "Review Magnet",
      nameAr: "مغناطيس التقييمات",
      description: "Get 5 five-star reviews this month",
      descriptionAr: "الحصول على 5 تقييمات 5 نجوم هذا الشهر",
      reward: 25,
      rewardType: "tokens",
      progress: 3,
      maxProgress: 5,
      expiresAt: new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).toISOString(),
      completed: false,
    },
    {
      id: "ch_3",
      name: "Speed Demon",
      nameAr: "شيطان السرعة",
      description: "Respond to 10 leads within 30 minutes",
      descriptionAr: "الرد على 10 عملاء محتملين خلال 30 دقيقة",
      reward: 30,
      rewardType: "credits",
      progress: 7,
      maxProgress: 10,
      expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
      completed: false,
    },
    {
      id: "ch_4",
      name: "Category King",
      nameAr: "ملك الفئة",
      description: "Get the highest rating in your category",
      descriptionAr: "الحصول على أعلى تقييم في فئتك",
      reward: 100,
      rewardType: "badge",
      progress: 1,
      maxProgress: 1,
      expiresAt: new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).toISOString(),
      completed: true,
    },
  ];
}

function generateAchievement(): Achievement {
  return {
    id: "ach_1",
    name: "Master Tradesperson",
    nameAr: "الحرفي المحترف",
    level: 7,
    maxLevel: 10,
    xp: 7500,
    xpToNextLevel: 2500,
    title: "Expert",
    titleAr: "خبير",
  };
}

export async function GET() {
  try {
    const data: GamificationData = {
      badges: generateBadges(),
      streaks: generateStreaks(),
      challenges: generateChallenges(),
      achievement: generateAchievement(),
      totalXP: 7500,
      level: 7,
      pointsThisMonth: 450,
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch gamification data" },
      { status: 500 }
    );
  }
}
