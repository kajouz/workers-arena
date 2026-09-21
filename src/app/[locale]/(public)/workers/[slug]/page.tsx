import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { notFound } from "next/navigation";
import { ProfileHero } from "@/components/worker/profile-hero";
import { ContactCard } from "@/components/worker/contact-card";
import { ProfileTabs } from "@/components/worker/profile-tabs";
import { ReviewsSection } from "@/components/worker/reviews-section";
import { MapEmbed } from "@/components/worker/map-embed";
import { RelatedWorkers } from "@/components/worker/related-workers";
import { FloatingWhatsApp } from "@/components/worker/whatsapp-contact";
import { WorkerPortfolio } from "@/components/worker/worker-portfolio";
import { WorkerSponsor } from "@/components/worker/worker-sponsor";
import { getAllWorkers, getRelated, getWorkerBySlug, getWorkerSlots } from "@/lib/data/repo";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { localeAlternates } from "@/lib/i18n/routing";
import { categoryBySlug } from "@/lib/data/categories";
import { cityBySlug } from "@/lib/data/cities";

/**
 * Worker profiles are the catalogue — the pages organic search actually lands
 * on — so they are built ahead of time rather than rendered per request.
 * `dynamicParams` stays on (the default): a worker added after the build is
 * rendered on demand and cached, instead of 404ing until the next deploy.
 */
export async function generateStaticParams() {
  try {
    // getWorkers() is the PAGINATED search seam — it returned only the first
    // page, so most profiles silently fell back to on-demand rendering.
    const workers = await getAllWorkers();
    return workers.map((worker) => ({ slug: worker.slug }));
  } catch {
    // A build without a reachable data source still succeeds; every profile
    // just falls back to on-demand rendering.
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const worker = await getWorkerBySlug(slug);
  if (!worker) return { title: "Worker not found" };

  // Arabic profiles get Arabic titles and descriptions — while the language
  // lived in a cookie every profile had one English <title> regardless of what
  // the page rendered.
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;
  const bio = (locale === "ar" ? worker.bioAr : worker.bioEn).slice(0, 160);
  return {
    title: name,
    description: bio,
    alternates: localeAlternates(`/${locale}/workers/${slug}`),
    openGraph: {
      title: `${name} — WorkersArena`,
      description: bio,
      type: "profile",
      locale: locale === "ar" ? "ar_LB" : "en_US",
    },
  };
}

export default async function WorkerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const worker = await getWorkerBySlug(slug);
  if (!worker) notFound();

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [related, slots] = await Promise.all([
    getRelated(worker, 4),
    getWorkerSlots(worker.id, { from: from.toISOString(), to: to.toISOString() }),
  ]);
  const cat = categoryBySlug(worker.categorySlug);
  const city = cityBySlug(worker.citySlug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: worker.nameEn,
    image: undefined,
    description: worker.bioEn,
    address: {
      "@type": "PostalAddress",
      addressLocality: worker.citySlug,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: worker.rating,
      reviewCount: worker.reviewCount,
    },
    makesOffer: worker.services.map((s) => ({
      "@type": "Offer",
      name: s.nameEn,
      price: s.price,
      priceCurrency: worker.currency,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-400" aria-label="Breadcrumb">
        <Link href="/" className="transition-colors hover:text-brand-600">Home</Link>
        <span aria-hidden>/</span>
        <a href={`/search?category=${worker.categorySlug}`} className="transition-colors hover:text-brand-600">
          {cat?.nameEn}
        </a>
        <span aria-hidden>/</span>
        <span className="text-ink-700 dark:text-ink-200">{worker.nameEn}</span>
      </nav>

      <ProfileHero worker={worker} />

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileTabs worker={worker} />
          <ReviewsSection worker={worker} />
          <WorkerPortfolio worker={worker} />
          <MapEmbed worker={worker} />
        </div>
        <div>
          {/* Multi-candidate quotes — the pickable pool is the profile worker
              + related (same trade), deduped by id. */}
          <ContactCard
            worker={worker}
            slots={slots}
            candidates={[worker, ...related.filter((r) => r.id !== worker.id)]}
          />
          
          {/* Sponsored Ad */}
          <WorkerSponsor
            workerCategory={cat?.nameEn}
            workerCity={city?.nameEn}
          />
        </div>
      </div>

      <RelatedWorkers workers={related} />

      {/* Floating WhatsApp button for quick contact */}
      {worker.phone && (
        <FloatingWhatsApp
          whatsapp={worker.phone}
          workerName={worker.nameEn}
        />
      )}
    </div>
  );
}
