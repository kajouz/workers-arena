/**
 * Payment hardening (docs/PAYMENT-COMMS-ACCOUNTING-PLAN.md §1):
 *  - the WhatsApp status webhook is fail-closed in production;
 *  - a worker can only withdraw from their OWN balance;
 *  - the activity-log retention prune never deletes money entries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));
import { ACTING } from "./helpers/acting-session";
import { POST as whatsappWebhook } from "../src/app/api/webhooks/whatsapp/route";
import { requestPayoutAction } from "../src/app/actions/payouts";
import { getAdminActivityFeed, pruneActivityLog, resetAdminActivityFeed } from "../src/lib/data/activity";
import { getWorkerByUserId } from "../src/lib/data/repo";

describe("WhatsApp status webhook — fail-closed", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("refuses every POST in production when the app secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.WHATSAPP_APP_SECRET;
    const res = await whatsappWebhook(new Request("http://x/api/webhooks/whatsapp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("rejects a forged signature when the secret is set", async () => {
    process.env.WHATSAPP_APP_SECRET = "a-very-secret-app-secret";
    const res = await whatsappWebhook(
      new Request("http://x/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("payouts — a worker withdraws only from their own balance", () => {
  it("refuses a payout filed against another worker's id", async () => {
    getSessionMock.mockResolvedValue(ACTING.worker);
    expect(await requestPayoutAction("some-other-worker-id", 10)).toEqual({ ok: false, error: "unauthorized" });
  });

  it("still lets the worker request from their own balance (validation runs next)", async () => {
    getSessionMock.mockResolvedValue(ACTING.worker);
    const own = await getWorkerByUserId(ACTING.worker.id);
    expect(own).toBeTruthy();
    const res = await requestPayoutAction(own!.id, 1_000_000);
    expect(res.error).not.toBe("unauthorized");
  });
});

describe("activity-log retention keeps money entries", () => {
  let activityFile: string;
  beforeEach(() => {
    activityFile = `${tmpdir()}/wa-activity-retain-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
    process.env.ADMIN_ACTIVITY_FILE = activityFile;
  });
  afterEach(async () => {
    await resetAdminActivityFeed();
    delete process.env.ADMIN_ACTIVITY_FILE;
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("prunes old system noise but never an old payment confirmation or refund", async () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    await writeFile(
      activityFile,
      JSON.stringify([
        { id: "noise", actionEn: "push pruned", actionAr: "x", actor: "System", time: old, type: "system", code: "PUSH_SUBSCRIPTION_PRUNED" },
        { id: "money-1", actionEn: "confirmed", actionAr: "x", actor: "Admin", time: old, type: "payment", code: "PURCHASE_CONFIRMED" },
        { id: "money-2", actionEn: "refund sent", actionAr: "x", actor: "Admin", time: old, type: "payment", code: "REFUND_SENT" },
      ]),
      "utf8"
    );
    const result = await pruneActivityLog(90);
    expect(result.removed).toBe(1);
    expect((await getAdminActivityFeed()).map((e) => e.id).sort()).toEqual(["money-1", "money-2"]);
  });
});
