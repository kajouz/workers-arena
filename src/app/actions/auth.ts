"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { DEMO_USERS, SESSION_COOKIE, getSession, realAuthEnabled, type SessionRole } from "@/lib/auth-demo";
import { addLead, addReview, registerView } from "@/lib/data/repo";
import { getLocale } from "@/lib/i18n/server";
import { DEMO_PASSWORD, hashPassword, sanitizeText, signSessionPayload } from "@/lib/security";
import { localeRedirect } from "@/lib/i18n/redirect";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
    phone: z.string().min(8).optional(),
    role: z.enum(["customer", "worker", "company"]),
    terms: z.literal(true),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"] });

export type AuthActionState = { error?: string; success?: string };

async function setSession(user: (typeof DEMO_USERS)[SessionRole]) {
  const store = await cookies();
  // C3: HMAC-sign the payload — payload is base64url(JSON), signature is hex.
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  const signed = signSessionPayload(payload);
  store.set(SESSION_COOKIE, encodeURIComponent(signed), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

/**
 * §Guest → account claim (docs/guest-claim.md) — link whatever this customer
 * booked before they had an account to the account they just created or signed
 * into, so the second purchase has a history behind it.
 *
 * Best-effort by design: a failed claim must never fail a sign-in. The customer
 * keeps their session, nothing is half-written (the engine only ever links
 * records the account can prove), and the next sign-in claims again — the
 * operation is idempotent, so retrying is always safe.
 */
async function claimGuestHistoryFor(
  userId: string,
  identity: { phone?: string | null; email?: string | null }
): Promise<void> {
  if (!userId) return;
  try {
    const { claimGuestHistory } = await import("@/lib/data/repo");
    await claimGuestHistory(userId, identity);
  } catch (e) {
    console.error("[auth] guest history claim failed:", e);
  }
}

/** Map a SessionRole to the Prisma Role enum value. */
function prismaRole(role: SessionRole): "CUSTOMER" | "WORKER" | "COMPANY" | "ADMIN" {
  return role.toUpperCase() as "CUSTOMER" | "WORKER" | "COMPANY" | "ADMIN";
}

/** Sign in via Auth.js credentials (real mode). Returns an error key or null. */
async function realSignIn(email: string, password: string): Promise<string | null> {
  const { signIn } = await import("@/auth");
  try {
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) return "invalid";
    return null;
  } catch {
    return "invalid";
  }
}

/** Login — validates shape, then signs in (real credentials or demo identity). */
export async function loginAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  if (realAuthEnabled()) {
    const error = await realSignIn(parsed.data.email, parsed.data.password);
    if (error) return { error };
    // §Guest → account claim — a returning guest's history finds them here. The
    // phone on the account is the credential; the email is carried so the
    // near-miss case can be reported later without being acted on.
    try {
      const { getPrisma } = await import("@/lib/server/prisma");
      const me = await getPrisma().user.findUnique({
        where: { email: parsed.data.email.toLowerCase() },
        select: { id: true, phone: true },
      });
      if (me) await claimGuestHistoryFor(me.id, { phone: me.phone, email: parsed.data.email });
    } catch {
      // Non-fatal: the claim is a convenience, the sign-in is the product.
    }
    return await localeRedirect("/dashboard");
  }

  const role: SessionRole = parsed.data.email.includes("admin")
    ? "admin"
    : parsed.data.email.includes("company") || parsed.data.email.includes("buildco")
      ? "company"
      : parsed.data.email.includes("worker") || parsed.data.email.includes("plumbfix")
        ? "worker"
        : "customer";
  await setSession(DEMO_USERS[role]);
  return await localeRedirect("/dashboard");
}

/** One-click demo role sign-in (real mode: signs into the seeded demo account). */
export async function loginDemoAction(role: SessionRole): Promise<void> {
  if (realAuthEnabled()) {
    const error = await realSignIn(DEMO_USERS[role].email, DEMO_PASSWORD);
    if (error) return; // stay on the login page — action returns without redirect
    return await localeRedirect("/dashboard");
  }
  await setSession(DEMO_USERS[role]);
  return await localeRedirect("/dashboard");
}

