// @vitest-environment jsdom
/**
 * The campaignRefundNotification payload — single source of truth — carries
 * the refunded AMOUNT + the admin-stated REASON into all three surfaces the
 * admin refund flow touches:
 *   1. the BELL            — the header dropdown renders the inbox item's
 *                            title/body fields (amount + reason ride the body),
 *   2. the EMAIL PREVIEW   — the /admin campaign-payments card computes
 *                            renderCampaignRefundEmail from this builder,
 *   3. the DISPATCHED EMAIL — the email channel's send() routes the same
 *                            payload through renderForChannel (the copy the
 *                            company actually receives).
 * One payload, asserted on all three — the never-drift contract that lets the
 * /admin preview show exactly what the company got (docs/PAYMENTS.md).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NotificationBell } from "@/components/layout/notification-bell";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { campaignRefundNotification } from "@/lib/data/campaign-notifications";
import { renderCampaignRefundEmail } from "@/lib/notifications/templates";
import { createEmailChannel } from "@/lib/notifications/providers/email";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Notification } from "@/lib/data/types";

// The bell calls the server actions on click; stub them (real server-action
// modules pull server-only deps into the jsdom bundle).
const { markReadActionMock, markAllReadActionMock } = vi.hoisted(() => ({
  markReadActionMock: vi.fn(),
  markAllReadActionMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  markReadAction: markReadActionMock,
  markAllReadAction: markAllReadActionMock,
}));

const CAMPAIGN = { nameEn: "Beirut Whish A", nameAr: "بيروت ويش أ" };
const PAYMENT = { amount: 50000, currency: "USD", refundReason: "Campaign violated ad policy" };

/** The builder payload as a fully materialized ChannelPayload (what the
 * adapters dispatch — the API route / email provider both use this shape). */
function asChannelPayload(
  msg: ReturnType<typeof campaignRefundNotification>,
  id = "n-refund-1"
): ChannelPayload {
  return {
    id,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:27:20.083Z",
    campaignRefund: msg.campaignRefund,
  };
}

beforeEach(() => {
  markReadActionMock.mockReset();
  markAllReadActionMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("campaignRefundNotification — amount + reason reach all three surfaces", () => {
  it("bell — the header dropdown renders the refunded amount and reason", async () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const { campaignRefund: _ctx, ...rest } = msg;
    const item: Notification = {
      ...rest,
      id: "n-refund-1",
      time: "2026-08-17T07:27:20.083Z",
      read: false,
    };

    // The bell fetches /api/notifications on mount and when the dropdown opens.
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ items: [item], unread: 1 }),
    });

    render(
      <LocaleProvider locale="ar" dir="rtl">
        <NotificationBell />
      </LocaleProvider>
    );

    // Open the dropdown (refetches, then renders the newest items).
    fireEvent.click(screen.getByRole("button", { name: "الإشعارات" }));

    // Amount (500 major units from 50000 minor) + the admin's reason ride the
    // Arabic body the bell renders verbatim.
    await waitFor(() =>
      expect(
        screen.getByText("تم استرداد 500 USD لحملة بيروت ويش أ — Campaign violated ad policy.")
      ).toBeInTheDocument()
    );
    expect(screen.getByText("تم استرداد الحملة")).toBeInTheDocument();
  });

  it("email preview — the /admin refund card renders the amount and reason", () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const email = renderCampaignRefundEmail(asChannelPayload(msg), "en");

    expect(email.subject).toContain("Campaign refunded");
    expect(email.subject).toContain("Beirut Whish A");
    expect(email.html).toContain("Refund details");
    expect(email.html).toContain("Beirut Whish A");
    expect(email.html).toContain("$500"); // 50000 minor → $500 (formatPrice rounds)
    expect(email.html).toContain("Campaign violated ad policy"); // reason row
    expect(email.text).toContain("Refunded: $500");
    expect(email.text).toContain("Reason: Campaign violated ad policy");
  });

  it("dispatched email — the email channel sends the same amount and reason", async () => {
    const msg = campaignRefundNotification(CAMPAIGN, PAYMENT);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // The console channel is the default dev provider — the exact path the
    // dispatcher uses when a refund is confirmed (the "dispatched" copy).
    const channel = createEmailChannel("console");
    const res = await channel.send(asChannelPayload(msg));

    expect(res.ok).toBe(true);
    expect(res.provider).toBe("console");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Campaign refunded");
    expect(output).toContain("Beirut Whish A");
    expect(output).toContain("$500");
    expect(output).toContain("Campaign violated ad policy");
    expect(output).toContain("/company");
  });
});
