import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { MapPin, Star, ArrowRight } from "lucide-react";
import { getCategories, getWorkers } from "@/lib/data/repo";
import { CITY_COORDINATES } from "@/lib/geolocation/geo-service";
import { CategoryIcon } from "@/components/shared/category-icon";
import { WorkerCardSkeleton } from "@/components/ui/page-skeleton";
import { notFound } from "next/navigation";

interface CityPageProps {
  params: Promise<{ city: string }>;
}

const CITY_NAMES: Record<string, { en: string; ar: string; country: string }> = {
  riyadh: { en: "Riyadh", ar: "الرياض", country: "Saudi Arabia" },
  dubai: { en: "Dubai", ar: "دبي", country: "UAE" },
  abudhabi: { en: "Abu Dhabi", ar: "أبو ظبي", country: "UAE" },
  doha: { en: "Doha", ar: "الدوحة", country: "Qatar" },
  kuwait: { en: "Kuwait City", ar: "مدينة الكويت", country: "Kuwait" },
  manama: { en: "Manama", ar: "المنامة", country: "Bahrain" },
  muscat: { en: "Muscat", ar: "مسقط", country: "Oman" },
  amman: { en: "Amman", ar: "عمّان", country: "Jordan" },
  beirut: { en: "Beirut", ar: "بيروت", country: "Lebanon" },
  cairo: { en: "Cairo", ar: "القاهرة", country: "Egypt" },
  casablanca: { en: "Casablanca", ar: "الدار البيضاء", country: "Morocco" },
};

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city } = await params;
  const cityData = CITY_NAMES[city];
  if (!cityData) return {};

  return {
    title: `Find trusted professionals in ${cityData.en} — WorkersArena`,
    description: `Hire verified workers in ${cityData.en}, ${cityData.country}. Plumbers, electricians, carpenters, and 20+ trades. Real reviews, transparent pricing.`,
    openGraph: {
      title: `WorkersArena — ${cityData.en}`,
      description: `Find trusted professionals in ${cityData.en}. Verified workers, real reviews.`,
      type: "website",
      locale: "en_US",
    },
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { city } = await params;
  const cityData = CITY_NAMES[city];

  if (!cityData) {
    notFound();
  }

  const categories = await getCategories();
  const cityCoords = CITY_COORDINATES[city];

  // Generate structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `WorkersArena — ${cityData.en}`,
    description: `Find trusted professionals in ${cityData.en}. Verified workers, real reviews.`,
    url: `https://workersarena.com/cities/${city}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: cityData.en,
      addressCountry: cityData.country,
    },
    geo: cityCoords
      ? {
          "@type": "GeoCoordinates",
          latitude: cityCoords.latitude,
          longitude: cityCoords.longitude,
        }
      : undefined,
    areaServed: cityData.en,
    serviceType: "Worker Marketplace",
  };

  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://workersarena.com" },
      { "@type": "ListItem", position: 2, name: "Cities", item: "https://workersarena.com/cities" },
      { "@type": "ListItem", position: 3, name: cityData.en },
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
          <Link href="/" className="hover:text-ink-600">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/cities" className="hover:text-ink-600">Cities</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700 dark:text-ink-300">{cityData.en}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="size-5 text-brand-500" />
            <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
              {cityData.country}
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            Find trusted professionals in{" "}
            <span className="text-gradient">{cityData.en}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
            Browse verified {categories.length}+ trade categories in {cityData.en}.
            Read real reviews, compare prices, and hire trusted workers in minutes.
          </p>
        </div>

        {/* Trade Categories Grid */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
            Browse trades in {cityData.en}
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
                    {cat.nameEn}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {cat.workerCount} workers
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
              Why choose WorkersArena in {cityData.en}?
            </h2>
            <ul className="space-y-3 text-ink-600 dark:text-ink-300">
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>Verified professionals with real customer reviews</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>Transparent pricing — know costs before you hire</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>Instant contact via phone, WhatsApp, or in-app messaging</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>Background-checked and licensed workers</span>
              </li>
              <li className="flex items-start gap-3">
                <Star className="mt-0.5 size-5 shrink-0 text-brand-500" />
                <span>24/7 emergency service available</span>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="mb-4 text-2xl font-bold text-ink-900 dark:text-ink-50">
              How to hire in {cityData.en}
            </h2>
            <ol className="space-y-4">
              {[
                { step: 1, text: `Search for the trade you need in ${cityData.en}` },
                { step: 2, text: "Compare profiles, ratings, and prices" },
                { step: 3, text: "Contact the worker directly or book online" },
                { step: 4, text: "Get the job done and leave a review" },
              ].map((item) => (
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
            Are you a professional worker in {cityData.en}?
          </h2>
          <p className="mt-3 text-brand-100">
            Join thousands of workers getting new customers every day. List your services for free.
          </p>
          <Link
            href="/auth/register"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
          >
            Start listing for free
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
