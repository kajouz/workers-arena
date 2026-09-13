import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/auth-demo";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/toast";
import { ServiceWorkerRegistrar } from "@/components/notifications/service-worker-registrar";
import { InstallBanner } from "@/components/pwa/install-banner";
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

const DEFAULT_APP_URL = "https://workersarena.com";

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

export const metadata: Metadata = {
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Initialize monitoring on server startup
  initMonitoring();

  const { locale, dir } = await getI18n();
  const session = await getSession();

  // Server renders from the wa_theme cookie; first-visit clients with no cookie
  // are handled pre-hydration by the inline script in <head> below.
  const theme = (await cookies()).get("wa_theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang={locale} dir={dir} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
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
            <Header session={session} initialTheme={theme} />
          <main id="main-content" tabIndex={-1} className="focus:outline-none pb-20 lg:pb-0">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <Footer />
          <LayoutClients />
          <AnalyticsClients>
          <Toaster />
          </AnalyticsClients>
          <Analytics />
          <SpeedInsights />
          <InstallBanner />
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
