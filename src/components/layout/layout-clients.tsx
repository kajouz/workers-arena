"use client";

import dynamic from "next/dynamic";
import { ThemeTransition } from "@/components/providers/theme-transition";

const BottomTabs = dynamic(
  () =>
    import("@/components/layout/bottom-tabs").then((m) => ({
      default: m.BottomTabs,
    })),
  { ssr: false }
);

export function LayoutClients() {
  return (
    <>
      <ThemeTransition />
      <BottomTabs />
    </>
  );
}
