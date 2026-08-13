/**
 * ────────────────────────────────────────────────────────────────────────────
 * AUTH.JS (NEXT-AUTH v5) — PRODUCTION INTEGRATION
 * ────────────────────────────────────────────────────────────────────────────
 * Real authentication entry point. `getSession()` in src/lib/auth-demo.ts
 * delegates here whenever the app runs in real mode (DEMO_MODE=false +
 * DATABASE_URL + a real AUTH_SECRET). The session callbacks produce the same
 * SessionUser shape the UI already consumes ({ id, name, email, role, hue }),
 * so no component changes are needed.
 *
 * Providers:
 *   • Credentials — email + password against prisma.user (passwordHash via
 *     PBKDF2-style verifyPassword). This is the primary path for the Workers
 *     Directory (workers/companies register with email/password).
 *   • Google — OAuth. Only mounted when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
 *     are present in the environment, so a missing key can't crash the app.
 *
 * Requires (see .env / .env.example):
 *   AUTH_SECRET, AUTH_URL, AUTH_TRUST_HOST, DATABASE_URL.
 * The Account/Session tables are in prisma/schema.prisma (already migrated).
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getPrisma } from "@/lib/server/prisma";
import { verifyPassword } from "@/lib/security";
import type { SessionRole } from "@/lib/auth-demo";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email & Password",
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "").toLowerCase().trim();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash || !user.isActive) return null;
      if (!verifyPassword(password, user.passwordHash)) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        // Prisma Role enum (CUSTOMER/WORKER/COMPANY/ADMIN) → SessionRole.
        role: user.role.toLowerCase(),
        hue: user.hue,
        image: user.image,
      };
    },
  }),
];

// Google is optional: mount only when keys are configured.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    // Persist role + hue onto the JWT on sign-in (user is only present then).
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? token.role;
        token.hue = (user as { hue?: number }).hue ?? token.hue;
      }
      return token;
    },
    // Shape session.user into the app's SessionUser contract.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = ((token.role as SessionRole) ?? "customer") as SessionRole;
        session.user.hue = (token.hue as number) ?? 0;
      }
      return session;
    },
  },
});
