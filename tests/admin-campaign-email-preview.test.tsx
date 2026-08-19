// @vitest-environment jsdom
/**
 * §Lebanon — the /admin campaign-payments card's "Preview email" leads with
 * the COMPANY's preferred locale (what they received), not the admin's UI
 * locale. The admin page renders the refund email in BOTH locales from the
 * shared campaignRefundNotification builder (never-drift), and the
 * EmailPreviewDialog picks the recipient's locale as the primary block — so
 * an EN admin previews the AR email an AR-preferring company received (and
 * vice versa). Without a recipient locale it falls back to the admin's UI
 * locale. These tests render the whole AdminDashboard card and assert the
 * iframe content per (page locale, recipient locale) pair.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { campaignRefundNotification } from "@/lib/data/campaign-notifications";
import { renderCampaignRefundEmail } from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";
import { emptyPlatformFeeStats } from "@/lib/data/types";
import type { AnalyticsOverview, Campaign, CampaignPayment } from "@/lib/data/types";
import type { SessionUser } from "@/lib/auth-demo";

// The dashboard subtree calls server actions on click; stub them (real
// server-action modules pull server-only deps into the jsdom bundle).
const {
  decideVerificationActionMock,
  confirmManualPaymentActionMock,
  refundCampaignActionMock,
  changeWorkerPlanActionMock,
  decidePayoutActionMock,
  requestPayoutActionMock,
  exportBookingTrailsActionMock,
} = vi.hoisted(() => ({
  decideVerificationActionMock: vi.fn(),
  confirmManualPaymentActionMock: vi.fn(),
  refundCampaignActionMock: vi.fn(),
  changeWorkerPlanActionMock: vi.fn(),
  decidePayoutActionMock: vi.fn(),
  requestPayoutActionMock: vi.fn(),
  exportBookingTrailsActionMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  decideVerificationAction: decideVerificationActionMock,
  confirmManualPaymentAction: confirmManualPaymentActionMock,
  refundCampaignAction: refundCampaignActionMock,
  changeWorkerPlanAction: changeWorkerPlanActionMock,
}));
vi.mock("@/app/actions/payouts", () => ({
  decidePayoutAction: decidePayoutActionMock,
  requestPayoutAction: requestPayoutActionMock,
}));
vi.mock("@/app/actions/bookings", () => ({
  exportBookingTrailsAction: exportBookingTrailsActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const session: SessionUser = { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 };

const campaign: Campaign = {
  id: "c-6",
  nameEn: "Beirut Whish A",
  nameAr: "بيروت ويش أ",
  placement: "Homepage · Banner",
  adType: "banner",
  status: "ended",
} as Campaign;

const payment: CampaignPayment = {
  id: "pay-c-6",
  campaignId: "c-6",
  amount: 50000,
  currency: "USD",
  status: "refunded",
  paidAt: "2026-08-17T07:20:00.000Z",
  refundedAt: "2026-08-17T07:30:00.000Z",
  refundReason: "Campaign violated ad policy",
} as CampaignPayment;

/** The bilingual previews exactly as src/app/admin/page.tsx computes them —
 * both locales from the ONE shared builder payload. The recipient carries the
 * company's preferred language, which the dialog leads with as the PRIMARY
 * block (what the company received) — the page locale only styles the chrome. */
function makePreviews(recipientLocale?: "en" | "ar") {
  const msg = campaignRefundNotification(
    { nameEn: campaign.nameEn, nameAr: campaign.nameAr },
    { amount: payment.amount, currency: payment.currency, refundReason: payment.refundReason }
  );
  const recipient = { name: "BuildCo Ltd", email: "ads@buildco.sa", locale: recipientLocale };
  const payload: ChannelPayload = {
    id: `preview-${campaign.id}`,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:30:00.000Z",
    campaignRefund: msg.campaignRefund,
    recipient,
  };
  const en = renderCampaignRefundEmail(payload, "en");
  const ar = renderCampaignRefundEmail(payload, "ar");
  return {
    "c-6": {
      subjectEn: en.subject,
      htmlEn: en.html,
      subjectAr: ar.subject,
      htmlAr: ar.html,
      recipient,
    },
  };
}

