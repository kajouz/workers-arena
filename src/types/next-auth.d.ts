import type { DefaultSession } from "next-auth";
import type { SessionRole } from "@/lib/auth-demo";

/**
 * Augment Auth.js session types so `session.user.id / role / hue` typecheck
 * (they are stamped in src/auth.ts callbacks).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: SessionRole;
      hue: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    hue?: number;
  }
}

export {};
