"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { DEMO_USERS, SESSION_COOKIE, realAuthEnabled, type SessionRole } from "@/lib/auth-demo";
import { addLead, addReview, registerView } from "@/lib/data/repo";
import { DEMO_PASSWORD, hashPassword } from "@/lib/security";

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
  store.set(SESSION_COOKIE, encodeURIComponent(JSON.stringify(user)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
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
    redirect("/dashboard");
  }

  const role: SessionRole = parsed.data.email.includes("admin")
    ? "admin"
    : parsed.data.email.includes("company") || parsed.data.email.includes("buildco")
      ? "company"
      : parsed.data.email.includes("worker") || parsed.data.email.includes("plumbfix")
        ? "worker"
        : "customer";
  await setSession(DEMO_USERS[role]);
  redirect("/dashboard");
}

/** One-click demo role sign-in (real mode: signs into the seeded demo account). */
export async function loginDemoAction(role: SessionRole): Promise<void> {
  if (realAuthEnabled()) {
    const error = await realSignIn(DEMO_USERS[role].email, DEMO_PASSWORD);
    if (error) return; // stay on the login page — action returns without redirect
    redirect("/dashboard");
  }
  await setSession(DEMO_USERS[role]);
  redirect("/dashboard");
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
      await prisma.user.create({
        data: {
          name: String(parsed.data.name),
          email: parsed.data.email.toLowerCase(),
          passwordHash: hashPassword(parsed.data.password),
          phone: parsed.data.phone ?? null,
          role: prismaRole(role),
          locale: "en",
          hue: 210,
        },
      });
      const error = await realSignIn(parsed.data.email, parsed.data.password);
      if (error) return { error: "invalid" };
      redirect("/dashboard");
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
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  if (realAuthEnabled()) {
    const { signOut } = await import("@/auth");
    await signOut({ redirect: false });
    redirect("/");
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}

/** Record a profile view (debounced client-side too, but server-confirmed). */
export async function trackViewAction(workerId: string): Promise<void> {
  await registerView(workerId);
}

/** Submit a review for a worker (demo: in-memory). */
export async function submitReviewAction(workerId: string, formData: FormData): Promise<{ ok: boolean }> {
  const rating = Number(formData.get("rating"));
  const name = String(formData.get("name") ?? "Anonymous");
  const text = String(formData.get("text") ?? "");
  if (!rating || rating < 1 || rating > 5 || !text.trim()) return { ok: false };
  // ok reflects whether the review actually persisted — in real mode the repo
  // no-ops until W2 (docs/ARCHITECTURE.md §10), so the client must NOT claim
  // success for a review that was never written.
  const w = await addReview(workerId, {
    author: name,
    rating,
    textEn: text,
    textAr: text,
    verifiedPurchase: false,
  });
  return { ok: !!w };
}

/** Log a contact lead. */
export async function requestServiceAction(workerId: string): Promise<{ ok: boolean }> {
  // Same honesty contract as submitReviewAction: ok only when a lead persisted
  // (false in real mode until W2, and in demo when the worker is unknown).
  const w = await addLead(workerId);
  return { ok: !!w };
}
