"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * Last-resort error boundary for the ROOT layout itself (app/error.tsx only
 * wraps pages below the layout). If getSession()/getI18n() or anything in
 * layout.tsx throws — e.g. a DB outage in real mode — this renders in place of
 * the whole app. It must own its own <html>/<body> and cannot rely on the
 * LocaleProvider/ThemeProvider (they live inside the layout that failed), so
 * the copy is hardcoded bilingually.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en" dir="ltr">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-ink-50 px-4 text-center antialiased dark:bg-ink-900">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-600 dark:text-red-400">
          <TriangleAlert className="size-10" aria-hidden />
        </span>
        <h1 className="mt-6 text-4xl font-black text-ink-900 dark:text-ink-50">
          Something went wrong <span className="text-ink-400 dark:text-ink-500">·</span> حدث خطأ ما
        </h1>
        <p className="mt-2 max-w-md text-ink-500 dark:text-ink-400">
          Please try again, or reload the page. — حاول مرة أخرى أو أعد تحميل الصفحة.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-ink-400 dark:text-ink-500">{error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 text-base font-semibold text-white shadow-[0_8px_24px_-6px_rgb(249_115_22/0.5)] transition-all duration-200 hover:bg-brand-600 active:scale-[0.98]"
        >
          Try again · حاول مرة أخرى
        </button>
      </body>
    </html>
  );
}
