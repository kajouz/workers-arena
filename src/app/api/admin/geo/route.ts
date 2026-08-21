import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllWorkers } from "@/lib/data/repo";

export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workers = await getAllWorkers();

  // Aggregate by city
  const cityMap = new Map<string, { lat: number; lng: number; count: number; ratings: number[]; categories: Set<string> }>();

  for (const w of workers) {
    const existing = cityMap.get(w.citySlug);
    if (existing) {
      existing.count++;
      existing.ratings.push(w.rating);
      existing.categories.add(w.categorySlug);
    } else {
      cityMap.set(w.citySlug, {
        lat: w.lat,
        lng: w.lng,
        count: 1,
        ratings: [w.rating],
        categories: new Set([w.categorySlug]),
      });
    }
  }

  const cities = Array.from(cityMap.entries()).map(([city, data]) => ({
    city,
    lat: data.lat,
    lng: data.lng,
    workerCount: data.count,
    avgRating: data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length,
    categories: Array.from(data.categories),
  }));

  return NextResponse.json({
    totalWorkers: workers.length,
    totalCities: cities.length,
    cities,
    workers: workers.map((w) => ({
      lat: w.lat,
      lng: w.lng,
      nameEn: w.nameEn,
      nameAr: w.nameAr,
      categorySlug: w.categorySlug,
      citySlug: w.citySlug,
      rating: w.rating,
      hue: w.hue,
    })),
  });
}
