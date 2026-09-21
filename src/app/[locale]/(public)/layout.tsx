import { Header } from "@/components/layout/header";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE PUBLIC SURFACE — prerendered
 * ────────────────────────────────────────────────────────────────────────────
 * Home, search, categories, city and trade landing pages, worker profiles, the
 * static content pages. These are the catalogue: what organic search lands on,
 * and what a first-time visitor sees. Every one of them renders the same HTML
 * for everyone, so they are built ahead of time and served from the edge.
 *
 * That is only possible because nothing in this subtree reads a cookie. The
 * header is the one thing that wanted to — it switches between "Sign in" and
 * the account menu — so it is mounted here WITHOUT a session and resolves one
 * itself after hydration (src/hooks/use-session.ts). Until the answer lands it
 * shows a neutral placeholder of the right width, so a signed-in reader never
 * sees a sign-in button and nothing reflows.
 *
 * The cost is one extra request per page load, on a page that came from the
 * edge. The alternative — reading the session server-side — is what kept the
 * entire site dynamic and uncacheable.
 *
 * Adding a page here that reads cookies(), headers() or a session will quietly
 * opt it back into per-request rendering. The prerender assertion in
 * tests/prerender-coverage.test.ts is what catches that.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1} className="focus:outline-none pb-20 lg:pb-0">
        {children}
      </main>
    </>
  );
}
