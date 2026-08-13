import { CATEGORIES, categoryBySlug } from "./categories";
import { CITIES, cityBySlug } from "./cities";
import {
  AUTHOR_NAMES,
  CATEGORY_TEMPLATES,
  LANGUAGES,
  QUALITY_AR,
  QUALITY_EN,
  REVIEWS_3_AR,
  REVIEWS_3_EN,
  REVIEWS_4_AR,
  REVIEWS_4_EN,
  REVIEWS_5_AR,
  REVIEWS_5_EN,
} from "./templates";
import type { Review, SubscriptionPlan, VerificationStatus, Worker } from "./types";

/** Deterministic PRNG so the demo dataset is stable across reloads. */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 24 * 60 * 60 * 1000;

interface WorkerConfig {
  nameEn: string;
  nameAr: string;
  category: string;
  city: string;
  area: string;
  rating: number;
  reviewCount: number;
  yearsExp: number;
  verified?: boolean;
  verification?: VerificationStatus;
  plan?: SubscriptionPlan;
  expiresInDays?: number; // days until subscription expiry (negative = already expired)
  premium?: boolean;
  featured?: boolean;
  emergency?: boolean;
  available?: boolean;
  joinedYear: number;
  priceMin?: number;
  priceMax?: number;
  langCodes?: string[];
  phone: string;
  email: string;
  website?: string;
}

