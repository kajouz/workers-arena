import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import {
  decideVerification,
  getVerificationLogs,
  getVerificationQueue,
  submitVerificationRequest,
} from "../src/lib/data/repo";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { workerBySlug } from "../src/lib/data/workers";

describe("verification audit trail", () => {
  let activityFile: string;

  beforeEach(() => {
    // decideVerification also logs to the live admin activity feed — isolate it
    // so the test run doesn't pollute the real .data feed.
    activityFile = path.join(tmpdir(), `verify-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });
  it("seeds a non-empty history with newest-first ordering", async () => {
    const logs = await getVerificationLogs();
    expect(logs.length).toBeGreaterThan(0);
    const times = logs.map((l) => l.time);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("logs an approve with the acting admin, worker and timestamp", async () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;
    const before = (await getVerificationLogs()).length;

    const updated = await decideVerification(w.slug, true, "Platform Admin");

    expect(updated?.verification).toBe("verified");
    expect(updated?.verified).toBe(true);

    const after = await getVerificationLogs();
    expect(after.length).toBe(before + 1);
    const entry = after[0];
    expect(entry.workerSlug).toBe(w.slug);
    expect(entry.action).toBe("approved");
    expect(entry.adminName).toBe("Platform Admin");
    expect(Number.isNaN(Date.parse(entry.time))).toBe(false);
  });

  it("threads the admin's real user id into the audit trail when provided", async () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;

    const updated = await decideVerification(w.slug, true, "Platform Admin", "cuid-admin-42");
    expect(updated?.verified).toBe(true);

    const log = (await getVerificationLogs())[0];
    expect(log.adminName).toBe("Platform Admin");
    expect(log.adminId).toBe("cuid-admin-42");

    // The activity feed entry carries the same id in its actorId field.
    const feed = await getAdminActivityFeed();
    expect(feed[0]!.code).toBe("WORKER_VERIFIED");
    expect(feed[0]!.actor).toBe("Platform Admin");
    expect(feed[0]!.actorId).toBe("cuid-admin-42");
  });

  it("logs the worker's submit separately — VERIFICATION_REQUEST_SUBMITTED with no actorId", async () => {
    const w = workerBySlug("khaled-al-harbi-plumbing")!;

    // Force a known starting state, then submit.
    const updated = await submitVerificationRequest(w.slug);
    expect(updated?.verification).toBe("pending");
    expect(updated?.verified).toBe(false);

    // The activity feed gets the worker-side entry: distinct code, worker as
    // display actor, and NO actorId (this is not an admin action).
    const feed = await getAdminActivityFeed();
    expect(feed[0]!.code).toBe("VERIFICATION_REQUEST_SUBMITTED");
    expect(feed[0]!.type).toBe("verification");
    expect(feed[0]!.actor).toBe(w.nameEn);
    expect(feed[0]!.actorId).toBeUndefined();

    // The decision-side entry (admin, with FK) is separate and distinct.
    await decideVerification(w.slug, true, "Platform Admin", "cuid-admin-42");
    const after = await getAdminActivityFeed();
    const decision = after.find((e) => e.code === "WORKER_VERIFIED");
    const submitted = after.find((e) => e.code === "VERIFICATION_REQUEST_SUBMITTED");
    expect(decision?.actorId).toBe("cuid-admin-42");
    expect(submitted?.actorId).toBeUndefined();
    // Both sides of the workflow appear in the same feed.
    expect(after.some((e) => e.code === "WORKER_VERIFIED")).toBe(true);
    expect(after.some((e) => e.code === "VERIFICATION_REQUEST_SUBMITTED")).toBe(true);
  });

  it("logs a reject and removes the worker from the queue", async () => {
    const w = workerBySlug("tariq-al-shammari-roofing")!;
    const queueBefore = await getVerificationQueue();
    const wasPending = queueBefore.some((x) => x.slug === w.slug);

    const updated = await decideVerification(w.slug, false, "Platform Admin");

    expect(updated?.verification).toBe("rejected");
    expect(updated?.verified).toBe(false);

    const after = await getVerificationLogs();
    expect(after[0].workerSlug).toBe(w.slug);
    expect(after[0].action).toBe("rejected");
    expect(after[0].adminName).toBe("Platform Admin");

    // After a decision the worker can no longer be pending (queued).
    const queueAfter = await getVerificationQueue();
    expect(queueAfter.some((x) => x.slug === w.slug)).toBe(false);
    expect(wasPending).toBe(true);
  });
});
