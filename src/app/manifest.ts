import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorkersArena — Professional Workers Directory",
    short_name: "WorkersArena",
    description:
      "Find trusted professional workers — plumbers, electricians, technicians and more. Bilingual (EN/AR).",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f4",
    theme_color: "#f97316",
    dir: "ltr",
    lang: "en",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
