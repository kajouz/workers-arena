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
import { LayoutClients } from "@/components/layout/layout-clients";
import { AnalyticsClients } from "@/components/layout/analytics-clients";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"),
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

  // Server-rendered theme (cookie) — no inline scripts, no flash, no hydration warnings.
  const theme = (await cookies()).get("wa_theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang={locale} dir={dir} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <SkipNav />
        <LocaleProvider locale={locale} dir={dir}>
          <OnboardingProvider>
          <ThemeProvider>
            <Header session={session} initialTheme={theme} />
          <main id="main-content" tabIndex={-1} className="focus:outline-none">{children}</main>
          <Footer />
          <LayoutClients />
          <AnalyticsClients>
          <Toaster />
          </AnalyticsClients>
          <InstallBanner />
          <ServiceWorkerRegistrar />
          <OnboardingOverlay />
          <HelpButton />
          </ThemeProvider>
          </OnboardingProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