const CONFIGS: WorkerConfig[] = [
  // Khaled is the demo WORKER account (u-worker) — kept UNVERIFIED (rejected)
  // so the dashboard's verification banner shows the resubmit action and the
  // VERIFICATION_REQUEST_SUBMITTED flow is exercisable in the preview.
  // Featured/premium/emergency stay on so the homepage still showcases him.
  { nameEn: "Khaled Al-Harbi", nameAr: "خالد الحربي", category: "plumbing", city: "riyadh", area: "al-olaya", rating: 4.9, reviewCount: 132, yearsExp: 12, verification: "rejected", premium: true, featured: true, emergency: true, joinedYear: 2019, priceMin: 80, priceMax: 950, langCodes: ["ar", "en"], phone: "+966 55 123 4871", email: "khaled@plumbfix.sa", website: "plumbfix.sa" },
  { nameEn: "Mohammed Farouk", nameAr: "محمد فاروق", category: "electrical", city: "cairo", area: "nasr-city", rating: 4.8, reviewCount: 98, yearsExp: 15, verified: true, premium: true, joinedYear: 2016, priceMin: 60, priceMax: 600, langCodes: ["ar", "en"], phone: "+20 100 456 7823", email: "m.farouk@volt-eg.com", website: "volt-eg.com" },
  { nameEn: "Ali Hassan", nameAr: "علي حسن", category: "carpentry", city: "dubai", area: "deira", rating: 4.7, reviewCount: 76, yearsExp: 10, verified: true, featured: true, joinedYear: 2018, priceMin: 100, priceMax: 1800, langCodes: ["ar", "en", "ur"], phone: "+971 50 778 2194", email: "ali@woodcraft.ae", website: "woodcraft.ae" },
  { nameEn: "Youssef Benali", nameAr: "يوسف بن علي", category: "painting", city: "casablanca", area: "maarif", rating: 4.6, reviewCount: 54, yearsExp: 8, verified: true, joinedYear: 2019, priceMin: 150, priceMax: 1200, langCodes: ["ar", "fr"], phone: "+212 661 22 45 78", email: "y.benali@peinture.ma" },
  { nameEn: "Ahmed El-Sayed", nameAr: "أحمد السيد", category: "masonry", city: "cairo", area: "maadi", rating: 4.5, reviewCount: 61, yearsExp: 20, verified: true, joinedYear: 2014, priceMin: 150, priceMax: 1200, langCodes: ["ar"], phone: "+20 106 933 4412", email: "ahmed.mason@built-eg.com" },
  { nameEn: "Omar Al-Mutairi", nameAr: "عمر المطيري", category: "ac-technician", city: "riyadh", area: "al-malqa", rating: 4.9, reviewCount: 210, yearsExp: 9, verified: true, premium: true, featured: true, emergency: true, available: true, joinedYear: 2020, priceMin: 120, priceMax: 500, langCodes: ["ar", "en"], phone: "+966 54 330 8129", email: "omar@coolair.sa", website: "coolair.sa" },
  { nameEn: "Hassan Karimi", nameAr: "حسن كريمي", category: "satellite-technician", city: "dubai", area: "al-barsha", rating: 4.7, reviewCount: 45, yearsExp: 7, verified: true, joinedYear: 2021, priceMin: 80, priceMax: 250, langCodes: ["ar", "en", "fr"], phone: "+971 52 441 8876", email: "hassan@signaltv.ae" },
  { nameEn: "Sami Najjar", nameAr: "سامي نجار", category: "mechanic", city: "amman", area: "abdoun", rating: 4.8, reviewCount: 88, yearsExp: 14, verified: true, premium: true, joinedYear: 2017, priceMin: 50, priceMax: 400, langCodes: ["ar", "en"], phone: "+962 79 556 1203", email: "sami@autocare.jo", website: "autocare.jo" },
  { nameEn: "Fahad Al-Dosari", nameAr: "فهد الدوسري", category: "welding", city: "riyadh", area: "al-rawdah", rating: 4.6, reviewCount: 39, yearsExp: 11, verified: true, joinedYear: 2019, priceMin: 200, priceMax: 900, langCodes: ["ar", "en"], phone: "+966 56 778 9921", email: "fahad@steelpro.sa" },
  { nameEn: "Ibrahim Khalil", nameAr: "إبراهيم خليل", category: "blacksmith", city: "cairo", area: "heliopolis", rating: 4.5, reviewCount: 33, yearsExp: 18, verified: true, joinedYear: 2015, priceMin: 150, priceMax: 1200, langCodes: ["ar"], phone: "+20 100 664 2290", email: "ibrahim@ironworks-eg.com" },
  { nameEn: "Tariq Al-Shammari", nameAr: "طارق الشمري", category: "roofing", city: "riyadh", area: "al-nakheel", rating: 4.4, reviewCount: 27, yearsExp: 13, verification: "pending", plan: "basic", expiresInDays: -6, joinedYear: 2018, priceMin: 150, priceMax: 2000, langCodes: ["ar"], phone: "+966 50 219 3344", email: "tariq@roofshield.sa" },
  { nameEn: "Bilal Mansour", nameAr: "بلال منصور", category: "cleaning", city: "dubai", area: "jumeirah", rating: 4.9, reviewCount: 156, yearsExp: 6, verified: true, premium: true, featured: true, available: true, plan: "enterprise", joinedYear: 2021, priceMin: 150, priceMax: 600, langCodes: ["ar", "en", "ur"], phone: "+971 55 902 1137", email: "bilal@sparkle.ae", website: "sparkle.ae" },
  { nameEn: "Nasser Al-Qahtani", nameAr: "ناصر القحطاني", category: "movers", city: "riyadh", area: "al-sulimaniyah", rating: 4.7, reviewCount: 71, yearsExp: 9, verified: true, plan: "professional", expiresInDays: 7, joinedYear: 2019, priceMin: 400, priceMax: 1600, langCodes: ["ar", "en"], phone: "+966 53 660 7712", email: "nasser@moveit.sa" },
  { nameEn: "Wael Ghanem", nameAr: "وائل غانم", category: "gardening", city: "amman", area: "sweifieh", rating: 4.6, reviewCount: 42, yearsExp: 12, verified: true, plan: "basic", expiresInDays: 3, joinedYear: 2017, priceMin: 150, priceMax: 900, langCodes: ["ar", "en"], phone: "+962 77 445 6681", email: "wael@gardenia.jo" },
  { nameEn: "Rami Awwad", nameAr: "رامي عواد", category: "pest-control", city: "amman", area: "tlaa-al-ali", rating: 4.8, reviewCount: 63, yearsExp: 8, verified: true, emergency: true, joinedYear: 2020, priceMin: 100, priceMax: 900, langCodes: ["ar", "en"], phone: "+962 78 991 3045", email: "rami@guardian.jo" },
  { nameEn: "Saleh Al-Otaibi", nameAr: "صالح العتيبي", category: "locksmith", city: "dubai", area: "bur-dubai", rating: 4.7, reviewCount: 58, yearsExp: 10, verified: true, emergency: true, available: true, joinedYear: 2018, priceMin: 40, priceMax: 350, langCodes: ["ar", "en"], phone: "+971 50 447 9061", email: "saleh@keymaster.ae" },
  { nameEn: "Majed Haddad", nameAr: "ماجد حداد", category: "glass-works", city: "casablanca", area: "ain-diab", rating: 4.5, reviewCount: 36, yearsExp: 9, verification: "rejected", plan: "basic", joinedYear: 2020, priceMin: 150, priceMax: 800, langCodes: ["ar", "fr"], phone: "+212 662 88 01 47", email: "majed@vitrage.ma" },
  { nameEn: "Karim El-Fassi", nameAr: "كريم الفاسي", category: "aluminum-works", city: "casablanca", area: "gauthier", rating: 4.6, reviewCount: 47, yearsExp: 15, verified: true, joinedYear: 2016, priceMin: 300, priceMax: 1200, langCodes: ["ar", "fr"], phone: "+212 661 45 77 20", email: "karim@alucasa.ma", website: "alucasa.ma" },
  { nameEn: "Zaid Al-Sabhan", nameAr: "زيد السبهان", category: "gypsum-works", city: "riyadh", area: "al-malqa", rating: 4.7, reviewCount: 52, yearsExp: 8, verified: true, joinedYear: 2020, priceMin: 150, priceMax: 900, langCodes: ["ar", "en"], phone: "+966 54 812 3367", email: "zaid@gypsodesign.sa" },
  { nameEn: "Anas Barakat", nameAr: "أنس بركات", category: "interior-design", city: "dubai", area: "dubai-marina", rating: 4.9, reviewCount: 89, yearsExp: 11, verified: true, premium: true, featured: true, joinedYear: 2018, priceMin: 300, priceMax: 3000, langCodes: ["ar", "en", "fr"], phone: "+971 56 221 7845", email: "anas@studioarab.ae", website: "studioarab.ae" },
  { nameEn: "Hamza Douma", nameAr: "حمزة دوما", category: "construction", city: "cairo", area: "dokki", rating: 4.6, reviewCount: 68, yearsExp: 22, verified: true, premium: true, joinedYear: 2013, priceMin: 2000, priceMax: 20000, langCodes: ["ar", "en"], phone: "+20 122 887 4430", email: "hamza@buildco-eg.com", website: "buildco-eg.com" },
  { nameEn: "Khaled Bouazza", nameAr: "خالد بوعزة", category: "ac-technician", city: "casablanca", area: "californie", rating: 4.8, reviewCount: 77, yearsExp: 10, verified: true, emergency: true, expiresInDays: 1, joinedYear: 2019, priceMin: 100, priceMax: 450, langCodes: ["ar", "fr"], phone: "+212 663 09 52 81", email: "khaled@froid.ma" },
];

