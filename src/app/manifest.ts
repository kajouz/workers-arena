import type { MetadataRoute } from "next";
import { cookies } from "next/headers";

/**
 * PWA web app manifest. Served at /manifest.webmanifest by Next.js.
 *
 * Installability requirements covered here:
 *  - PNG icons at 192px and 512px ("any" purpose) + a maskable 512px variant
 *    (Chrome/Lighthouse require a 192 and a 512; maskable for adaptive icons).
 *  - `id` (stable app identity), `start_url` + `scope`, `display: standalone`.
 *  - `dir`/`lang` are read from the wa_locale cookie at request time, so an
 *    Arabic user's installed app is RTL (لا) while an English user's is LTR —
 *    the installed app mirrors the language the visitor chose.
 *  - `shortcuts` give long-press deep links to the four role surfaces.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let locale: "en" | "ar" = "en";
  try {
    const store = await cookies();
    if (store.get("wa_locale")?.value === "ar") locale = "ar";
  } catch {
    // cookies() unavailable (static export) — default to English.
  }

  return {
    id: "/",
    name: "WorkersArena — Professional Workers Directory",
    short_name: "WorkersArena",
    description:
      "Find trusted professional workers — plumbers, electricians, technicians and more. Bilingual (EN/AR).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    background_color: "#f7f6f4",
    theme_color: "#f97316",
    dir: locale === "ar" ? "rtl" : "ltr",
    lang: locale,
    categories: ["business", "shopping", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Search workers",
        short_name: "Search",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My bookings",
        short_name: "Bookings",
        url: "/bookings",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Worker dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Company dashboard",
        short_name: "Company",
        url: "/company",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
