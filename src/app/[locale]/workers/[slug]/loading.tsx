import { LogoMark } from "@/components/shared/logo";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading worker profile" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-6">
        <LogoMark className="animate-pulse" />
        <div className="w-full max-w-3xl space-y-4">
          <div className="skeleton h-64 w-full rounded-2xl" />
          <div className="skeleton h-6 w-1/3 rounded-xl" />
          <div className="skeleton h-4 w-full rounded-xl" />
          <div className="skeleton h-28 w-full rounded-2xl" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