function buildReviews(cfg: WorkerConfig, seed: string): Review[] {
  const rnd = mulberry32(hashSeed(seed + "-reviews"));
  const count = Math.max(3, Math.min(6, Math.round(cfg.reviewCount / 22)));
  const reviews: Review[] = [];
  const pools5 = [REVIEWS_5_EN, REVIEWS_5_AR];
  const pools4 = [REVIEWS_4_EN, REVIEWS_4_AR];
  const pools3 = [REVIEWS_3_EN, REVIEWS_3_AR];
  for (let i = 0; i < count; i++) {
    const rating = rnd() < 0.78 ? 5 : rnd() < 0.55 ? 4 : 3;
    const pool = rating >= 5 ? pools5 : rating === 4 ? pools4 : pools3;
    const idx = Math.floor(rnd() * pool[0].length);
    const daysAgo = Math.floor(rnd() * 190) + 2;
    reviews.push({
      id: `${cfg.nameEn.split(" ")[0].toLowerCase()}-r${i}`,
      author: AUTHOR_NAMES[Math.floor(rnd() * AUTHOR_NAMES.length)],
      rating,
      date: new Date(Date.now() - daysAgo * DAYS).toISOString(),
      textEn: pool[0][idx],
      textAr: pool[1][idx],
      verifiedPurchase: rnd() > 0.25,
    });
  }
  return reviews.sort((a, b) => b.date.localeCompare(a.date));
}

