import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Star, Users, MapPin, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "About WorkersArena",
  description:
    "WorkersArena connects customers with verified professional workers across the Middle East. Learn about our mission, values, and commitment to quality.",
};

const STATS = [
  { label: "Verified Workers", value: "500+" },
  { label: "Happy Customers", value: "10,000+" },
  { label: "Cities Covered", value: "11" },
  { label: "Trade Categories", value: "21+" },
];

const VALUES = [
  {
    icon: Shield,
    title: "Trust & Safety",
    description:
      "Every worker undergoes identity verification. Professional badges require license checks and background screening. Your safety is our priority.",
  },
  {
    icon: Star,
    title: "Quality First",
    description:
      "Real customer reviews and ratings help you choose the best professionals. We never hide negative feedback — transparency builds trust.",
  },
  {
    icon: Users,
    title: "Community",
    description:
      "We're building a community of skilled professionals and satisfied customers. Our forum, reviews, and support systems connect people.",
  },
  {
    icon: MapPin,
    title: "Local Focus",
    description:
      "Operating across 11 cities in the Middle East, we understand local needs, pricing, and regulations. We're not just a global platform — we're your neighbor.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "WorkersArena",
  url: "https://workersarena.com",
  logo: "https://workersarena.com/icon.svg",
  description:
    "WorkersArena connects customers with verified professional workers across the Middle East.",
  sameAs: [],
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@workersarena.com",
    contactType: "customer service",
  },
  areaServed: [
    { "@type": "Country", name: "Saudi Arabia" },
    { "@type": "Country", name: "UAE" },
    { "@type": "Country", name: "Qatar" },
    { "@type": "Country", name: "Kuwait" },
    { "@type": "Country", name: "Bahrain" },
    { "@type": "Country", name: "Oman" },
    { "@type": "Country", name: "Jordan" },
    { "@type": "Country", name: "Lebanon" },
    { "@type": "Country", name: "Egypt" },
    { "@type": "Country", name: "Morocco" },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
            About <span className="text-gradient">WorkersArena</span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-ink-500 dark:text-ink-400">
            Connecting customers with verified professional workers across the Middle East.
            Trusted by thousands, built for quality.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-ink-100 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900"
            >
              <div className="text-3xl font-black text-brand-500">{stat.value}</div>
              <div className="mt-1 text-sm text-ink-500 dark:text-ink-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Mission */}
        <section className="mb-16">
          <h2 className="mb-6 text-3xl font-bold text-ink-900 dark:text-ink-50">
            Our Mission
          </h2>
          <div className="prose prose-lg max-w-none text-ink-600 dark:text-ink-300">
            <p>
              WorkersArena was founded with a simple mission: make it easy for anyone to find
              and hire trusted professional workers. We noticed that finding a reliable plumber,
              electrician, or carpenter was often a matter of word-of-mouth and guesswork.
            </p>
            <p>
              We&apos;re changing that by creating a transparent marketplace where workers are
              verified, reviews are real, and pricing is clear. Whether you need emergency repairs
              or a planned renovation, WorkersArena connects you with the right professional.
            </p>
            <p>
              Operating across 11 cities in Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman,
              Jordan, Lebanon, Egypt, and Morocco, we understand the local market and the
              specific needs of our communities.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mb-16">
          <h2 className="mb-8 text-3xl font-bold text-ink-900 dark:text-ink-50">
            Our Values
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {VALUES.map((value) => {
              const Icon = value.icon;
              return (
                <div
                  key={value.title}
                  className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900"
                >
                  <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/30">
                    <Icon className="size-5 text-brand-500" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-ink-900 dark:text-ink-50">
                    {value.title}
                  </h3>
                  <p className="text-sm text-ink-500 dark:text-ink-400 leading-relaxed">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Join WorkersArena today
          </h2>
          <p className="mt-3 text-brand-100">
            Whether you&apos;re looking for a worker or want to list your services, we&apos;re here to help.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-50"
            >
              Find a Worker
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              List Your Services
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
