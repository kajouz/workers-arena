"use client";

import { useEffect, createContext, useContext, useState, useCallback } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

/* ─── Types ─── */
type AnalyticsProvider = "plausible" | "gtag" | "none";

interface AnalyticsContextValue {
  provider: AnalyticsProvider;
  consent: boolean;
  setConsent: (v: boolean) => void;
  track: (event: string, props?: Record<string, string | number>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  provider: "none",
  consent: false,
  setConsent: () => {},
  track: () => {},
});

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

/* ─── Env Detection ─── */
function detectProvider(): AnalyticsProvider {
  if (typeof window === "undefined") return "none";
  if (process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) return "plausible";
  if (process.env.NEXT_PUBLIC_GTAG_ID) return "gtag";
  return "none";
}

/* ─── Plausible Events (custom events via plausible API) ─── */
function plausibleTrack(event: string, props?: Record<string, string | number>) {
  if (typeof window === "undefined" || !window.plausible) return;
  (window.plausible as any)(event, { props });
}

/* ─── GA4 Events ─── */
function gtagTrack(event: string, props?: Record<string, string | number>) {
  if (typeof window === "undefined" || typeof (window as any).gtag !== "function") return;
  (window as any).gtag("event", event, props);
}

/* ─── Provider Component ─── */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("wa-analytics-consent") === "true";
  });
  const [provider] = useState<AnalyticsProvider>(detectProvider);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setConsent = useCallback((v: boolean) => {
    setConsentState(v);
    try {
      localStorage.setItem("wa-analytics-consent", String(v));
    } catch {}
  }, []);

  const track = useCallback(
    (event: string, props?: Record<string, string | number>) => {
      if (!consent) return;
      switch (provider) {
        case "plausible":
          plausibleTrack(event, props);
          break;
        case "gtag":
          gtagTrack(event, props);
          break;
      }
    },
    [consent, provider]
  );

  // Track page views on route change
  useEffect(() => {
    if (!consent) return;
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    track("pageview", { url });
  }, [pathname, searchParams, consent, track]);

  return (
    <AnalyticsContext.Provider value={{ provider, consent, setConsent, track }}>
      {/* Plausible Analytics */}
      {consent && process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
        <Script
          defer
          data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
          src="https://plausible.io/js/script.tagged-events.js"
          strategy="afterInteractive"
        />
      )}

      {/* Google Analytics (GA4) */}
      {consent && process.env.NEXT_PUBLIC_GTAG_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GTAG_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${process.env.NEXT_PUBLIC_GTAG_ID}', {
  page_path: window.location.pathname,
  anonymize_ip: true
});`}
          </Script>
        </>
      )}

      {children}
    </AnalyticsContext.Provider>
  );
}

/* ─── Consent Banner ─── */
export function AnalyticsConsentBanner() {
  const { consent, setConsent, provider } = useAnalytics();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!consent && provider !== "none") {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [consent, provider]);

  if (consent || !visible || provider === "none") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-ink-200 bg-white p-4 shadow-lift dark:border-ink-700 dark:bg-ink-900 sm:bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:max-w-lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
            Analytics & Privacy
          </p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            We use privacy-friendly analytics to improve your experience. No personal data is sold.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { setConsent(false); setVisible(false); }}
            className="rounded-xl px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            Decline
          </button>
          <button
            onClick={() => { setConsent(true); setVisible(false); }}
            className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Plausible Window Type ─── */
declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, any> }) => void;
  }
}
