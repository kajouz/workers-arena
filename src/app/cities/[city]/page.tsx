import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MapPin, Star, ArrowRight } from "lucide-react";
import { getCategories, getWorkers } from "@/lib/data/repo";
import { CITY_COORDINATES } from "@/lib/geolocation/geo-service";
import { cityBySlug, countryOfCity } from "@/lib/data/cities";
import { DEFAULT_COUNTRY } from "@/lib/tenant/countries";
import { CategoryIcon } from "@/components/shared/category-icon";
import { WorkerCardSkeleton } from "@/components/ui/page-skeleton";
import { notFound, redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";

interface CityPageProps {
  params: Promise<{ city: string }>;
}

/**
 * City facts come from the catalog (ONE source of truth) and its country from
 * the country registry — this page used to carry a second `CITY_NAMES` map
 * that silently drifted from `CITIES` (and 404'd every city not listed).
 */
function cityMetadata(slug: string) {
  const cityData = cityBySlug(slug);
  if (!cityData) return undefined;
  const country = countryOfCity(cityData) ?? DEFAULT_COUNTRY;
  return { cityData, country };
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city } = await params;
  const meta = cityMetadata(city);
  if (!meta) return {};
  const { cityData, country } = meta;
  const { locale } = await getI18n();

  return {
    title: locale === "ar"
      ? `اعثر على محترفين موثوقين في ${cityData.nameAr} — وركرز أرينا`
      : `Find trusted professionals in ${cityData.nameEn} — WorkersArena`,
    description: locale === "ar"
      ? `استأجر عمالاً موثّقين في ${cityData.nameAr}، ${country.nameAr}. سباكون، كهربائيون، نجارون وأكثر من 20 مهنة. تقييمات حقيقية وأسعار شفافة.`
      : `Hire verified workers in ${cityData.nameEn}, ${country.nameEn}. Plumbers, electricians, carpenters, and 20+ trades. Real reviews, transparent pricing.`,
    openGraph: {
      title: `WorkersArena — ${cityData.nameEn}`,
      description: `Find trusted professionals in ${cityData.nameEn}. Verified workers, real reviews.`,
      type: "website",
      locale: "en_US",
    },
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { city } = await params;
  const meta = cityMetadata(city);
  const { locale, t } = await getI18n();

  if (!meta) {
    notFound();
  }
  const { cityData, country } = meta;

  const categories = await getCategories();
  const cityCoords = CITY_COORDINATES[city];

  // Generate structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `WorkersArena — ${cityData.nameEn}`,
    description: `Find trusted professionals in ${cityData.nameEn}. Verified workers, real reviews.`,
    url: `https://workersarena.com/cities/${city}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: cityData.nameEn,
      // SEO region = the country config's ISO code.
      addressCountry: country.code,
    },
    geo: cityCoords
      ? {
          "@type": "GeoCoordinates",
          latitude: cityCoords.latitude,
          longitude: cityCoords.longitude,
        }
      : undefined,
    areaServed: cityData.nameEn,
    serviceType: "Worker Marketplace",
  };

  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://workersarena.com" },
      { "@type": "ListItem", position: 2, name: "Cities", item: "https://workersarena.com/cities" },
      { "@type": "ListItem", position: 3, name: cityData.nameEn },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }}
      />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm text-ink-400" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink-600">{locale === "ar" ? "الرئيسية" : "Home"}</Link>
          <span className="mx-2">/</span>
          <Link href="/cities" className="hover:text-ink-600">{locale === "ar" ? "المدن" : "Cities"}</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700 dark:text-ink-300">{locale === "ar" ? cityData.nameAr : cityData.nameEn}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="size-5 text-brand-500" />
            <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
              {locale === "ar" ? country.nameAr : country.nameEn}
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            {locale === "ar" ? "اعثر على محترفين موثوقين في" : "Find trusted professionals in"}{" "}
            <span className="text-gradient">{locale === "ar" ? cityData.nameAr : cityData.nameEn}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
            {locale === "ar"
              ? `تصفح ${categories.length}+ تصنيفاً مهنياً موثّقاً في ${cityData.nameAr}. اقرأ التقييمات الحقيقية وقارن الأسعار واستأجر عمالاً موثوقين في دقائق.`
              : `Browse verified ${categories.length}+ trade categories in ${cityData.nameEn}. Read real reviews, compare prices, and hire trusted workers in minutes.`}
          </p>
        </div>

        {/* Trade Categories Grid */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
            {locale === "ar" ? `تصفح المهن في ${cityData.nameAr}` : `Browse trades in ${cityData.nameEn}`}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/search?city=${city}&category=${cat.slug}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-ink-100 bg-white p-5 text-center transition-all hover:-translate-y-1 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 transition-colors group-hover:bg-brand-100 dark:bg-brand-950/30">
                  <CategoryIcon name={cat.icon} className="size-6 text-brand-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? cat.nameAr : cat.nameEn}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {cat.workerCount} {locale === "ar" ? "عامل" : "workers"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* SEO Content */}
        <section className="mb-16 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {locale === "ar"
                ? `لماذا تختار وركرز أرينا في ${cityData.nameAr}؟`
                : `Why choose WorkersArena in ${cityData.nameEn}?`}
            </h2>
            <ul className="space-y-3 text-ink-600 dark:text-ink-300">
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>{locale === "ar" ? "محترفون موثّقون بتقييمات حقيقية من العملاء" : "Verified professionals with real customer reviews"}</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>{locale === "ar" ? "أسعار شفافة — اعرف التكلفة قبل التوظيف" : "Transparent pricing — know costs before you hire"}</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>{locale === "ar" ? "تواصل فوري عبر الهاتف أو واتساب أو داخل التطبيق" : "Instant contact via phone, WhatsApp, or in-app messaging"}</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>{locale === "ar" ? "عمال مفحوصو الخلفية وحاصلون على رخص" : "Background-checked and licensed workers"}</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>{locale === "ar" ? "خدمة طوارئ متاحة 24/7" : "24/7 emergency service available"}</span>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-bold text-ink-900 dark:text-ink-50">
              {locale === "ar"
                ? `كيف توظف في ${cityData.nameAr}`
                : `How to hire in ${cityData.nameEn}`}
            </h2>
            <ol className="space-y-4">
              {(locale === "ar"
                ? [
                    { step: 1, text: `ابحث عن المهنة التي تحتاجها في ${cityData.nameAr}` },
                    { step: 2, text: "قارن الملفات والتقييمات والأسعار" },
                    { step: 3, text: "تواصل مع العامل مباشرة أو احجز عبر الإنترنت" },
                    { step: 4, text: "أنجز المهمة واكتب تقييماً" },
                  ]
                : [
                    { step: 1, text: `Search for the trade you need in ${cityData.nameEn}` },
                    { step: 2, text: "Compare profiles, ratings, and prices" },
                    { step: 3, text: "Contact the worker directly or book online" },
                    { step: 4, text: "Get the job done and leave a review" },
                  ]
              ).map((item) => (
                <li key={item.step} className="flex items-start gap-4">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                    {item.step}
                  </div>
                  <span className="pt-1 text-ink-600 dark:text-ink-300">{item.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            {locale === "ar"
              ? `هل أنت عامل محترف في ${cityData.nameAr}؟`
              : `Are you a professional worker in ${cityData.nameEn}?`}
          </h2>
          <p className="mt-3 text-brand-100">
            {locale === "ar"
              ? "انضم إلى آلاف العمال الذين يحصلون على عملاء جدد يومياً. سجّل خدماتك مجاناً."
              : "Join thousands of workers getting new customers every day. List your services for free."}
          </p>
          <Link
            href="/auth/register"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
          >
            {locale === "ar" ? "ابدأ الإدراج مجاناً" : "Start listing for free"}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