function buildWorker(cfg: WorkerConfig): Worker {
  const cat = categoryBySlug(cfg.category)!;
  const city = cityBySlug(cfg.city)!;
  const area = city.areas.find((a) => a.slug === cfg.area) ?? city.areas[0];
  const template = CATEGORY_TEMPLATES[cfg.category];
  const rnd = mulberry32(hashSeed(cfg.nameEn));
  const id = cfg.nameEn.split(" ")[0].toLowerCase() + "-" + cfg.category.slice(0, 4);
  const slug = `${cfg.nameEn.toLowerCase().replace(/[^a-z]+/g, "-")}-${cfg.category}`;
  const specialtyIdx = Math.floor(rnd() * template.specialtyEn.length);
  const qualityIdx = Math.floor(rnd() * QUALITY_EN.length);

  const services = template.services.map(([nEn, nAr, price, unit], i) => ({
    nameEn: nEn,
    nameAr: nAr,
    price: Math.round(price * (cfg.priceMin && cfg.priceMax ? (0.85 + rnd() * 0.5) : 1)),
    unit,
  }));

  const certifications = [
    { nameEn: `${cat.nameEn} Professional License`, nameAr: `رخصة ${cat.nameAr} مهنية`, issuerEn: "National Trades Board", issuerAr: "الهيئة الوطنية للمهن", year: cfg.joinedYear + 1 },
    { nameEn: "Safety & First Aid Certified", nameAr: "شهادة سلامة وإسعافات أولية", issuerEn: "Safety Institute", issuerAr: "معهد السلامة", year: cfg.joinedYear + 2 },
  ];

  const hours = [
    { day: 0, open: "08:00", close: "18:00" },
    { day: 1, open: "08:00", close: "18:00" },
    { day: 2, open: "08:00", close: "18:00" },
    { day: 3, open: "08:00", close: "18:00" },
    { day: 4, open: "08:00", close: "18:00" },
    { day: 5, open: "09:00", close: "14:00" },
    { day: 6, open: "00:00", close: "00:00", closed: true },
  ];
  if (cfg.emergency) hours[6] = { day: 6, open: "00:00", close: "00:00", closed: false };

  const gallery = template.portfolioEn.map((tEn, i) => ({
    titleEn: tEn,
    titleAr: template.portfolioAr[i] ?? tEn,
    hue: (cat.hue + i * 37 + Math.floor(rnd() * 30)) % 360,
  }));

  const langCodes = cfg.langCodes ?? ["ar", "en"];
  const languages = LANGUAGES.filter((l) => langCodes.includes(l.code));

  const lat = city.lat + (rnd() - 0.5) * 0.06;
  const lng = city.lng + (rnd() - 0.5) * 0.06;

  const reviews = buildReviews(cfg, slug);

  // ── Subscription & verification state (demo, deterministic) ────────────────
  const verification: VerificationStatus =
    cfg.verification ?? (cfg.verified ? "verified" : "pending");
  const plan: SubscriptionPlan =
    cfg.plan ?? (cfg.premium ? "premium" : cfg.verified ? "professional" : "basic");
  const expiresInDays = cfg.expiresInDays ?? 14 + Math.floor(rnd() * 26); // 14–39 days
  const planPrices: Record<SubscriptionPlan, number> = {
    basic: 29,
    professional: 59,
    premium: 119,
    enterprise: 299,
  };

  return {
    id,
    slug,
    nameEn: cfg.nameEn,
    nameAr: cfg.nameAr,
    categorySlug: cfg.category,
    citySlug: cfg.city,
    areaSlug: cfg.area,
    taglineEn: `${cat.nameEn} specialist · ${cfg.yearsExp} years of experience`,
    taglineAr: `${cat.professionAr} · خبرة ${cfg.yearsExp} سنة`,
    bioEn: `I'm ${cfg.nameEn}, a ${cat.professionEn} with ${cfg.yearsExp} years of hands-on experience serving ${city.nameEn} (${area.nameEn}) and nearby areas. ${template.specialtyEn[specialtyIdx]}. ${QUALITY_EN[qualityIdx]}. Every project is delivered on time, on budget — guaranteed.`,
    bioAr: `أنا ${cfg.nameAr}، ${cat.professionAr} بخبرة ${cfg.yearsExp} سنة أخدم ${city.nameAr} (${area.nameAr}) والمناطق المجاورة. ${template.specialtyAr[specialtyIdx]}. ${QUALITY_AR[qualityIdx]}. كل مشروع يُسلَّم في وقته وضمن ميزانيته — مضمون.`,
    rating: cfg.rating,
    reviewCount: cfg.reviewCount,
    yearsExp: cfg.yearsExp,
    verified: verification === "verified",
    verification,
    premium: cfg.premium ?? false,
    featured: cfg.featured ?? false,
    emergency: cfg.emergency ?? false,
    available: cfg.available ?? true,
    subscription: {
      plan,
      status: expiresInDays < 0 ? "expired" : expiresInDays <= 7 ? "expiring" : "active",
      startedAt: new Date(Date.now() - (365 - expiresInDays) * DAYS).toISOString(),
      expiresAt: new Date(Date.now() + expiresInDays * DAYS).toISOString(),
      price: planPrices[plan],
      invoiceNo: `INV-${9000 + Math.floor(rnd() * 900)}`,
    },
    priceMin: cfg.priceMin ?? Math.min(...services.map((s) => s.price)),
    priceMax: cfg.priceMax ?? Math.max(...services.map((s) => s.price)),
    currency: city.currency,
    phone: cfg.phone,
    whatsapp: cfg.phone.replace(/[^\d]/g, ""),
    email: cfg.email,
    website: cfg.website,
    socials: [
      { platform: "instagram", url: `https://instagram.com/${slug}` },
      { platform: "facebook", url: `https://facebook.com/${slug}` },
      { platform: "tiktok", url: `https://tiktok.com/@${slug}` },
    ],
    languages,
    services,
    certifications,
    hours,
    gallery,
    reviews,
    joinedYear: cfg.joinedYear,
    views: 900 + Math.round(cfg.reviewCount * 34 + cfg.rating * 400 + rnd() * 3000),
    leads: Math.round(cfg.reviewCount * 1.7),
    completion: 68 + Math.floor(rnd() * 30),
    hue: hashSeed(slug) % 360,
    lat,
    lng,
  };
}

/** The complete demo workforce — stable across requests (generated once). */
export const WORKERS: Worker[] = CONFIGS.map(buildWorker);

export const workerBySlug = (slug: string): Worker | undefined =>
  WORKERS.find((w) => w.slug === slug);

export const workerById = (id: string): Worker | undefined => WORKERS.find((w) => w.id === id);

/** Workers with their category count computed. */
export function categoriesWithCounts(): typeof CATEGORIES {
  return CATEGORIES.map((c) => ({
    ...c,
    workerCount: WORKERS.filter((w) => w.categorySlug === c.slug).length,
  }));
}
