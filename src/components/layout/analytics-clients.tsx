"use client";

import dynamic from "next/dynamic";

const AnalyticsProvider = dynamic(
  () =>
    import("@/components/analytics/analytics-provider").then((m) => ({
      default: m.AnalyticsProvider,
    })),
  { ssr: false }
);

const AnalyticsConsentBanner = dynamic(
  () =>
    import("@/components/analytics/analytics-provider").then((m) => ({
      default: m.AnalyticsConsentBanner,
    })),
  { ssr: false }
);

export function AnalyticsClients({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsProvider>
      {children}
      <AnalyticsConsentBanner />
    </AnalyticsProvider>
  );
}
