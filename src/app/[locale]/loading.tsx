import { LogoMark } from "@/components/shared/logo";

/**
 * Root loading fallback — shown while a route's RSC payload streams in
 * (Next.js Suspense fallback for the segment). Mirrors the app's warm,
 * card-based look so navigations never flash a blank page.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-8 px-4"
    >
      <LogoMark className="animate-pulse" />
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="skeleton h-8 w-3/4 rounded-xl" />
        <div className="skeleton h-4 w-full rounded-xl" />
        <div className="skeleton h-4 w-5/6 rounded-xl" />
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
