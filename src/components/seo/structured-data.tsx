import type { Worker } from "@/lib/data/types";
import { categoryBySlug } from "@/lib/data/categories";

interface StructuredDataProps {
  worker: Worker;
  locale: "en" | "ar";
  baseUrl?: string;
}

/**
 * JSON-LD structured data for worker profiles.
 * Helps search engines understand the page content and display rich results.
 */
export function WorkerStructuredData({
  worker,
  locale,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com",
}: StructuredDataProps) {
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;
  const description = locale === "ar" ? worker.bioAr : worker.bioEn;
  const category = categoryBySlug(worker.categorySlug);
  const categoryName = locale === "ar" ? category?.nameAr : category?.nameEn;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description,
    url: `${baseUrl}/workers/${worker.slug}`,
    image: `${baseUrl}/icons/icon-512.png`,
    telephone: worker.phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: worker.citySlug,
      addressCountry: "LB",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: worker.lat,
      longitude: worker.lng,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: worker.rating,
      reviewCount: worker.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
    priceRange: `${worker.priceMin}-${worker.priceMax} ${worker.currency}`,
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "20:00",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: categoryName,
      itemListElement: worker.services.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: locale === "ar" ? service.nameAr : service.nameEn,
        },
        price: service.price,
        priceCurrency: worker.currency,
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * JSON-LD structured data for the homepage.
 */
export function HomepageStructuredData({
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com",
}: {
  baseUrl?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "WorkersArena",
    url: baseUrl,
    description:
      "Find trusted professional workers — plumbers, electricians, technicians. Search, compare, review and hire verified professionals.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * JSON-LD structured data for search results page.
 */
export function SearchResultsStructuredData({
  query,
  resultCount,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com",
}: {
  query: string;
  resultCount: number;
  baseUrl?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    name: `Search results for "${query}"`,
    url: `${baseUrl}/search?q=${encodeURIComponent(query)}`,
    numberOfItems: resultCount,
    description: `Found ${resultCount} workers for "${query}"`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * JSON-LD structured data for breadcrumb navigation.
 */
export function BreadcrumbStructuredData({
  items,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com",
}: {
  items: { name: string; url: string }[];
  baseUrl?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${baseUrl}${item.url}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
