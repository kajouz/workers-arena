import { CATEGORIES } from "./categories";
import { WORKERS } from "./workers";
import { subscriptionStatus } from "./subscriptions";
import { emptyBookingFunnelCounts } from "./types";
import type { ActivityEntry, AnalyticsOverview } from "./types";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function series(seed: number, base: number, growth = 0.06): number[] {
  const out: number[] = [];
  let v = base * 0.4;
  for (let i = 0; i < 12; i++) {
    v = v * (1 + growth) + Math.sin((i + seed) * 1.7) * base * 0.08 + base * 0.05;
    out.push(Math.round(v));
  }
  return out;
}

const ACTIVITIES: ActivityEntry[] = [
  { id: "a1", actionEn: "New worker verified", actionAr: "توثيق عامل جديد", actor: "Khaled Al-Harbi", time: "12 min ago", type: "worker" },
  { id: "a2", actionEn: "Premium subscription renewed", actionAr: "تجديد اشتراك مميز", actor: "Omar Al-Mutairi", time: "48 min ago", type: "payment" },
  { id: "a3", actionEn: "Campaign approved", actionAr: "الموافقة على حملة", actor: "BuildCo Ltd", time: "1 h ago", type: "company" },
  { id: "a4", actionEn: "Review flagged for moderation", actionAr: "تقييم بحاجة لمراجعة", actor: "System", time: "2 h ago", type: "review" },
  { id: "a5", actionEn: "New company registered", actionAr: "تسجيل شركة جديدة", actor: "Al-Rawabi Contracting", time: "3 h ago", type: "company" },
  { id: "a6", actionEn: "Worker profile hidden (subscription expired)", actionAr: "إخفاء ملف عامل (انتهاء اشتراك)", actor: "System", time: "5 h ago", type: "system" },
  { id: "a7", actionEn: "Payment received — invoice #1048", actionAr: "استلام دفعة — فاتورة 1048", actor: "Sparkle Cleaning", time: "6 h ago", type: "payment" },
  { id: "a8", actionEn: "Bulk import: 34 workers uploaded", actionAr: "استيراد جماعي: 34 عاملاً", actor: "Admin", time: "Yesterday", type: "system" },
];

export function getAnalytics(): AnalyticsOverview {
  const revenueSeries = series(3, 42000);
  const viewsSeries = series(7, 8800, 0.09);
  const leadsSeries = series(11, 520, 0.05);
  const currentMonth = new Date().getMonth();

  const categoryCounts = CATEGORIES.map((c) => ({
    labelEn: c.nameEn,
    labelAr: c.nameAr,
    value: WORKERS.filter((w) => w.categorySlug === c.slug).length * 7 + 5,
  })).sort((a, b) => b.value - a.value);

  const planDistribution = [
    { labelEn: "Basic", labelAr: "أساسية", value: 342, hue: 205 },
    { labelEn: "Professional", labelAr: "احترافية", value: 428, hue: 150 },
    { labelEn: "Premium", labelAr: "مميزة", value: 216, hue: 30 },
    { labelEn: "Enterprise", labelAr: "مؤسسات", value: 74, hue: 265 },
  ];

  const topWorkers = [...WORKERS]
    .sort((a, b) => b.views - a.views)
    .slice(0, 6)
    .map((w) => ({
      id: w.id,
      nameEn: w.nameEn,
      nameAr: w.nameAr,
      categoryEn: CATEGORIES.find((c) => c.slug === w.categorySlug)?.nameEn ?? "",
      categoryAr: CATEGORIES.find((c) => c.slug === w.categorySlug)?.nameAr ?? "",
      cityEn: w.citySlug.toUpperCase(),
      views: w.views,
      rating: w.rating,
      hue: w.hue,
    }));

  return {
    totalWorkers: 2480,
    activeWorkers: 1932,
    inactiveWorkers: 548,
    expiredSubs: 87,
    revenue: 1284000,
    monthlyRevenue: revenueSeries[currentMonth],
    dailyRevenue: Math.round(revenueSeries[currentMonth] / 30),
    companies: 146,
    activeAds: 92,
    visitors: 41230,
    conversionRate: 6.8,
    revenueSeries: revenueSeries.map((v, i) => ({ label: i, value: v })),
    viewsSeries: viewsSeries.map((v, i) => ({ label: i, value: v })),
    leadsSeries: leadsSeries.map((v, i) => ({ label: i, value: v })),
    categoryCounts,
    planDistribution,
    topWorkers,
    topCompanies: [
      { name: "BuildCo Ltd", value: 14200 },
      { name: "Al-Rawabi Contracting", value: 11800 },
      { name: "Sparkle Cleaning", value: 9600 },
      { name: "CoolAir Systems", value: 8400 },
      { name: "Studio Arab", value: 7100 },
    ],
    searchTrends: [
      { queryEn: "AC maintenance", queryAr: "صيانة مكيف", count: 4210 },
      { queryEn: "plumber near me", queryAr: "سباك قريب", count: 3870 },
      { queryEn: "house cleaning", queryAr: "تنظيف منزل", count: 3320 },
      { queryEn: "electrician", queryAr: "كهربائي", count: 2980 },
      { queryEn: "pest control", queryAr: "مكافحة حشرات", count: 2410 },
    ],
    activities: ACTIVITIES,
    // Zeroed shells — repo.getAnalyticsOverview() merges the live funnels
    // (getVerificationFunnel from ActivityLog codes, getBookingFunnel from the
    // booking stores).
    verificationFunnel: { requests: 0, approved: 0, declined: 0, approvalRate: 0, conversionRate: 0 },
    bookingFunnel: { counts: emptyBookingFunnelCounts(), total: 0, conversionRate: 0 },
    alerts: [
      { type: "expired", count: WORKERS.filter((w) => subscriptionStatus(w.subscription) === "expired").length },
      { type: "verification", count: WORKERS.filter((w) => w.verification === "pending").length },
      { type: "reviews", count: 12 },
    ],
  };
}

export function getMonthLabel(index: number, locale: "en" | "ar"): string {
  return (locale === "ar" ? MONTHS_AR : MONTHS_EN)[index] ?? String(index);
}
