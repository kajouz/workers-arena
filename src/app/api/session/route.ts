import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";

export const dynamic = "force-dynamic";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * GET /api/session — "is someone signed in, and as what?"
 * ────────────────────────────────────────────────────────────────────────────
 * The public pages are prerendered, so their HTML cannot know who is reading
 * it. The header resolves that here instead, after hydration.
 *
 * Deliberately NARROW: it answers only what the header renders — whether there
 * is a session and which role it has, to pick the right dashboard link. No id,
 * no name, no email. The caller already owns this session, so none of those
 * would be a disclosure, but an endpoint that returns the minimum cannot
 * become a profile API by accident.
 *
 * Never cached: `dynamic` stops Next from prerendering it, and src/proxy.ts
 * plus next.config.ts both stamp `no-store` on /api/*.
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json(
    { role: session?.role ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
