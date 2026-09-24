"use client";

import { ThemeTransition } from "@/components/providers/theme-transition";
// BottomTabs is imported statically (not `dynamic({ ssr: false })`): the bar
// used to mount only after hydration and pop onto the screen late. It reads
// `usePathname`, which resolves fine during SSR, so it renders on the server
// now (finding 20).
import { BottomTabs } from "@/components/layout/bottom-tabs";

export function LayoutClients() {
  return (
    <>
      <ThemeTransition />
      <BottomTabs />
    </>
  );
}
