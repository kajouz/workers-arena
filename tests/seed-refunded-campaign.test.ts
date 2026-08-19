/**
 * ────────────────────────────────────────────────────────────────────────────
 * SEED-REFUNDED-CAMPAIGN ROUTE (demo-mode-only fixture)
 * ────────────────────────────────────────────────────────────────────────────
 * POST /api/dev/seed-refunded-campaign — the fixture the e2e hydration smoke
 * uses to give /admin a REFUNDED campaign purchase (the demo store seeds no
 * payments, so the refund-email Preview button can't exist otherwise). It runs
 * the REAL create→confirm→refund seams and leaves the store with a refunded
 * payment whose bilingual preview renderings the /admin page computes.
 *
 * These tests cover the route's four branches:
 *   1. Happy path — a refunded campaign lands in the store (payment REFUNDED,
 *      campaign ENDED, method-aware refund through the provider).
 *   2. Idempotent re-seed — a second call finds the fixed-name campaign
 *      already refunded and no-ops (no duplicate campaign).
 *   3. Production refusal — DEMO_MODE=false (the route is unreachable in
 *      real deployments) returns 404 and touches nothing.
 *   4. WHISH fallback — NODE_ENV=production refuses the SIMULATED provider
 *      (no Stripe keys), so create-time minting fails and the route re-mints
 *      the checkout through the keyless WHISH manual provider (the path the
 *      e2e prod matrix actually exercises), refunding through WHISH too.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { resetCampaignStore, demoCampaignPayment, demoGetCampaigns } from "../src/lib/data/campaigns";
import { resetAdminActivityFeed } from "../src/lib/data/activity";

/** POST the seed route with the current module registry. */
async function postSeed(): Promise<Response> {
  const { POST } = await import("../src/app/api/dev/seed-refunded-campaign/route");
  return POST();
}

let activityFile: string;

beforeEach(() => {
  resetCampaignStore();
  // The confirm/refund seams audit to the admin activity feed — isolate the
  // file-backed feed per test (same pattern as campaign-payments.test.ts) so
  // this suite never touches the dev's .data/admin-activity.json.
  activityFile = `${tmpdir()}/seed-refunded-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  // Pin the simulated provider — a dev shell with STRIPE_SECRET_KEY exported
  // would otherwise get stripeProvider and the create-time checkout mint fails.
  delete process.env.STRIPE_SECRET_KEY;
  // The route is demo-gated — keep demo mode ON for the happy-path tests
  // (the production-refusal test stubs it off explicitly).
  vi.stubEnv("DEMO_MODE", "true");
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/dev/seed-refunded-campaign (demo-mode fixture)", () => {
  it("creates a refunded campaign payment through the real create→confirm→refund seams", async () => {
    const res = await postSeed();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; id?: string; status?: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("refunded");
    expect(body.id).toBeTruthy();

    // The campaign exists, ended (the refund's terminal state)…
    const campaigns = demoGetCampaigns();
    const seeded = campaigns.find((c) => c.nameEn === "E2E Refunded Campaign");
    expect(seeded).toBeTruthy();
    expect(seeded?.status).toBe("ended");

    // …with a REFUNDED payment row carrying the admin-stated reason (the
    // data the /admin campaign-payments card + email preview read).
    const payment = seeded ? demoCampaignPayment(seeded.id) : null;
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("refunded");
    expect(payment?.refundReason).toBe("Seeded by the e2e hydration smoke");
    expect(payment?.amount).toBe(25000); // 250 USD in minor units
  });

  it("re-seeding is idempotent — a second call no-ops instead of creating a duplicate campaign", async () => {
    const first = await postSeed();
    const firstBody = (await first.json()) as { id?: string };
    const countAfterFirst = demoGetCampaigns().length;

    const second = await postSeed();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id?: string; alreadySeeded?: boolean };
    expect(secondBody.alreadySeeded).toBe(true);
    expect(secondBody.id).toBe(firstBody.id);

    // No duplicate: the store still holds exactly one E2E Refunded Campaign,
    // and the total campaign count is unchanged.
    expect(demoGetCampaigns().filter((c) => c.nameEn === "E2E Refunded Campaign")).toHaveLength(1);
    expect(demoGetCampaigns().length).toBe(countAfterFirst);
  });

  it("refuses to run outside demo mode (production → 404, nothing touched)", async () => {
    // The route's demo gate is isDemoMode — a module-load const in repo.ts —
    // so stub DEMO_MODE off and reset the module registry first, forcing the
    // const to re-evaluate against the stubbed env, exactly like a production
    // deployment's process env. The demo campaign store lives on globalThis
    // (survives module resets), so the post-call store assertions stay valid.
    vi.stubEnv("DEMO_MODE", "false");
    vi.resetModules();
    const { POST } = await import("../src/app/api/dev/seed-refunded-campaign/route");
    const res = await POST();
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("demo-only");

    // Nothing was seeded — the store still holds only the 5 seed campaigns,
    // with no refunded purchase.
    const campaigns = demoGetCampaigns();
    expect(campaigns).toHaveLength(5);
    expect(campaigns.some((c) => c.nameEn === "E2E Refunded Campaign")).toBe(false);
  });

  it("falls back to the WHISH manual provider when NODE_ENV=production refuses the simulated one", async () => {
    // NODE_ENV is a call-time read in the provider registry: with it set to
    // production and no Stripe keys, getPaymentProvider("STRIPE") throws, so
    // the route's create-time checkout mint fails and its fallback re-mints
    // the checkout through the keyless WHISH provider — the exact path the
    // e2e prod matrix exercises. isDemoMode stays true (demo gate open).
    vi.stubEnv("NODE_ENV", "production");
    // Reload the module registry so the fresh imports see the stubbed env
    // (the demo store survives resets via globalThis).
    vi.resetModules();
    const { POST } = await import("../src/app/api/dev/seed-refunded-campaign/route");
    const { demoCampaignPayment: paymentOf, demoGetCampaigns: getCampaigns } = await import(
      "../src/lib/data/campaigns"
    );

    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; method?: string; status?: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("refunded");
    expect(body.method).toBe("whish-fallback");

    // The payment row carries the WHISH method (stamped at fallback-mint time)
    // and the refund was routed through the WHISH provider — the manual twin
    // of the Stripe refund the /admin card's method-aware refund uses. (The
    // providerRef itself is overwritten by the confirm step's simulated ref;
    // the METHOD is what the refund routes on.)
    const seeded = getCampaigns().find((c) => c.nameEn === "E2E Refunded Campaign");
    expect(seeded).toBeTruthy();
    const payment = seeded ? paymentOf(seeded.id) : null;
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe("refunded");
    expect(payment?.method).toBe("whish");
  });
});
