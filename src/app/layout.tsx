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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();
  const session = await getSession();

  // Server-rendered theme (cookie) — no inline scripts, no flash, no hydration warnings.
  const theme = (await cookies()).get("wa_theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang={locale} dir={dir} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <LocaleProvider locale={locale} dir={dir}>
          <ThemeProvider>
            <Header session={session} initialTheme={theme} />
            <main>{children}</main>
            <Footer />
            <Toaster />
            <ServiceWorkerRegistrar />
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
