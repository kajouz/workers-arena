"use client";

import { Component, type ReactNode } from "react";

export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
          Find your professional
        </h1>
        <p className="mt-2 text-ink-500 dark:text-ink-400">
          Search across verified workers, filter by trade, city and budget.
        </p>
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
        <p className="text-ink-600 dark:text-ink-300">
          Search encountered an issue. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
