"use server";

import { z } from "zod";
import { sanitizeText } from "@/lib/security";
import { startTrialSubscription } from "@/lib/data/subscriptions";
import { trialDaysForPlan } from "@/lib/data/subscription-plans";
import { localeRedirect } from "@/lib/i18n/redirect";

const onboardSchema = z.object({
  nameEn: z.string().min(1).max(100),
  nameAr: z.string().min(1).max(100),
  categoryId: z.string().min(1),
  cityId: z.string().min(1),
  areaId: z.string().min(1),
  phone: z.string().min(5).max(30),
});

export type OnboardState = { error?: string } | null;

/**
 * Creates a Worker profile + plan-specific trial subscription for a newly registered
 * worker. Called from the /dashboard/onboarding page after registration.
 *
 * The trial is the worker's FIRST plan — once per worker, gated by
 * `renewWorkerSubscriptionBySlug` (repo.ts). This action creates the
 * subscription directly so the worker lands on the dashboard with an active
 * plan from day one.
 */
export async function createWorkerProfileAction(
  _prev: OnboardState,
  formData: FormData
): Promise<OnboardState> {
  const parsed = onboardSchema.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    categoryId: formData.get("categoryId"),
    cityId: formData.get("cityId"),
    areaId: formData.get("areaId"),
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { error: "required" };
  }

  try {
    const { getPrisma } = await import("@/lib/server/prisma");
    const { getSession } = await import("@/lib/auth-demo");
    const prisma = getPrisma();
    const session = await getSession();

    if (!session?.id) return { error: "unauthorized" };

    // Check if this user already has a Worker profile (idempotent).
    const existing = await prisma.worker.findFirst({
      where: { userId: session.id },
    });
    if (existing) return await localeRedirect("/dashboard");

    const { nameEn, nameAr, categoryId, cityId, areaId, phone } = parsed.data;

    // The form sends slugs; the schema needs IDs. Look them up.
    const [cat, city, area] = await Promise.all([
      prisma.category.findUnique({ where: { slug: categoryId }, select: { id: true } }),
      prisma.city.findUnique({ where: { slug: cityId }, select: { id: true } }),
      prisma.area.findFirst({ where: { slug: areaId, city: { slug: cityId } }, select: { id: true } }),
    ]);
    if (!cat || !city || !area) return { error: "required" };

    // Derive a unique slug from the name.
    const baseSlug = nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.worker.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // Create the Worker profile in a transaction with the trial subscription.
    const now = new Date();
    const trial = startTrialSubscription("basic", now, trialDaysForPlan("basic"));

    await prisma.$transaction(async (tx) => {
      await tx.worker.create({
        data: {
          userId: session.id,
          slug,
          nameEn: sanitizeText(nameEn, 100),
          nameAr: sanitizeText(nameAr, 100),
          categoryId: cat.id,
          cityId: city.id,
          areaId: area.id,
          phone: sanitizeText(phone, 30),
          email: session.email,
          verified: false,
          // Defaults for new workers.
          priceMin: 0,
          priceMax: 0,
          yearsExp: 0,
          rating: 0,
          reviewCount: 0,
          viewCount: 0,
          leadCount: 0,
          completion: 0,
        },
      });

      // Create the trial subscription — the worker's first plan is free for
      // the plan-specific trial policy. This row is what the dashboard, search and
      // fee-exempt filter read.
      const createdWorker = await tx.worker.findFirst({ where: { userId: session.id } });
      if (!createdWorker) throw new Error("worker-create-failed");
      const createdSubscription = await tx.subscription.create({
        data: {
          workerId: createdWorker.id,
          plan: "BASIC",
          status: "ACTIVE",
          price: trial.price,
          startedAt: new Date(trial.startedAt),
          expiresAt: new Date(trial.expiresAt),
          currency: "USD",
        },
      });
      // Keep the trial row and its cohort event atomic: a worker can never
      // appear as trial-active without also being counted in retention reports.
      await tx.subscriptionEvent.create({
        data: {
          workerId: createdWorker.id,
          subscriptionId: createdSubscription.id,
          type: "trial_started",
          toPlan: "BASIC",
          periodDays: trial.period === "monthly"
            ? Math.round((new Date(trial.expiresAt).getTime() - new Date(trial.startedAt).getTime()) / 86_400_000)
            : 30,
          amount: 0,
          source: "onboarding",
        },
      });
    });

    return await localeRedirect("/dashboard");
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: "server" };
  }
}
