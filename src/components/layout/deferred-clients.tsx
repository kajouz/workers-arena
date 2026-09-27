"use client";

import dynamic from "next/dynamic";

// App-wide extras that render nothing (or only a fixed-position overlay) on
// first paint. Loaded after hydration so they stay out of every page's first
// JavaScript bundle; none of them affects layout, so deferring them can't
// shift content. Rendered inside OnboardingProvider, so the tour overlay and
// help button still see its context.
const InstallBanner = dynamic(() => import("@/components/pwa/install-banner").then((m) => m.InstallBanner), { ssr: false });
const UpdateBanner = dynamic(() => import("@/components/pwa/update-banner").then((m) => m.UpdateBanner), { ssr: false });
const ServiceWorkerRegistrar = dynamic(
  () => import("@/components/notifications/service-worker-registrar").then((m) => m.ServiceWorkerRegistrar),
  { ssr: false }
);
const OnboardingOverlay = dynamic(() => import("@/components/onboarding/onboarding-overlay").then((m) => m.OnboardingOverlay), { ssr: false });
const HelpButton = dynamic(() => import("@/components/onboarding/help-button").then((m) => m.HelpButton), { ssr: false });
const MobileBannerAd = dynamic(() => import("@/components/ads/mobile-banner-ad").then((m) => m.MobileBannerAd), { ssr: false });
const RetargetingAd = dynamic(() => import("@/components/ads/retargeting-ad").then((m) => m.RetargetingAd), { ssr: false });
const CapacitorProvider = dynamic(() => import("@/components/layout/capacitor-provider").then((m) => m.CapacitorProvider), { ssr: false });

/** The prompts and overlays — rendered inside PromptQueueProvider. */
export function DeferredClients() {
  return (
    <>
      <InstallBanner />
      <UpdateBanner />
      <ServiceWorkerRegistrar />
      <OnboardingOverlay />
      <HelpButton />
      <MobileBannerAd />
      <RetargetingAd />
    </>
  );
}

/** Native-shell setup (no-op in a browser) — outside the prompt queue. */
export function DeferredCapacitorProvider() {
  return <CapacitorProvider />;
}
