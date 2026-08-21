import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Star, ArrowRight, CheckCircle } from "lucide-react";
import { CATEGORIES } from "@/lib/data/categories";
import { CITY_COORDINATES } from "@/lib/geolocation/geo-service";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/shared/category-icon";

interface TradePageProps {
  params: Promise<{ trade: string }>;
}

const TRADE_DESCRIPTIONS: Record<string, { title: string; description: string; benefits: string[]; faq: { q: string; a: string }[] }> = {
  plumbing: {
    title: "Find Trusted Plumbers Near You",
    description: "Hire verified plumbers for leak repairs, pipe installation, water heater maintenance, and emergency plumbing. Compare prices, read real reviews, and book instantly.",
    benefits: [
      "Licensed and verified plumbing professionals",
      "Emergency 24/7 plumbing service available",
      "Transparent pricing — no hidden fees",
      "Same-day appointments for urgent repairs",
    ],
    faq: [
      { q: "How much does a plumber cost?", a: "Plumbing costs vary by job complexity. Minor repairs start from SAR 80, while major installations can range from SAR 500–5,000. Get a free quote from verified plumbers on WorkersArena." },
      { q: "How do I find an emergency plumber?", a: "Use the 'Emergency' filter on WorkersArena to find plumbers available 24/7. Many plumbers offer same-day emergency service for urgent leaks and blockages." },
      { q: "Are the plumbers on WorkersArena licensed?", a: "Yes, all plumbers undergo identity verification and can earn Professional Verification badges for additional trust. Check ratings and reviews before booking." },
    ],
  },
  electrical: {
    title: "Hire Qualified Electricians",
    description: "Find licensed electricians for wiring, panel upgrades, lighting installation, and electrical repairs. All professionals are verified with real customer reviews.",
    benefits: [
      "Licensed electrical contractors",
      "Safety-first approach with proper certifications",
      "Residential and commercial electrical services",
      "Free estimates available",
    ],
    faq: [
      { q: "When should I call an electrician?", a: "Call an electrician for any wiring issues, tripping breakers, outlet problems, or when planning renovations that involve electrical work. Never attempt electrical repairs yourself." },
      { q: "How do I know if an electrician is qualified?", a: "Look for the Professional Verification badge on WorkersArena profiles. Check their years of experience, certifications, and customer reviews." },
    ],
  },
  "ac-technician": {
    title: "AC Repair & Installation Services",
    description: "Find certified AC technicians for installation, maintenance, and repair. Split units, central AC, duct cleaning, and emergency cooling services.",
    benefits: [
      "Certified HVAC technicians",
      "All AC brands and models supported",
      "Preventive maintenance plans available",
      "Emergency breakdown service",
    ],
    faq: [
      { q: "How often should I service my AC?", a: "AC units should be serviced at least twice a year — before summer and before winter. Regular maintenance improves efficiency and extends the unit's lifespan." },
      { q: "What's the average AC repair cost?", a: "AC repair costs range from SAR 100 for simple fixes to SAR 1,500+ for compressor replacements. Get quotes from multiple technicians on WorkersArena." },
    ],
  },
  carpentry: {
    title: "Expert Carpentry Services",
    description: "Hire skilled carpenters for custom furniture, kitchen cabinets, doors, shelves, and woodwork. Browse portfolios and book trusted professionals.",
    benefits: [
      "Custom woodwork and furniture design",
      "Kitchen and bathroom cabinetry",
      "Door and window installation",
      "Furniture repair and restoration",
    ],
    faq: [
      { q: "Can carpenters build custom furniture?", a: "Yes, many carpenters on WorkersArena specialize in custom furniture design and building. Browse their portfolios to see previous work." },
    ],
  },
  cleaning: {
    title: "Professional Cleaning Services",
    description: "Book verified cleaning specialists for home, office, deep cleaning, and move-in/move-out cleaning. Trusted professionals with real reviews.",
    benefits: [
      "Home, office, and commercial cleaning",
      "Deep cleaning and sanitization",
      "Eco-friendly cleaning options",
      "Flexible scheduling",
    ],
    faq: [
      { q: "What's included in a deep clean?", a: "A deep clean typically includes thorough cleaning of all rooms, inside appliances, baseboards, windows, and sanitization of bathrooms and kitchens." },
      { q: "How do I book a cleaning service?", a: "Search for 'Cleaning Services' on WorkersArena, compare providers by ratings and prices, and book directly through the platform or contact the provider." },
    ],
  },
};

