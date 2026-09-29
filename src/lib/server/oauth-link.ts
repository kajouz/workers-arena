/**
 * OAuth user linking — a Google sign-in resolves to a real `User` row.
 *
 * Without this the session id was Google's account id (the JWT `sub`), which
 * matches no `User.id`: every write keyed on the session user (reviews,
 * bookings' customerId, invoices) failed its foreign key, and every read
 * scoped to it found nothing.
 *
 * The email is the join key, so it must be one the provider has verified —
 * otherwise anyone could sign in to an existing account by presenting its
 * address. A deactivated account stays locked out.
 */
import type { PrismaClient } from "@prisma/client";

export interface OAuthProfile {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  /** The provider's own verification flag (Google: `email_verified`). */
  emailVerified: boolean;
}

export interface LinkedUser {
  id: string;
  role: string; // lower-case SessionRole
  hue: number;
}

/** A stable avatar hue from the email, like the seeded accounts carry. */
function hueFor(email: string): number {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * Find or create the `User` for an OAuth profile. Returns null when the
 * sign-in must be refused (no email, unverified email, deactivated account).
 * New accounts are customers; an existing account keeps its role.
 */
export async function linkOAuthUser(
  prisma: Pick<PrismaClient, "user">,
  profile: OAuthProfile
): Promise<LinkedUser | null> {
  const email = profile.email?.toLowerCase().trim();
  if (!email || !profile.emailVerified) return null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isActive) return null;
    await prisma.user
      .update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
      .catch(() => {});
    return { id: existing.id, role: existing.role.toLowerCase(), hue: existing.hue };
  }

  const created = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: profile.name?.trim() || email.split("@")[0]!,
      image: profile.image ?? null,
      emailVerified: new Date(),
      hue: hueFor(email),
      lastLoginAt: new Date(),
    },
  });
  return { id: created.id, role: created.role.toLowerCase(), hue: created.hue };
}
