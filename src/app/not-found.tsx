"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { locale, t } = useLocale();

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <span className="flex size-20 items-center justify-center rounded-3xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
        <SearchX className="size-10" />
      </span>
      <h1 className="mt-6 text-4xl font-black text-ink-900 dark:text-ink-50">404</h1>
      <p className="mt-2 text-ink-500 dark:text-ink-400">{t("misc.pageNotFoundBody")}</p>
      <Link href="/" className="mt-8">
        <Button size="lg">{t("misc.backHome")}</Button>
      </Link>
    </div>
  );
}