// Generate static params for all categories
export async function generateStaticParams() {
  return CATEGORIES.map((cat) => ({
    trade: cat.slug,
  }));
}

export async function generateMetadata({ params }: TradePageProps): Promise<Metadata> {
  const { trade } = await params;
  const category = CATEGORIES.find((c) => c.slug === trade);
  const tradeInfo = TRADE_DESCRIPTIONS[trade];

  if (!category) return {};

  const title = tradeInfo?.title ?? `Find Trusted ${category.nameEn} Services`;
  const description = tradeInfo?.description ?? `Hire verified ${category.professionEn}s. Read real reviews, compare prices, and book trusted professionals in minutes.`;

  return {
    title,
    description,
    keywords: [
      category.nameEn.toLowerCase(),
      category.professionEn,
      "hire",
      "near me",
      "verified",
      "workersarena",
    ],
    openGraph: {
      title: `WorkersArena — ${category.nameEn}`,
      description,
      type: "website",
    },
  };
}

export default async function TradePage({ params }: TradePageProps) {
  const { trade } = await params;
  const category = CATEGORIES.find((c) => c.slug === trade);

  if (!category) {
    notFound();
  }

  const tradeInfo = TRADE_DESCRIPTIONS[trade];

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${category.nameEn} Services — WorkersArena`,
    description: tradeInfo?.description ?? `Hire verified ${category.professionEn}s.`,
    url: `https://workersarena.com/trades/${trade}`,
    provider: {
      "@type": "Organization",
      name: "WorkersArena",
      url: "https://workersarena.com",
    },
    serviceType: category.nameEn,
    areaServed: "MENA Region",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${category.nameEn} Services`,
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: `${category.nameEn} — Hire a ${category.professionEn}`,
          },
        },
      ],
    },
  };

  const faqData = tradeInfo?.faq
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: tradeInfo.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {faqData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm text-ink-400" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink-600">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/categories" className="hover:text-ink-600">Categories</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700 dark:text-ink-300">{category.nameEn}</span>
        </nav>

        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
              <CategoryIcon name={category.icon} className="size-6 text-brand-500" />
            </div>
            <span className="text-sm font-medium text-brand-600 dark:text-brand-400">
              {category.workerCount}+ verified {category.professionEn}s
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            {tradeInfo?.title ?? `Trusted ${category.nameEn} Services`}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
            {tradeInfo?.description ?? `Find verified ${category.professionEn}s for your ${category.nameEn.toLowerCase()} needs.`}
          </p>
          <Link
            href={`/search?category=${trade}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600"
          >
            Browse {category.nameEn}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Benefits */}
        {tradeInfo && (
          <section className="mb-16">
            <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
              Why hire through WorkersArena?
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {tradeInfo.benefits.map((benefit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
                >
                  <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-500" />
                  <span className="text-sm text-ink-600 dark:text-ink-300">{benefit}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
            How to hire a {category.professionEn}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: 1, title: "Search", desc: `Browse verified ${category.professionEn}s in your area` },
              { step: 2, title: "Compare", desc: "Check profiles, ratings, and prices" },
              { step: 3, title: "Contact", desc: "Message directly or book online" },
              { step: 4, title: "Review", desc: "Get the job done and share your experience" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                  {item.step}
                </div>
                <h3 className="mb-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  {item.title}
                </h3>
                <p className="text-sm text-ink-500 dark:text-ink-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        {tradeInfo?.faq && tradeInfo.faq.length > 0 && (
          <section className="mb-16">
            <h2 className="mb-6 text-2xl font-bold text-ink-900 dark:text-ink-50">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {tradeInfo.faq.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-2xl border border-ink-100 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
                >
                  <summary className="cursor-pointer text-lg font-semibold text-ink-900 dark:text-ink-50">
                    {item.q}
                  </summary>
                  <p className="mt-3 text-ink-600 dark:text-ink-300">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to find a {category.professionEn}?
          </h2>
          <p className="mt-3 text-brand-100">
            Join thousands of customers hiring verified professionals every day.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/search?category=${trade}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
            >
              Find a {category.professionEn}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              List your services
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
