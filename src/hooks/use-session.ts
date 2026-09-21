"use client";

import { useEffect, useState } from "react";
import type { SessionRole } from "@/lib/auth-demo";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHO IS READING THIS PAGE
 * ────────────────────────────────────────────────────────────────────────────
 * On the app surface (/dashboard, /admin, /company, …) the server already
 * knows, and passes the role down. Those routes are per-user anyway.
 *
 * On the public surface the pages are PRERENDERED — one copy of the HTML for
 * everyone — so the server cannot know. The header resolves it here after
 * hydration.
 *
 * The three-state result is the point. "Signed out" and "not known yet" are
 * different things, and collapsing them is what produces the flash of a
 * "Sign in" button in front of a logged-in reader. Callers render a neutral
 * placeholder while `status === "pending"` and only commit to a state once it
 * is "ready".
 * ────────────────────────────────────────────────────────────────────────────
 */

export type SessionState =
  | { status: "known"; role: SessionRole | null }
  | { status: "pending"; role: null };

/**
 * One request per page load, shared by every caller. The header mounts more
 * than one consumer, and without this each would fire its own fetch.
 * Deliberately module-level: it should outlive individual components but not
 * the document, so a fresh navigation re-reads the session.
 */
let inflight: Promise<SessionRole | null> | null = null;

function fetchRole(): Promise<SessionRole | null> {
  inflight ??= fetch("/api/session", { credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : { role: null }))
    .then((body: { role?: SessionRole | null }) => body.role ?? null)
    .catch(() => null); // offline or blocked — render as signed out
  return inflight;
}

/** Forget the cached answer — after sign-in or sign-out changes it. */
export function invalidateSession(): void {
  inflight = null;
}

/**
 * @param serverKnown The role the server resolved, when it could. Pass
 *   `undefined` to mean "not known — go and ask", which is what a prerendered
 *   route does. `null` means "the server checked: nobody is signed in".
 */
export function useSession(serverKnown?: SessionRole | null): SessionState {
  const serverResolved = serverKnown !== undefined;
  const [role, setRole] = useState<SessionRole | null>(serverKnown ?? null);
  const [status, setStatus] = useState<SessionState["status"]>(
    serverResolved ? "known" : "pending"
  );

  useEffect(() => {
    if (serverResolved) return;
    let alive = true;
    fetchRole().then((resolved) => {
      if (!alive) return;
      setRole(resolved);
      setStatus("known");
    });
    return () => {
      alive = false;
    };
  }, [serverResolved]);

  return status === "known" ? { status: "known", role } : { status: "pending", role: null };
}