const analytics: AnalyticsOverview = {
  totalWorkers: 10,
  activeWorkers: 8,
  inactiveWorkers: 2,
  expiredSubs: 1,
  revenue: 0,
  monthlyRevenue: 0,
  dailyRevenue: 0,
  companies: 1,
  activeAds: 1,
  visitors: 100,
  conversionRate: 0,
  revenueSeries: [],
  leadsSeries: [],
  viewsSeries: [],
  categoryCounts: [],
  planDistribution: [],
  topWorkers: [],
  topCompanies: [],
  searchTrends: [],
  activities: [],
  alerts: [],
  verificationFunnel: { requests: 0, approved: 0, declined: 0, approvalRate: 0, conversionRate: 0 },
  bookingFunnel: { counts: { requested: 0 }, total: 0, conversionRate: 0 } as AnalyticsOverview["bookingFunnel"],
} as AnalyticsOverview;

function renderDashboard(locale: "en" | "ar", recipientLocale?: "en" | "ar") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <AdminDashboard
        session={session}
        analytics={analytics}
        campaigns={[campaign]}
        campaignPayments={[{ campaign, payment }]}
        campaignEmailPreviews={makePreviews(recipientLocale)}
        verificationQueue={[]}
        platformFeeStats={emptyPlatformFeeStats()}
        pendingPayouts={[]}
        pendingManualPayments={[]}
        workers={[]}
      />
    </LocaleProvider>
  );
}

/** Open the refunded campaign's email-preview dialog and read the iframe doc. */
async function openPreviewIframe(locale: "en" | "ar", recipientLocale?: "en" | "ar") {
  renderDashboard(locale, recipientLocale);
  fireEvent.click(
    screen.getByRole("button", { name: locale === "ar" ? "معاينة البريد" : "Preview email" })
  );
  const dialog = await screen.findByRole("dialog");
  const iframe = dialog.querySelector("iframe");
  expect(iframe).not.toBeNull();
  return { dialog, srcDoc: iframe!.getAttribute("srcdoc") ?? "" };
}

