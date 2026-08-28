"use client";

import { useEffect, useState, useMemo } from "react";
import { MapPin, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompact } from "@/lib/utils";

interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
  category: string;
  city: string;
  rating: number;
  workers: number;
  hue: number;
}

interface CityCluster {
  city: string;
  lat: number;
  lng: number;
  workerCount: number;
  avgRating: number;
  categories: string[];
}

// MENA region center coordinates
const DEFAULT_CENTER = { lat: 28.0, lng: 45.0 };
const DEFAULT_ZOOM = 4;

function getMarkerSize(count: number): number {
  if (count > 5) return 40;
  if (count > 3) return 32;
  if (count > 1) return 24;
  return 18;
}

function getMarkerColor(workerCount: number): string {
  if (workerCount > 5) return "bg-red-500";
  if (workerCount > 3) return "bg-orange-500";
  if (workerCount > 1) return "bg-yellow-500";
  return "bg-blue-500";
}

// Simple CSS-based map visualization (no Leaflet SSR issues)
function MapVisualization({
  clusters,
  selectedCity,
  onSelectCity,
}: {
  clusters: CityCluster[];
  selectedCity: string | null;
  onSelectCity: (city: string | null) => void;
}) {
  // Map city coordinates to relative positions on a virtual grid
  const cityPositions = useMemo(() => {
    const bounds = {
      minLat: Math.min(...clusters.map((c) => c.lat)) - 2,
      maxLat: Math.max(...clusters.map((c) => c.lat)) + 2,
      minLng: Math.min(...clusters.map((c) => c.lng)) - 2,
      maxLng: Math.max(...clusters.map((c) => c.lng)) + 2,
    };

    return clusters.map((cluster) => ({
      ...cluster,
      x: ((cluster.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100,
      y: ((bounds.maxLat - cluster.lat) / (bounds.maxLat - bounds.minLat)) * 100,
    }));
  }, [clusters]);

  return (
    <div className="relative h-[350px] w-full overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20">
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-10">
        {[...Array(10)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute w-full border-t border-blue-300"
            style={{ top: `${(i + 1) * 10}%` }}
          />
        ))}
        {[...Array(10)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute h-full border-l border-blue-300"
            style={{ left: `${(i + 1) * 10}%` }}
          />
        ))}
      </div>

      {/* Map label */}
      <div className="absolute left-3 top-3 z-10 rounded-lg bg-white/80 px-2 py-1 text-[10px] font-semibold text-ink-600 backdrop-blur-sm dark:bg-ink-900/80 dark:text-ink-300">
        🌍 MENA Region Overview
      </div>

      {/* City markers */}
      {cityPositions.map((city) => (
        <button
          key={city.city}
          onClick={() => onSelectCity(selectedCity === city.city ? null : city.city)}
          className={`absolute z-20 transition-all duration-200 ${
            selectedCity === city.city ? "scale-125" : "hover:scale-110"
          }`}
          style={{
            left: `${city.x}%`,
            top: `${city.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="relative">
            {/* Pulse ring for selected */}
            {selectedCity === city.city && (
              <div className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-30" />
            )}
            {/* Marker */}
            <div
              className={`relative flex items-center justify-center rounded-full text-white shadow-lg ${getMarkerColor(city.workerCount)}`}
              style={{
                width: getMarkerSize(city.workerCount),
                height: getMarkerSize(city.workerCount),
              }}
            >
              <MapPin className="size-4" />
            </div>
            {/* Label */}
            <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold shadow dark:bg-ink-900/90">
              {city.city}
              <span className="ml-1 text-ink-400">({city.workerCount})</span>
            </div>
          </div>
        </button>
      ))}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-white/80 p-2 backdrop-blur-sm dark:bg-ink-900/80">
        <p className="mb-1 text-[9px] font-semibold text-ink-500">Worker Density</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-blue-500" />
            <span className="text-[8px] text-ink-400">1</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-3 rounded-full bg-yellow-500" />
            <span className="text-[8px] text-ink-400">2-3</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-4 rounded-full bg-orange-500" />
            <span className="text-[8px] text-ink-400">4-5</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-5 rounded-full bg-red-500" />
            <span className="text-[8px] text-ink-400">6+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GeoHeatmap({
  workers,
  locale = "en",
}: {
  workers: { lat: number; lng: number; nameEn: string; nameAr: string; categorySlug: string; citySlug: string; rating: number; hue: number }[];
  locale?: string;
}) {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  // Aggregate workers by city
  const clusters: CityCluster[] = useMemo(() => {
    const cityMap = new Map<string, CityCluster>();

    for (const w of workers) {
      const existing = cityMap.get(w.citySlug);
      if (existing) {
        existing.workerCount++;
        existing.avgRating = (existing.avgRating * (existing.workerCount - 1) + w.rating) / existing.workerCount;
        if (!existing.categories.includes(w.categorySlug)) {
          existing.categories.push(w.categorySlug);
        }
      } else {
        cityMap.set(w.citySlug, {
          city: w.citySlug,
          lat: w.lat,
          lng: w.lng,
          workerCount: 1,
          avgRating: w.rating,
          categories: [w.categorySlug],
        });
      }
    }

    return Array.from(cityMap.values()).sort((a, b) => b.workerCount - a.workerCount);
  }, [workers]);

  // Stats
  const totalWorkers = workers.length;
  const totalCities = clusters.length;
  const avgRating = clusters.reduce((s, c) => s + c.avgRating, 0) / clusters.length;

  // Filter by selected city
  const filteredWorkers = selectedCity
    ? workers.filter((w) => w.citySlug === selectedCity)
    : workers;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-5 text-brand-500" />
          {locale === "ar" ? "التوزيع الجغرافي" : "Geographic Distribution"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px]">
            {totalCities} {locale === "ar" ? "مدن" : "cities"}
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            {formatCompact(totalWorkers)} {locale === "ar" ? "عامل" : "workers"}
          </Badge>
          <div className="flex rounded-lg border border-ink-200 dark:border-ink-700">
            <button
              onClick={() => setViewMode("map")}
              className={`rounded-l-lg px-2 py-1 text-[10px] transition-colors ${
                viewMode === "map"
                  ? "bg-brand-700 text-white"
                  : "text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
            >
              <Layers className="size-3" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-r-lg px-2 py-1 text-[10px] transition-colors ${
                viewMode === "list"
                  ? "bg-brand-700 text-white"
                  : "text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
            >
              ☰
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {viewMode === "map" ? (
          <MapVisualization
            clusters={clusters}
            selectedCity={selectedCity}
            onSelectCity={setSelectedCity}
          />
        ) : (
          <div className="space-y-2">
            {clusters.map((cluster) => (
              <button
                key={cluster.city}
                onClick={() => setSelectedCity(selectedCity === cluster.city ? null : cluster.city)}
                className={`flex w-full items-center justify-between rounded-xl p-3 transition-colors ${
                  selectedCity === cluster.city
                    ? "bg-brand-500/10 ring-1 ring-brand-500/30"
                    : "bg-white/70 hover:bg-ink-50 dark:bg-ink-900/70 dark:hover:bg-ink-800/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full text-white ${getMarkerColor(cluster.workerCount)}`}
                  >
                    <MapPin className="size-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{cluster.city}</p>
                    <p className="text-[10px] text-ink-400">
                      {cluster.categories.length} {locale === "ar" ? "فئات" : "categories"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{cluster.workerCount}</p>
                  <p className="text-[10px] text-ink-400">
                    ⭐ {cluster.avgRating.toFixed(1)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* City details when selected */}
        {selectedCity && (
          <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink-900 dark:text-ink-50">
                {selectedCity.charAt(0).toUpperCase() + selectedCity.slice(1).replace("-", " ")}
              </h4>
              <button
                onClick={() => setSelectedCity(null)}
                className="text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                {locale === "ar" ? "إلغاء التحديد" : "Clear"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-2 dark:bg-ink-900">
                <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                  {filteredWorkers.length}
                </p>
                <p className="text-[10px] text-ink-400">{locale === "ar" ? "عمال" : "Workers"}</p>
              </div>
              <div className="rounded-lg bg-white p-2 dark:bg-ink-900">
                <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                  {new Set(filteredWorkers.map((w) => w.categorySlug)).size}
                </p>
                <p className="text-[10px] text-ink-400">{locale === "ar" ? "فئات" : "Categories"}</p>
              </div>
              <div className="rounded-lg bg-white p-2 dark:bg-ink-900">
                <p className="text-lg font-black text-ink-900 dark:text-ink-50">
                  {(filteredWorkers.reduce((s, w) => s + w.rating, 0) / filteredWorkers.length).toFixed(1)}
                </p>
                <p className="text-[10px] text-ink-400">{locale === "ar" ? "متوسط التقييم" : "Avg Rating"}</p>
              </div>
            </div>
          </div>
        )}

        {/* City stats bar */}
        <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-2 dark:bg-ink-800/50">
          <span className="text-xs text-ink-500">
            {locale === "ar" ? "متوسط التقييم العام" : "Overall Avg Rating"}
          </span>
          <span className="text-sm font-bold text-ink-900 dark:text-ink-50">⭐ {avgRating.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
