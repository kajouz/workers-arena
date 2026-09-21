import { getSession } from "@/lib/auth-demo";
import { Header } from "@/components/layout/header";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE APP SURFACE — per-user, server-rendered
 * ────────────────────────────────────────────────────────────────────────────
 * Dashboards, admin, the advertiser console, bookings, favorites,
 * notifications. Every page here already renders per-user data, so reading the
 * session costs nothing extra — these routes could never have been cached.
 *
 * The header therefore gets the role from the server and renders its final
 * state in the first paint: no placeholder, no request, no flash. That is the
 * half of the split worth having — the surface where people are signed in is
 * exactly the surface where the server knows it.
 *
 * Access control is NOT here. Each segment guards itself (see
 * (app)/admin/layout.tsx, (app)/dashboard/layout.tsx, (app)/company/layout.tsx)
 * because the rules differ: /dashboard/onboarding accepts any signed-in user
 * while /admin does not, and several of these pages are legitimately reachable
 * by a guest with a booking link.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <>
      {/* `null` — not omitted — tells the header the server checked and nobody
          is signed in, so it renders the signed-out state immediately instead
          of asking /api/session. */}
      <Header session={session?.role ?? null} />
      <main id="main-content" tabIndex={-1} className="focus:outline-none pb-20 lg:pb-0">
        {children}
      </main>
    </>
  );
}
