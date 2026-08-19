import type { MetadataRoute } from "next";
import { getWorkers, getCategories, getCities } from "@/lib/data/repo";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/categories`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/auth/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/auth/register`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Dynamic worker pages
  let workerPages: MetadataRoute.Sitemap = [];
  try {
    const workers = await getWorkers({});
    workerPages = workers.items.map((worker) => ({
      url: `${BASE_URL}/workers/${worker.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error("Failed to generate worker sitemap:", error);
  }

  // Dynamic category pages
  let categoryPages: MetadataRoute.Sitemap = [];
  try {
    const categories = await getCategories();
    categoryPages = categories.map((cat) => ({
      url: `${BASE_URL}/search?category=${cat.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error("Failed to generate category sitemap:", error);
  }

  // Dynamic city pages
  let cityPages: MetadataRoute.Sitemap = [];
  try {
    const cities = await getCities();
    cityPages = cities.map((city) => ({
      url: `${BASE_URL}/search?city=${city.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error("Failed to generate city sitemap:", error);
  }

  return [...staticPages, ...workerPages, ...categoryPages, ...cityPages];
}