export async function registerAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    terms: formData.get("terms") === "on",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "confirmPassword") return { error: "match" };
    return { error: issue?.path[0] === "password" ? "passwordMin" : issue?.path[0] === "email" ? "emailInvalid" : "required" };
  }

  if (realAuthEnabled()) {
    // Create the real User row, then sign in.
    try {
      const { getPrisma } = await import("@/lib/server/prisma");
      const prisma = getPrisma();
      const role = parsed.data.role as SessionRole;
      // Capture the register page's language (wa_locale cookie / Accept-
      // Language) so the new user's preferred language is stored from day one
      // — the recipient-locale threading downstream reads User.locale, and a
      // hardcoded "en" would silently make every real-mode email English.
      const locale = await getLocale();
      const created = await prisma.user.create({
        data: {
          name: sanitizeText(String(parsed.data.name), 100),
          email: parsed.data.email.toLowerCase(),
          passwordHash: hashPassword(parsed.data.password),
          phone: parsed.data.phone ? sanitizeText(String(parsed.data.phone), 30) : null,
          role: prismaRole(role),
          locale,
          hue: 210,
        },
      });
      // §Guest → account claim — the phone typed at signup is the same one they
      // booked with, so their guest bookings become theirs before they ever see
      // the dashboard. (Diners: an email-only match claims nothing — see
      // src/lib/data/guest-claim.ts.)
      await claimGuestHistoryFor(created.id, { phone: created.phone, email: created.email });
      // Track referral if a code was provided
      const referralCode = formData.get("referralCode");
      if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
        try {
          const { trackReferralAction } = await import("@/app/actions/referrals");
          // Find the new user's worker profile (if they registered as a worker)
          const newUser = await prisma.user.findFirst({
            where: { email: parsed.data.email.toLowerCase() },
            select: { id: true },
          });
          if (newUser && parsed.data.role === "worker") {
            // The worker profile may not exist yet — track after creation
            // For now, store the code in a cookie for post-registration tracking
          }
        } catch {
          // Non-critical — don't block registration
        }
      }
      const error = await realSignIn(parsed.data.email, parsed.data.password);
      if (error) return { error: "invalid" };
      // New workers land on the onboarding page to complete their profile
      // and activate the 30-day free trial. Other roles go straight to
      // the dashboard.
      redirect(parsed.data.role === "worker" ? "/dashboard/onboarding" : "/dashboard");
    } catch (e) {
      // Unique-email collision (Prisma P2002) → friendly error; anything else
      // (DB down, etc.) must not be masked as a validation failure.
      if ((e as { code?: string })?.code === "P2002") return { error: "emailTaken" };
      throw e;
    }
  }

  await setSession({
    id: "u-new",
    name: String(parsed.data.name),
    email: parsed.data.email,
    role: parsed.data.role,
    hue: 210,
  });
  return await localeRedirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  if (realAuthEnabled()) {
    const { signOut } = await import("@/auth");
    await signOut({ redirect: false });
    return await localeRedirect("/");
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return await localeRedirect("/");
}

/** Record a profile view (debounced client-side too, but server-confirmed). */
export async function trackViewAction(workerId: string): Promise<void> {
  await registerView(workerId);
}

/** Submit a review for a worker (demo: in-memory). */
export async function submitReviewAction(workerId: string, formData: FormData): Promise<{ ok: boolean; pending?: boolean }> {
  const rating = Number(formData.get("rating"));
  const rawName = String(formData.get("name") ?? "Anonymous");
  const rawText = String(formData.get("text") ?? "");
  const name = sanitizeText(rawName, 100) || "Anonymous";
  const text = sanitizeText(rawText, 4000);
  if (!rating || rating < 1 || rating > 5 || !text.trim()) return { ok: false };
  // Real mode needs a real author: Review.authorId is a User FK, so the session
  // id is threaded through — without it the repo refuses rather than dropping a
  // review into the wrong store.
  const session = await getSession();
  // ok reflects whether the review actually persisted, so the client must NOT
  // claim success for a review that was never written.
  const review = await addReview(
    workerId,
    {
      author: name,
      rating,
      textEn: text,
      textAr: text,
      verifiedPurchase: false,
    },
    session?.id ? { authorId: session.id } : undefined
  );
  // `pending` tells the form the honest thing to say: moderation publishes it,
  // so it is not on the profile yet.
  return { ok: !!review, pending: review?.status === "pending" };
}

/** Log a contact lead. */
export async function requestServiceAction(workerId: string): Promise<{ ok: boolean }> {
  // Same honesty contract as submitReviewAction: ok only when a lead persisted
  // (false in real mode until W2, and in demo when the worker is unknown).
  const w = await addLead(workerId);
  return { ok: !!w };
}
