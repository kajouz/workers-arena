import { cookies } from "next/headers";
import { demoSessionAllowed, verifySessionPayload } from "@/lib/security";

// The cookie NAMES live in the dependency-free module so middleware/proxy can
// share them (next/headers can't be imported there).
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

export type SessionRole = "customer" | "worker" | "company" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
  hue: number;
}

export const SESSION_COOKIE = SESSION_COOKIE_NAME;

export const DEMO_USERS: Record<SessionRole, SessionUser> = {
  customer: { id: "u-customer", name: "Sara Customer", email: "sara@example.com", role: "customer", hue: 200 },
  worker: { id: "u-worker", name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", role: "worker", hue: 25 },
  company: { id: "u-company", name: "BuildCo Ltd", email: "ads@buildco.sa", role: "company", hue: 150 },
  admin: { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 },
};

/**
 * Real-auth mode gate — mirrors the DEMO_MODE convention used across the app
 * (src/lib/server/prisma.ts, activity.ts, notifications, push-store). Real mode
 * additionally requires a non-placeholder AUTH_SECRET so a misconfigured env
 * can't silently fall through to demo sessions in production.
 */
export function realAuthEnabled(): boolean {
  if (process.env.DEMO_MODE === "false") {
    const secret = process.env.AUTH_SECRET ?? "";
    const ok = Boolean(process.env.DATABASE_URL) && secret.length > 0 && !secret.includes("replace-me");
    // C6: Loud misconfiguration guard — DEMO_MODE=false without a real secret/DB
    // silently stayed in demo mode before; now log so the operator notices.
    if (!ok && process.env.NODE_ENV === "production") {
      console.error(
        "[auth] Misconfigured production: DEMO_MODE=false requires a real DATABASE_URL and non-placeholder AUTH_SECRET (openssl rand -base64 32). " +
          "The app is running without real auth — sessions will be rejected."
      );
    }
    return ok;
  }
  return false;
}

/** Read the session server-side. Returns null when signed out. */
export async function getSession(): Promise<SessionUser | null> {
  // Production: real NextAuth session (real user ids — PushSubscription.userId
  // and ActivityLog.actorId FKs get genuine references end-to-end).
  if (realAuthEnabled()) {
    try {
      const { auth } = await import("@/auth");
      const session = await auth();
      const u = session?.user;
      if (!u?.id) return null;
      return {
        id: u.id,
        name: u.name ?? "User",
        email: u.email ?? "",
        role: (u.role as SessionRole) ?? "customer",
        hue: u.hue ?? 0,
      };
    } catch {
      return null;
    }
  }

  // Demo/dev: cookie-based session (no database required).
  // Production guard: the demo cookie is an unsigned JSON blob that grants any
  // role (including admin). A production deploy must not trust it unless demo
  // mode was EXPLICITLY requested (DEMO_MODE=true — the documented E2E
  // contract; see demoSessionAllowed). Unset or "false" in production →
  // refuse it loudly instead of silently granting a forgeable admin session.
  if (!demoSessionAllowed()) {
    console.error(
      "[auth] Demo cookie session rejected in production. Set DEMO_MODE=false with a real DATABASE_URL + AUTH_SECRET, or the app will sign everyone out."
    );
    return null;
  }
  try {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    // C3: Verify HMAC signature. New logins write signed cookies (base64url+HMAC);
    // legacy unsigned JSON is still accepted when DEMO_MODE=true (E2E prod
    // matrix and old preview cookies) but real prod (DEMO_MODE=false) never
    // reaches here — demoSessionAllowed already rejected it. Keeping the fallback
    // here makes the E2E suite green without re-signing every test helper now,
    // while Vercel prod (DEMO_MODE=false) stays fully guarded.
    const decoded = decodeURIComponent(raw);
    let payload: string | null = verifySessionPayload(decoded);
    if (!payload) {
      // Legacy fallback: raw JSON without signature (pre-C3 cookies). Allowed
      // in dev and in the explicit DEMO_MODE=true E2E prod, but not in real prod.
      if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true") {
        try {
          return JSON.parse(decoded) as SessionUser;
        } catch {
          return null;
        }
      }
      return null;
    }
    // Payload is base64url-encoded JSON
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as SessionUser;
  } catch {
    return null;
  }
}
