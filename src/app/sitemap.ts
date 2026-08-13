import type { MetadataRoute } from "next";
import { getCategories, getWorkers } from "@/lib/data/repo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://workersarena.com";
  const [categories, workers] = await Promise.all([getCategories(), getWorkers({})]);

  const staticRoutes = ["", "/search", "/categories", "/favorites", "/auth/login", "/auth/register"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })
  );

  const categoryRoutes = categories.map((c) => ({
    url: `${base}/search?category=${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const workerRoutes = workers.items.map((w) => ({
    url: `${base}/workers/${w.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));

  return [...staticRoutes, ...categoryRoutes, ...workerRoutes];
}
