"use client";

import { useEffect } from "react";
import { Link } from "@/components/i18n/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CityError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cities/[city] error]", error);
  }, [error]);
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-600">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-black text-ink-900 dark:text-ink-50">City page error</h1>
      <p className="mt-2 max-w-md text-sm text-ink-500 dark:text-ink-400">This city page could not be loaded.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400" dir="ltr">{error.digest}</p> : null}
      <div className="mt-6 flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/"><Button variant="outline">Home</Button></Link>
      </div>
    </div>
  );
}
