import { LogoMark } from "@/components/shared/logo";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading categories" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-6">
        <LogoMark className="animate-pulse" />
        <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
