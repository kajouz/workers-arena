"use client";

import { MapPin, Navigation } from "lucide-react";
import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cityBySlug } from "@/lib/data/cities";

export function MapEmbed({ worker }: { worker: Worker }) {
  const { locale, t } = useLocale();
  const city = cityBySlug(worker.citySlug);
  const directionsUrl = `https://www.openstreetmap.org/directions?from=&to=${worker.lat}%2C${worker.lng}`;
  const areaLabel = locale === "ar" ? city?.nameAr : city?.nameEn;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-brand-500" />
            {t("worker.serviceAreasTitle")}
          </CardTitle>
          <Badge variant="outline">{areaLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-72 w-full overflow-hidden">
          {/* OSM embed (loads at runtime; graceful gradient fallback behind) */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #e8f1e8 0%, #dbe7e0 50%, #cfe0d4 100%)",
            }}
          />
          <iframe
            title={`${worker.nameEn} service area — ${areaLabel}`}
            className="relative h-full w-full border-0"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${worker.lng - 0.06}%2C${worker.lat - 0.04}%2C${worker.lng + 0.06}%2C${worker.lat + 0.04}&layer=mapnik&marker=${worker.lat}%2C${worker.lng}`}
          />
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-xl bg-ink-950/90 px-4 py-2.5 text-sm font-bold text-white shadow-lift backdrop-blur-sm transition-colors hover:bg-brand-600"
          >
            <Navigation className="size-4" />
            {t("worker.directions")}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
