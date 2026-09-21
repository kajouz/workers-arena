import type { MetadataRoute } from "next";
import { getWorkers, getCategories, getCities } from "@/lib/data/repo";
import { locales, defaultLocale } from "@/lib/i18n/config";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://workers-arena.vercel.app";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Every public URL, in every language.
 * ────────────────────────────────────────────────────────────────────────────
 * The sitemap used to list one URL per page, unprefixed — which was the only
 * thing it could do while the language lived in a cookie. Half the catalogue
 * (the Arabic half) had no address to submit, so it was never indexed.
 *
 * Now each page is emitted once per locale, and every entry carries
 * `alternates.languages`, the sitemap form of hreflang. That tells a crawler
 * the two URLs are the same page in different languages rather than duplicate
 * content — the part that actually earns the Arabic pages their own ranking.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Entry = Omit<MetadataRoute.Sitemap[number], "url">;

/** One sitemap row per locale for an app path, cross-linked with hreflang. */
function forEachLocale(path: string, entry: Entry): MetadataRoute.Sitemap {
  const bare = path === "/" ? "" : path;
  const languages = Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${bare}`]));
  return locales.map((locale) => ({
    ...entry,
    url: `${BASE_URL}/${locale}${bare}`,
    alternates: { languages: { ...languages, "x-default": `${BASE_URL}/${defaultLocale}${bare}` } },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages. /auth/* is deliberately absent — robots.txt disallows it, so
  // listing it only asked crawlers to fetch what they were told to skip.
  const staticPages: MetadataRoute.Sitemap = [
    ...forEachLocale("/", { lastModified: now, changeFrequency: "daily", priority: 1 }),
    ...forEachLocale("/search", { lastModified: now, changeFrequency: "daily", priority: 0.9 }),
    ...forEachLocale("/categories", { lastModified: now, changeFrequency: "weekly", priority: 0.8 }),
    ...forEachLocale("/about", { lastModified: now, changeFrequency: "monthly", priority: 0.6 }),
    ...forEachLocale("/faq", { lastModified: now, changeFrequency: "monthly", priority: 0.6 }),
  ];

  let workerPages: MetadataRoute.Sitemap = [];
  try {
    const workers = await getWorkers({});
    workerPages = workers.items.flatMap((worker) =>
      forEachLocale(`/workers/${worker.slug}`, {
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      })
    );
  } catch (error) {
    console.error("Failed to generate worker sitemap:", error);
  }

  let categoryPages: MetadataRoute.Sitemap = [];
  let tradePages: MetadataRoute.Sitemap = [];
  try {
    const categories = await getCategories();
    categoryPages = categories.flatMap((cat) =>
      forEachLocale(`/search?category=${cat.slug}`, {
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      })
    );
    tradePages = categories.flatMap((cat) =>
      forEachLocale(`/trades/${cat.slug}`, {
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      })
    );
  } catch (error) {
    console.error("Failed to generate category sitemap:", error);
  }

  let cityPages: MetadataRoute.Sitemap = [];
  try {
    const cities = await getCities();
    cityPages = cities.flatMap((city) =>
      forEachLocale(`/cities/${city.slug}`, {
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.6,
      })
    );
  } catch (error) {
    console.error("Failed to generate city sitemap:", error);
  }

  return [...staticPages, ...workerPages, ...categoryPages, ...tradePages, ...cityPages];
}
