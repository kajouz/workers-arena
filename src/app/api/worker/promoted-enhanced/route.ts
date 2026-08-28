import { NextResponse } from "next/server";

/**
 * GET /api/worker/promoted-enhanced
 * Returns enhanced promoted profile data including:
 * - Geographic targeting options
 * - A/B testing variants
 * - Quality score calculation
 * - Competitor bid estimates
 */

interface TargetingOption {
  id: string;
  name: string;
  nameAr: string;
  type: "neighborhood" | "category" | "time" | "device";
  enabled: boolean;
  extraCost: number;
}

interface ABVariant {
  id: string;
  name: string;
  headline: string;
  headlineAr: string;
  description: string;
  descriptionAr: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isWinner: boolean;
}

interface QualityScore {
  overall: number;
  profileCompleteness: number;
  responseTime: number;
  reviewQuality: number;
  bookingRate: number;
  factors: string[];
  factorsAr: string[];
  suggestions: string[];
  suggestionsAr: string[];
}

interface CompetitorData {
  avgBid: number;
  topBid: number;
  yourBid: number;
  suggestedBid: number;
  position: number;
  totalCompetitors: number;
}

interface EnhancedPromotedProfile {
  targeting: TargetingOption[];
  abVariants: ABVariant[];
  qualityScore: QualityScore;
  competitorData: CompetitorData;
  estimatedReach: number;
  estimatedClicks: number;
  estimatedCost: number;
}

function generateTargeting(): TargetingOption[] {
  return [
    {
      id: "nb_1",
      name: "Beirut Downtown",
      nameAr: "وسط بيروت",
      type: "neighborhood",
      enabled: true,
      extraCost: 0,
    },
    {
      id: "nb_2",
      name: "Hamra District",
      nameAr: "حي الحمرا",
      type: "neighborhood",
      enabled: false,
      extraCost: 15,
    },
    {
      id: "nb_3",
      name: "Achrafieh",
      nameAr: "الашرافية",
      type: "neighborhood",
      enabled: false,
      extraCost: 20,
    },
    {
      id: "cat_1",
      name: "Plumbing",
      nameAr: "السباكة",
      type: "category",
      enabled: true,
      extraCost: 0,
    },
    {
      id: "cat_2",
      name: "Electrical",
      nameAr: "الكهرباء",
      type: "category",
      enabled: false,
      extraCost: 10,
    },
    {
      id: "time_1",
      name: "Peak Hours (9AM-6PM)",
      nameAr: "ساعات الذروة (9 صباحاً - 6 مساءً)",
      type: "time",
      enabled: true,
      extraCost: 0,
    },
    {
      id: "time_2",
      name: "Evening (6PM-10PM)",
      nameAr: "المساء (6 مساءً - 10 مساءً)",
      type: "time",
      enabled: false,
      extraCost: 5,
    },
    {
      id: "dev_1",
      name: "Mobile Only",
      nameAr: "الهاتف فقط",
      type: "device",
      enabled: false,
      extraCost: 10,
    },
  ];
}

function generateABVariants(): ABVariant[] {
  return [
    {
      id: "var_a",
      name: "Professional",
      headline: "Expert Plumbing Services",
      headlineAr: "خدمات سباكة احترافية",
      description: "Fast, reliable, and affordable plumbing solutions",
      descriptionAr: "حلول سباكة سريعة وموثوقة وبأسعار معقولة",
      impressions: 850,
      clicks: 42,
      ctr: 4.94,
      isWinner: true,
    },
    {
      id: "var_b",
      name: "Urgency",
      headline: "24/7 Emergency Plumber",
      headlineAr: "سباكي طوارئ على مدار الساعة",
      description: "Need it fixed NOW? Call for immediate service",
      descriptionAr: "تحتاج إصلاحاً فوراً؟ اتصل للخدمة الفورية",
      impressions: 820,
      clicks: 35,
      ctr: 4.27,
      isWinner: false,
    },
    {
      id: "var_c",
      name: "Value",
      headline: "Quality Work, Fair Prices",
      headlineAr: "عمل جيد، أسعار عادلة",
      description: "Licensed plumber with 10+ years experience",
      descriptionAr: "سباكي مرخص بخبرة أكثر من 10 سنوات",
      impressions: 780,
      clicks: 38,
      ctr: 4.87,
      isWinner: false,
    },
  ];
}

function generateQualityScore(): QualityScore {
  return {
    overall: 82,
    profileCompleteness: 90,
    responseTime: 85,
    reviewQuality: 88,
    bookingRate: 65,
    factors: [
      "Profile photo uploaded",
      "Portfolio has 8 photos",
      "3 verified reviews",
      "Responds within 2 hours",
      "15 completed bookings",
    ],
    factorsAr: [
      "تم رفع صورة الملف الشخصي",
      "المعرض يحتوي على 8 صور",
      "3 تقييمات موثقة",
      "يرد خلال ساعتين",
      "15 حجز مكتمل",
    ],
    suggestions: [
      "Add 2 more portfolio photos to reach 10",
      "Respond within 1 hour to improve response time score",
      "Request reviews from 2 more customers",
    ],
    suggestionsAr: [
      "أضف صورتين أخريين للمعرض للوصول إلى 10",
      "رد خلال ساعة لتحسين نتيجة وقت الاستجابة",
      "اطلب تقييمات من عميلين آخرين",
    ],
  };
}

function generateCompetitorData(): CompetitorData {
  return {
    avgBid: 2.1,
    topBid: 4.5,
    yourBid: 2.5,
    suggestedBid: 3.0,
    position: 4,
    totalCompetitors: 12,
  };
}

export async function GET() {
  try {
    const data: EnhancedPromotedProfile = {
      targeting: generateTargeting(),
      abVariants: generateABVariants(),
      qualityScore: generateQualityScore(),
      competitorData: generateCompetitorData(),
      estimatedReach: 2500,
      estimatedClicks: 125,
      estimatedCost: 312,
    };

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch enhanced promoted data" },
      { status: 500 }
    );
  }
}
