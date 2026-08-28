import { NextResponse } from "next/server";

/**
 * GET /api/worker/referrals
 * Returns referral revenue sharing data including:
 * - Unique referral code
 * - Referral earnings history
 * - Leaderboard ranking
 * - Bonus credit rules
 */

interface Referral {
  id: string;
  referredName: string;
  referredNameAr: string;
  status: "pending" | "completed" | "rewarded";
  joinedAt: string;
  firstPurchaseAt?: string;
  earnedCredits: number;
}

interface ReferralEarnings {
  totalEarned: number;
  thisMonth: number;
  lastMonth: number;
  pending: number;
  history: {
    date: string;
    description: string;
    descriptionAr: string;
    credits: number;
  }[];
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  nameAr: string;
  referrals: number;
  earned: number;
  isCurrentUser?: boolean;
}

interface ReferralProgram {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  activeReferred: number;
  earnings: ReferralEarnings;
  leaderboard: LeaderboardEntry[];
  bonusRules: {
    action: string;
    actionAr: string;
    reward: number;
    description: string;
    descriptionAr: string;
  }[];
  tierBenefits: {
    tier: string;
    tierAr: string;
    minReferrals: number;
    bonusMultiplier: number;
    perks: string[];
    perksAr: string[];
  }[];
}

function generateReferrals(): Referral[] {
  return [
    {
      id: "ref_1",
      referredName: "Ahmad Hassan",
      referredNameAr: "أحمد حسن",
      status: "rewarded",
      joinedAt: "2026-07-15",
      firstPurchaseAt: "2026-07-20",
      earnedCredits: 25,
    },
    {
      id: "ref_2",
      referredName: "Sara Khalil",
      referredNameAr: "سارة خليل",
      status: "completed",
      joinedAt: "2026-08-01",
      firstPurchaseAt: "2026-08-05",
      earnedCredits: 25,
    },
    {
      id: "ref_3",
      referredName: "Omar Mansour",
      referredNameAr: "عمر منصور",
      status: "pending",
      joinedAt: "2026-08-20",
      earnedCredits: 0,
    },
    {
      id: "ref_4",
      referredName: "Layla Nasser",
      referredNameAr: "ليلى ناصر",
      status: "pending",
      joinedAt: "2026-08-25",
      earnedCredits: 0,
    },
  ];
}

function generateEarnings(): ReferralEarnings {
  return {
    totalEarned: 125,
    thisMonth: 50,
    lastMonth: 75,
    pending: 0,
    history: [
      {
        date: "2026-08-05",
        description: "Referral reward: Sara Khalil",
        descriptionAr: "مكافأة إحالة: سارة خليل",
        credits: 25,
      },
      {
        date: "2026-07-20",
        description: "Referral reward: Ahmad Hassan",
        descriptionAr: "مكافأة إحالة: أحمد حسن",
        credits: 25,
      },
      {
        date: "2026-07-10",
        description: "Bonus: 3 referrals milestone",
        descriptionAr: "مكافأة: إنجاز 3 إحالات",
        credits: 50,
      },
      {
        date: "2026-06-15",
        description: "Referral reward: Khalid Omar",
        descriptionAr: "مكافأة إحالة: خالد عمر",
        credits: 25,
      },
    ],
  };
}

function generateLeaderboard(): LeaderboardEntry[] {
  return [
    { rank: 1, name: "Khaled A.", nameAr: "خالد أ.", referrals: 12, earned: 300 },
    { rank: 2, name: "Mohammad S.", nameAr: "محمد س.", referrals: 9, earned: 225 },
    { rank: 3, name: "Ali H.", nameAr: "علي ح.", referrals: 7, earned: 175 },
    {
      rank: 4,
      name: "You",
      nameAr: "أنت",
      referrals: 4,
      earned: 100,
      isCurrentUser: true,
    },
    { rank: 5, name: "Hassan M.", nameAr: "حسن م.", referrals: 3, earned: 75 },
    { rank: 6, name: "Bilal K.", nameAr: "بلال ك.", referrals: 2, earned: 50 },
    { rank: 7, name: "Omar R.", nameAr: "عمر ر.", referrals: 1, earned: 25 },
  ];
}

function generateBonusRules() {
  return [
    {
      action: "Referral signs up",
      actionAr: "المحال يسجل",
      reward: 5,
      description: "5 credits when referral creates an account",
      descriptionAr: "5 رصيد عند إنشاء الحساب",
    },
    {
      action: "Referral makes first purchase",
      actionAr: "المحال يقوم بأول شراء",
      reward: 25,
      description: "25 credits when referral buys credits/tokens",
      descriptionAr: "25 رصيد عند شراء الرصيد/الرموز",
    },
    {
      action: "Referral completes 5 bookings",
      actionAr: "المحال يكمل 5 حجوزات",
      reward: 50,
      description: "50 bonus credits for active referral",
      descriptionAr: "50 رصيد مكافأة للإحالات النشطة",
    },
    {
      action: "Monthly streak bonus",
      actionAr: "مكافأة الشهور المتتالية",
      reward: 20,
      description: "20 credits for each consecutive month with referral",
      descriptionAr: "20 رصيد لكل شهر متتالي مع إحالة",
    },
  ];
}

function generateTierBenefits() {
  return [
    {
      tier: "Bronze",
      tierAr: "برونزي",
      minReferrals: 0,
      bonusMultiplier: 1,
      perks: ["Base referral rewards"],
      perksAr: ["مكافآت إحالة الأساسية"],
    },
    {
      tier: "Silver",
      tierAr: "فضي",
      minReferrals: 5,
      bonusMultiplier: 1.25,
      perks: ["25% bonus on all referral rewards", "Priority support"],
      perksAr: ["25% مكافأة على مكافآت الإحالة", "دعم ذو أولوية"],
    },
    {
      tier: "Gold",
      tierAr: "ذهبي",
      minReferrals: 15,
      bonusMultiplier: 1.5,
      perks: [
        "50% bonus on all referral rewards",
        "Exclusive promotions",
        "Featured referrer badge",
      ],
      perksAr: [
        "50% مكافأة على مكافآت الإحالة",
        "عروض حصرية",
        "شارة المحيل المميز",
      ],
    },
    {
      tier: "Platinum",
      tierAr: "بلاتيني",
      minReferrals: 30,
      bonusMultiplier: 2,
      perks: [
        "100% bonus on all referral rewards",
        "VIP support",
        "Custom referral landing page",
        "Revenue share on sub-referrals",
      ],
      perksAr: [
        "100% مكافأة على مكافآت الإحالة",
        "دعم VIP",
        "صفحة هبوط إحالة مخصصة",
        "حصة إيرادات من الإحالات الفرعية",
      ],
    },
  ];
}

export async function GET() {
  try {
    const referrals = generateReferrals();
    const earnings = generateEarnings();
    const leaderboard = generateLeaderboard();
    const bonusRules = generateBonusRules();
    const tierBenefits = generateTierBenefits();

    const program: ReferralProgram = {
      referralCode: "KHALED2026",
      referralLink: "https://workersarena.com/ref/KHALED2026",
      totalReferred: referrals.length,
      activeReferred: referrals.filter(
        (r) => r.status === "completed" || r.status === "rewarded"
      ).length,
      earnings,
      leaderboard,
      bonusRules,
      tierBenefits,
    };

    return NextResponse.json(program);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch referral data" },
      { status: 500 }
    );
  }
}