describe("AdminDashboard campaign refund email preview — follows the admin UI locale", () => {
  it("English admin previews the English refund email (Refund details card, EN copy)", async () => {
    const { srcDoc } = await openPreviewIframe("en");
    // EN email card — campaign, refunded amount, reason, deep link.
    expect(srcDoc).toContain("Refund details");
    expect(srcDoc).toContain("Beirut Whish A");
    expect(srcDoc).toContain("$500");
    expect(srcDoc).toContain("Campaign violated ad policy");
    expect(srcDoc).toContain("/company");
    // Not the Arabic rendering (the AR campaign name may still appear in the
    // email's secondary-language block — that's the deliberate bilingual
    // shell; the card + subject are EN).
    expect(srcDoc).not.toContain("تفاصيل الاسترداد");
  });

  it("Arabic admin previews the Arabic refund email (تفاصيل الاسترداد card, AR copy)", async () => {
    const { dialog, srcDoc } = await openPreviewIframe("ar");
    // AR email card — Arabic header, campaign name, refunded amount, reason.
    expect(srcDoc).toContain("تفاصيل الاسترداد");
    expect(srcDoc).toContain("بيروت ويش أ");
    expect(srcDoc).toContain("500");
    expect(srcDoc).toContain("Campaign violated ad policy");
    expect(srcDoc).toContain("/company");
    // Not the English rendering (card heading).
    expect(srcDoc).not.toContain("Refund details");
    // The dialog's subject line carries the ARABIC campaign name — the EN
    // name used to leak into the AR subject (the reported leak).
    expect(dialog).toHaveTextContent("تم استرداد الحملة — بيروت ويش أ");
    expect(dialog).not.toHaveTextContent("تم استرداد الحملة — Beirut Whish A");
  });

  it("the EN refund email's secondary block is dir=rtl with the Arabic campaign name (bilingual shell)", async () => {
    const { srcDoc } = await openPreviewIframe("en");
    // The emailShell appends the OTHER locale's copy below the primary as a
    // secondary block — for the EN email that's the AR copy, RTL-directioned
    // and carrying the ARABIC campaign name (never the EN one), so an
    // AR-preferring recipient gets their language right-aligned under the
    // English primary. Lock the structure so a future always-EN regression
    // (or a wrongly-localized secondary) fails here.
    const secondary = srcDoc.match(/<td dir="rtl">([\s\S]*?)<\/td>/)?.[1] ?? "";
    expect(secondary, "EN email must contain the dir=rtl secondary block").not.toBe("");
    expect(secondary).toContain("تم استرداد الحملة"); // AR secondary title
    expect(secondary).toContain("بيروت ويش أ"); // AR campaign name in the secondary body
    expect(secondary).not.toContain("Beirut Whish A"); // no EN name inside the RTL block
    // The block is genuinely RTL — right-aligned Arabic, not a stray LTR cell.
    expect(secondary).toContain("direction:rtl");
    expect(secondary).toContain("text-align:right");
  });

  it("an EN admin previews the AR email when the company prefers Arabic — the recipient locale leads the primary block", async () => {
    const { dialog, srcDoc } = await openPreviewIframe("en", "ar");
    // The email is the AR rendering (what the company received) — RTL, AR
    // card + Arabic campaign name — even though the admin's UI is English.
    expect(srcDoc).toContain('lang="ar" dir="rtl"');
    expect(srcDoc).toContain("تفاصيل الاسترداد");
    expect(srcDoc).toContain("بيروت ويش أ");
    expect(srcDoc).not.toContain("Refund details");
    // The dialog chrome still follows the admin's page locale (EN labels).
    expect(dialog).toHaveTextContent("Campaign refunded");
    expect(dialog).toHaveTextContent("Exactly what the company received for this campaign.");
    expect(dialog).toHaveTextContent("[WorkersArena] تم استرداد الحملة — بيروت ويش أ");
  });

  it("an AR admin previews the EN email when the company prefers English", async () => {
    const { srcDoc } = await openPreviewIframe("ar", "en");
    // Recipient locale leads: the EN rendering, despite the AR admin UI.
    expect(srcDoc).toContain('lang="en" dir="ltr"');
    expect(srcDoc).toContain("Refund details");
    expect(srcDoc).toContain("Beirut Whish A");
    expect(srcDoc).not.toContain("تفاصيل الاسترداد");
  });

  it("the dialog header/recipient lines follow the locale too", async () => {
    const { dialog } = await openPreviewIframe("ar");
    // The dialog title is the notification-type label (AR), the subtitle and
    // the recipient line render in Arabic as well.
    await waitFor(() => expect(dialog).toHaveTextContent("تم استرداد الحملة"));
    expect(dialog).toHaveTextContent("المستلم");
    expect(dialog).toHaveTextContent("BuildCo Ltd");
  });

  it("the campaign card uses the company subtitle, not the booking copy", async () => {
    // EN — the company-recipient subtitle, never the customer-booking wording.
    let { dialog } = await openPreviewIframe("en");
    expect(dialog).toHaveTextContent("Exactly what the company received for this campaign.");
    expect(dialog).not.toHaveTextContent("Exactly what the customer received");
    expect(dialog).not.toHaveTextContent("Exactly what you received");

    // AR — the matching company subtitle.
    ({ dialog } = await openPreviewIframe("ar"));
    expect(dialog).toHaveTextContent("نفس البريد الذي استلمته الشركة لهذه الحملة.");
    expect(dialog).not.toHaveTextContent("نفس البريد الذي استلمه العميل");
    expect(dialog).not.toHaveTextContent("نفس البريد الذي استلمته لهذا الحجز");
  });
});
