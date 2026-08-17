import { NextResponse } from "next/server";
import { isDemoMode, createCampaign, createCampaignCheckout, confirmCampaignPayment, refundCampaignPayment } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/seed-refunded-campaign — demo-mode-only test fixture.
 *
 * The e2e hydration smoke visits /admin and asserts the campaign-payments
 * card's refund-email preview dialog renders the iframe copy in the page
 * locale. The Preview button only exists on a REFUNDED purchase, and the demo
 * campaign store seeds NO payments — so the smoke needs a deterministic
 * refunded campaign to exist before its matrix runs. This route creates one
 * through the REAL purchase→confirm→refund seams (createCampaign /
 * confirmCampaignPayment / refundCampaignPayment — the same chain the UI and
 * the webhook drive), leaving the store with a refunded payment whose
 * campaignRefunded payload + bilingual renderings the /admin page computes.
 *
 * Checkout provider: the SIMULATED provider is refused under
 * NODE_ENV=production (no Stripe keys), so the seed mints the payment through
 * the WHISH manual provider — keyless, webhook-less (the admin-confirm manual
 * twin of a Stripe charge). The refund routes through the WHISH provider too
 * (method-aware refundCampaignPayment), exercising the manual refund path.
 *
 * Guarded by demo mode: in production this route is unreachable (404). The
 * seeded campaign uses a fixed display name as its stable key — a re-seed
 * (the matrix visits /admin once per server, and dev+prod boot separate
 * in-memory stores) no-ops.
 */
export async function POST() {
  if (!isDemoMode) {
    return NextResponse.json({ error: "demo-only" }, { status: 404 });
  }

  const { demoGetCampaigns, demoCampaignPayment } = await import("@/lib/data/campaigns");

  // Idempotent: the seeded campaign (fixed display name) already refunded → no-op.
  const existing = demoGetCampaigns().find((c) => c.nameEn === "E2E Refunded Campaign");
  const existingPayment = existing ? demoCampaignPayment(existing.id) : null;
  if (existing && existingPayment?.status === "refunded") {
    return NextResponse.json({ ok: true, id: existing.id, alreadySeeded: true });
  }

  // createCampaign mints a PENDING payment + invoice and tries a checkout. The
  // create-time pre-mint can fail (NODE_ENV=production refuses the simulated
  // provider) — the campaign + payment rows still exist, so mint the WHISH
  // checkout on the found row instead (keyless manual provider).
  const created = await createCampaign({
    nameEn: "E2E Refunded Campaign",
    nameAr: "حملة مستردة تجريبية",
    placement: "Homepage · Banner",
    adType: "banner",
    budget: 250,
  });
  let campaignId = created?.campaign?.id ?? "";
  let method = "create-time";
  if (!campaignId) {
    // NODE_ENV=production refuses the simulated provider at create time —
    // fall back to the keyless WHISH manual provider for the checkout.
    const pending = demoGetCampaigns().find((c) => c.nameEn === "E2E Refunded Campaign");
    campaignId = pending?.id ?? "";
    if (campaignId) {
      const whish = await createCampaignCheckout(campaignId, "WHISH");
      if (!whish) {
        return NextResponse.json({ error: "create failed" }, { status: 500 });
      }
      method = "whish-fallback";
    } else {
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }
  }

  const confirmed = await confirmCampaignPayment(campaignId, "sim_seed_refunded");
  if (!confirmed) {
    return NextResponse.json({ error: "confirm failed" }, { status: 500 });
  }

  const payment = await refundCampaignPayment(
    campaignId,
    "Platform Admin",
    "Seeded by the e2e hydration smoke"
  );
  if (!payment) {
    return NextResponse.json({ error: "refund failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: campaignId, status: payment.status, method });
}
