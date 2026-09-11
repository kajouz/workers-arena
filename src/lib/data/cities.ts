import type { City } from "./types";

export const CITIES: City[] = [
  {
    slug: "beirut",
    nameEn: "Beirut",
    nameAr: "بيروت",
    countryEn: "Lebanon",
    countryAr: "لبنان",
    currency: "USD",
    lat: 33.8938,
    lng: 35.5018,
    areas: [
      { slug: "achrafieh", nameEn: "Achrafieh", nameAr: "الأشرفية" },
      { slug: "hamra", nameEn: "Hamra", nameAr: "الحمرا" },
      { slug: "gemmayzeh", nameEn: "Gemmayzeh", nameAr: "الجميزة" },
      { slug: "mar-mikhael", nameEn: "Mar Mikhael", nameAr: "مار مخايل" },
      { slug: "badaro", nameEn: "Badaro", nameAr: "بدارو" },
    ],
  },
];

// Tenant = lb (Lebanon). Future tenants: sa, ae, … as separate country datasets.
export const TENANT_SLUG = "lb" as const;

export const cityBySlug = (slug: string): City | undefined => CITIES.find((c) => c.slug === slug);
