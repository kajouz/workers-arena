"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin error]", error);
  }, [error]);
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-black text-ink-900 dark:text-ink-50">Admin panel error</h1>
      <p className="mt-2 max-w-md text-sm text-ink-500 dark:text-ink-400">
        The admin panel could not be loaded. Please try again or contact support if it persists.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400" dir="ltr">{error.digest}</p> : null}
      <div className="mt-6">
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </div>
  );
}
