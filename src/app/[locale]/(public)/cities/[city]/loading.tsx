import { LogoMark } from "@/components/shared/logo";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading city" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-6">
        <LogoMark className="animate-pulse" />
        <div className="w-full max-w-5xl space-y-4">
          <div className="skeleton h-8 w-48 rounded-xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
