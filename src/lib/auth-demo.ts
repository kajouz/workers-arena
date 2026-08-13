import { cookies } from "next/headers";

export type SessionRole = "customer" | "worker" | "company" | "admin";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
  hue: number;
}

export const SESSION_COOKIE = "wa_session";

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
    return Boolean(process.env.DATABASE_URL) && secret.length > 0 && !secret.includes("replace-me");
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
  try {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw)) as SessionUser;
  } catch {
    return null;
  }
}
