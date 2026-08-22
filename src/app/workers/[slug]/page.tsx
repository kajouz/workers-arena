import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileHero } from "@/components/worker/profile-hero";
import { ContactCard } from "@/components/worker/contact-card";
import { ProfileTabs } from "@/components/worker/profile-tabs";
import { ReviewsSection } from "@/components/worker/reviews-section";
import { MapEmbed } from "@/components/worker/map-embed";
import { RelatedWorkers } from "@/components/worker/related-workers";
import { FloatingWhatsApp } from "@/components/worker/whatsapp-contact";
import { getRelated, getWorkerBySlug, getWorkerSlots } from "@/lib/data/repo";
import { categoryBySlug } from "@/lib/data/categories";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const worker = await getWorkerBySlug(slug);
  if (!worker) return { title: "Worker not found" };
  return {
    title: worker.nameEn,
    description: worker.bioEn.slice(0, 160),
    openGraph: {
      title: `${worker.nameEn} — WorkersArena`,
      description: worker.bioEn.slice(0, 160),
      type: "profile",
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
        <a href="/" className="transition-colors hover:text-brand-600">Home</a>
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
