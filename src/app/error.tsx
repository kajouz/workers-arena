"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary (root segment). Catches errors thrown while rendering
 * any page below the root layout, so a crash shows a calm, bilingual recovery
 * screen instead of a raw error page. The root layout (and its providers)
 * stay mounted, so useLocale is available — same pattern as not-found.tsx.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();

  // Surface the real error to the console for diagnostics (dev overlay /
  // logging services read it from there).
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <span className="flex size-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-600 dark:text-red-400">
        <TriangleAlert className="size-10" aria-hidden />
      </span>
      <h1 className="mt-6 text-4xl font-black text-ink-900 dark:text-ink-50">
        {t("misc.somethingWentWrong")}
      </h1>
      <p className="mt-2 max-w-md text-ink-500 dark:text-ink-400">{t("misc.errorBody")}</p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-ink-400 dark:text-ink-500" dir="ltr">
          {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => reset()}>
          {t("misc.tryAgain")}
        </Button>
        <Link href="/">
          <Button size="lg" variant="outline">{t("misc.backHome")}</Button>
        </Link>
      </div>
    </div>
  );
}
