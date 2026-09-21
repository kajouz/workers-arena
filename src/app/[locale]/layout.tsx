import type { Metadata, Viewport } from "next";
import "../globals.css";
import { notFound } from "next/navigation";
import { defaultLocale, isLocale, localeDir, locales } from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorkerRegistrar } from "@/components/notifications/service-worker-registrar";
import { InstallBanner } from "@/components/pwa/install-banner";
import { UpdateBanner } from "@/components/pwa/update-banner";
import { SkipNav } from "@/components/layout/skip-nav";
import { initMonitoring } from "@/lib/monitoring";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { OnboardingOverlay } from "@/components/onboarding/onboarding-overlay";
import { HelpButton } from "@/components/onboarding/help-button";
import { MobileBannerAd } from "@/components/ads/mobile-banner-ad";
import { RetargetingAd } from "@/components/ads/retargeting-ad";
import { LayoutClients } from "@/components/layout/layout-clients";
import { CapacitorProvider } from "@/components/layout/capacitor-provider";
import { AnalyticsClients } from "@/components/layout/analytics-clients";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const DEFAULT_APP_URL = "https://workers-arena.vercel.app";

function getMetadataBase(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return new URL(DEFAULT_APP_URL);

  try {
    return new URL(configured);
  } catch {
    // A malformed dashboard value must not make every route fail to build.
    return new URL(DEFAULT_APP_URL);
  }
}

/**
 * Per-locale metadata. The `alternates.languages` pair is what makes the
 * Arabic side its own document to a crawler rather than a duplicate of the
 * English one — it could not be expressed at all while the language lived in
 * a cookie, because both languages shared one URL.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const dict = dictionaries[locale];

  /**
   * No `alternates` here on purpose. A layout cannot know the page path, so a
   * canonical set at this level pointed EVERY page at the locale root —
   * /ar/search declared itself a duplicate of /ar. hreflang and canonical are
   * per-page facts; the public SEO pages each build theirs with
   * localeAlternates().
   */
  return {
    ...baseMetadata,
    title: {
      default: `${dict.app.name} — ${dict.app.tagline}`,
      template: `%s · ${dict.app.name}`,
    },
    description: dict.app.description,
    openGraph: {
      ...baseMetadata.openGraph,
      title: dict.app.name,
      description: dict.app.tagline,
      locale: locale === "ar" ? "ar_LB" : "en_US",
      alternateLocale: locale === "ar" ? "en_US" : "ar_LB",
    },
  };
}

const baseMetadata: Metadata = {
  title: {
    default: "WorkersArena — Find trusted professionals near you",
    template: "%s · WorkersArena",
  },
  description:
    "WorkersArena is the marketplace directory for professional workers — plumbers, electricians, technicians and more. Search, compare, review and hire verified professionals in minutes.",
  keywords: [
    "plumber",
    "electrician",
    "professional workers",
    "directory",
    "سباك",
    "كهربائي",
    "عمال محترفون",
  ],
  metadataBase: getMetadataBase(),
  applicationName: "WorkersArena",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WorkersArena",
  },
  formatDetection: {
    telephone: true, // call links are a first-class action on worker profiles
  },
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "WorkersArena",
    description: "Find trusted professionals near you — verified workers, real reviews.",
    locale: "en_US",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // safe-area aware when installed (notches / home indicator)
};

/**
 * Both locales are known at build time, so every route under this layout can
 * be prerendered per language instead of server-rendered per request.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Initialize monitoring on server startup
  initMonitoring();

  const { locale: raw } = await params;
  // An unknown prefix (/de/…, /xx/…) is not this app's route. The proxy only
  // forwards the two real locales, so reaching here with anything else means
  // a hand-typed URL — 404 rather than silently serving English under it.
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const dir = localeDir[locale];

  /**
   * No session is read here.
   *
   * This layout is shared by every route, so a cookie read in it made every
   * route dynamic — the build prerendered 4 routes out of ~200. The header is
   * the only thing that wanted the session, so it moved down into the two
   * route groups: (app) resolves it server-side (those pages are per-user
   * anyway), and (public) ships a prerendered header that asks /api/session
   * after hydration. See the group layouts.
   */

  /**
   * The theme is NOT read here.
   *
   * It used to come from the `wa_theme` cookie, which stamped every document
   * with one browser's preference — so src/proxy.ts had to send
   * `private, no-store` to anyone who had ever toggled it, which after the
   * first page view is everyone (the bootstrap script below writes the cookie).
   * The blocking script already resolves cookie → localStorage → media query
   * and applies the class before first paint, which is the same result with no
   * flash and no per-browser HTML. `suppressHydrationWarning` covers the
   * class/style delta it introduces, exactly as before.
   */
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Pre-hydration theme resolution (the next-themes pattern, inlined):
            the server only knows the wa_theme cookie, but the client theme can
            also come from localStorage or prefers-color-scheme — so a
            first-visit dark-preference user used to get light SSR HTML, a
            light flash, AND a post-hydration class write that React reported
            as an attribute mismatch. This blocking script runs BEFORE React
            hydrates: it resolves the theme with the same precedence as
            getInitialTheme (cookie → localStorage → media query), applies the
            class + color-scheme, and backfills the cookie so every later SSR
            render matches. The class/style delta vs the SSR HTML is exactly
            what suppressHydrationWarning on <html> covers. CSP note: the
            proxy's script-src already allows 'unsafe-inline' for this. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var m=document.cookie.match(/(?:^|; )wa_theme=(light|dark)/),t=m?m[1]:null;if(t!=="dark"&&t!=="light"){t=localStorage.getItem("wa_theme")}if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;if(!m){document.cookie="wa_theme="+t+";path=/;max-age=31536000;samesite=lax"}}catch(e){}})();',
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load font CSS — preconnects above speed up font delivery */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: root-layout <head> is the correct home for fonts (the rule targets Pages Router _document) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <SkipNav />
        <LocaleProvider locale={locale} dir={dir}>
          <CurrencyProvider>
          <OnboardingProvider>
          <ThemeProvider>
            {/* The route groups render <Header> + <main> — see (public)/layout
                and (app)/layout. Everything below is identical on both. */}
            <ErrorBoundary>{children}</ErrorBoundary>
          <Footer />
          <LayoutClients />
          <AnalyticsClients>
          <Toaster />
          </AnalyticsClients>
          {/* Vercel-only: off Vercel (localhost, CI, Capacitor, other hosts)
              /_vercel/insights/script.js and /_vercel/speed-insights/script.js
              404 as text/html, and the blocked script + the packages'
              console.error/console.log ("Failed to load script… be sure to
              enable Web Analytics") pollute every page. Vercel sets VERCEL=1
              on its builds/deploys, so gate on that. (If the scripts still
              404 on the production deployment itself, enable Web Analytics
              + Speed Insights for the project in the Vercel dashboard.) */}
          {process.env.VERCEL === "1" && (
            <>
              <Analytics />
              <SpeedInsights />
            </>
          )}
          <InstallBanner />
          <UpdateBanner />
          <ServiceWorkerRegistrar />
          <OnboardingOverlay />
          <HelpButton />
          <MobileBannerAd />
          <RetargetingAd />
          <CapacitorProvider />
          </ThemeProvider>
          </OnboardingProvider>
          </CurrencyProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
