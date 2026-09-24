"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./onboarding-provider";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Help button that triggers the onboarding tour.
 * Shows a question mark icon with a tooltip.
 */
export function HelpButton() {
  const { startOnboarding, isCompleted } = useOnboarding();
  const { t } = useLocale();

  // Don't show if user has completed onboarding
  if (isCompleted) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={startOnboarding}
      aria-label={t("common.help") ?? "Take a tour"}
      title={t("common.help") ?? "Take a tour"}
      // z-prompt (70) sat ABOVE dialogs (60) and covered the booking dialog's
      // Next button. z-fab puts it below any modal so a dialog hides it — and
      // above --bottom-chrome so it clears the tab bar (finding 3).
      className="fixed bottom-[calc(var(--bottom-chrome)+6rem)] end-6 z-fab size-12 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 hover:shadow-xl"
    >
      <HelpCircle className="size-6" />
    </Button>
  );
}
