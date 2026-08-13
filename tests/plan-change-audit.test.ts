import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { changeWorkerPlan } from "../src/lib/data/repo";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { PLANS } from "../src/lib/data/subscriptions";
import { workerBySlug } from "../src/lib/data/workers";

/**
 * Admin inline plan change audit (docs/ENHANCEMENT-PLAN.md §2.4) — the demo
 * seam logs an ADMIN_PLAN_CHANGED entry to the live admin activity feed (the
 * prisma adapter writes the identical entry; db:smoke covers that side), so
 * tier corrections leave a trail like refunds and verification decisions.
 */
describe("admin plan-change audit trail", () => {
  let activityFile: string;

  beforeEach(() => {
    // changeWorkerPlan logs to the live feed — isolate it so the test run
    // doesn't pollute the real .data feed (same pattern as verifications.test.ts).
    activityFile = path.join(tmpdir(), `plan-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("logs ADMIN_PLAN_CHANGED with admin, worker and from → to plan", async () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;
    const original = w.subscription.plan;
    try {
      const updated = await changeWorkerPlan(w.id, "enterprise", {
        actor: "Platform Admin",
        actorId: "u-admin",
      });
      expect(updated?.subscription.plan).toBe("enterprise");

      const feed = await getAdminActivityFeed();
      expect(feed[0]!.code).toBe("ADMIN_PLAN_CHANGED");
      expect(feed[0]!.type).toBe("worker");
      expect(feed[0]!.actor).toBe("Platform Admin");
      expect(feed[0]!.actorId).toBe("u-admin");
      // Copy carries the worker + from → to plan (localized labels, both locales).
      expect(feed[0]!.actionEn).toContain("Khaled Al-Harbi");
      expect(feed[0]!.actionEn).toContain(`${PLANS[original].labelEn} → ${PLANS.enterprise.labelEn}`);
      expect(feed[0]!.actionAr).toContain("خالد الحربي");
      expect(feed[0]!.actionAr).toContain(`من ${PLANS[original].labelAr} إلى ${PLANS.enterprise.labelAr}`);
    } finally {
      // Restore the shared demo WORKERS entry (process-global) so other tests
      // in the suite still see the seeded plan.
      await changeWorkerPlan(w.id, original, { actor: "Platform Admin" });
    }
  });

  it("defaults the actor to Platform Admin and omits actorId for unauthenticated calls", async () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;
    const original = w.subscription.plan;
    try {
      await changeWorkerPlan(w.id, "professional");
      const feed = await getAdminActivityFeed();
      expect(feed[0]!.code).toBe("ADMIN_PLAN_CHANGED");
      expect(feed[0]!.actor).toBe("Platform Admin");
      expect(feed[0]!.actorId).toBeUndefined();
    } finally {
      await changeWorkerPlan(w.id, original);
    }
  });
});
