/**
 * Channel-level audit — the campaign SMS / WhatsApp / push copy inherits the
 * same payload bodies as the email (copy() picks bodyAr/bodyEn by locale), so
 * the single-locale leaks must be gone at the source:
 *
 *  1. campaign NAME — the refund and campaign-live builders carry BOTH names
 *     (nameEn/nameAr); the AR body renders nameAr, the EN body nameEn, so an
 *     Arabic SMS/WhatsApp/push never shows the EN campaign name inside Arabic
 *     copy (the campaignName/nameAr fix, locked at the channel level).
 *
 *  2. amount + reason — the refund body carries the amount (rounded the same
 *     way the email card formats it) and the admin-typed reason verbatim
 *     (free text by design, like the booking/campaign refund card). Pinned
 *     here so the inbox story matches the email.
 *
 *  3. the campaign-live copy previously inlined in BOTH adapters now rides the
 *     shared campaignActiveNotification builder — the same single-source
 *     pattern as campaignRefundNotification — so demo and real mode can never
 *     drift.
 */
import { describe, it, expect } from "vitest";
import { campaignActiveNotification, campaignRefundNotification } from "@/lib/data/campaign-notifications";
import { renderSmsText, renderWhatsAppText, renderPushPayload } from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";

const CAMPAIGN = { nameEn: "Beirut Whish A", nameAr: "بيروت ويش أ" };
const PAYMENT = { amount: 50000, currency: "USD" as const, refundReason: "Campaign violated ad policy" };

function asChannelPayload(msg: ReturnType<typeof campaignRefundNotification | typeof campaignActiveNotification>): ChannelPayload {
  return {
    id: `n-${msg.type}-1`,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:27:20.083Z",
  };
}

describe("campaign refund — SMS/WhatsApp/push locale correctness", () => {
  it("AR refund SMS shows the Arabic campaign name + amount + reason, never the EN name", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const text = renderSmsText(asChannelPayload(msg), "ar");

    expect(text).toContain("بيروت ويش أ");
    expect(text).not.toContain("Beirut Whish A");
    expect(text).toContain("500 USD"); // amount, rounded like the email card
    expect(text).toContain("Campaign violated ad policy"); // reason rides verbatim
  });

  it("EN refund SMS keeps the EN campaign name", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const text = renderSmsText(asChannelPayload(msg), "en");

    expect(text).toContain("Beirut Whish A");
    expect(text).not.toContain("بيروت ويش أ");
  });

  it("AR refund WhatsApp message shows the Arabic name; the EN payload carries the EN name", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const ar = renderWhatsAppText(asChannelPayload(msg), "ar");
    const en = renderWhatsAppText(asChannelPayload(msg), "en");

    expect(ar).toContain("بيروت ويش أ");
    expect(ar).not.toContain("Beirut Whish A");
    expect(en).toContain("Beirut Whish A");
    expect(en).not.toContain("بيروت ويش أ");
  });

  it("AR refund push shows the Arabic campaign name", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const push = renderPushPayload(asChannelPayload(msg), "ar");

    expect(push).toContain("بيروت ويش أ");
    expect(push).not.toContain("Beirut Whish A");
  });

  it("the payload carries BOTH names — the EN and AR bodies differ in the campaign name", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    expect(msg.bodyEn).toContain("Beirut Whish A");
    expect(msg.bodyAr).toContain("بيروت ويش أ");
    expect(msg.campaignRefund.campaignName).toBe("Beirut Whish A");
    expect(msg.campaignRefund.campaignNameAr).toBe("بيروت ويش أ");
  });
});

describe("campaign live (active) — SMS/WhatsApp locale correctness", () => {
  it("AR active SMS shows the Arabic campaign name, never the EN one", () => {
    const msg = campaignActiveNotification(CAMPAIGN);
    const text = renderSmsText(asChannelPayload(msg), "ar");

    expect(text).toContain("بيروت ويش أ");
    expect(text).not.toContain("Beirut Whish A");
  });

  it("EN active WhatsApp message keeps the EN campaign name", () => {
    const msg = campaignActiveNotification(CAMPAIGN);
    const text = renderWhatsAppText(asChannelPayload(msg), "en");

    expect(text).toContain("Beirut Whish A");
    expect(text).not.toContain("بيروت ويش أ");
  });
});
