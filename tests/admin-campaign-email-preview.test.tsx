// @vitest-environment jsdom
/**
 * §Lebanon — the /admin campaign-payments card's "Preview email" follows the
 * admin's UI locale. The admin page renders the refund email in BOTH locales
 * from the shared campaignRefundNotification builder (never-drift), and the
 * EmailPreviewDialog picks the one matching the current locale — so an Arabic
 * admin previews the Arabic copy the company received, an English admin the
 * English copy. These tests render the whole AdminDashboard card and assert
 * the iframe content per locale.
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
 * both locales from the ONE shared builder payload. */
function makePreviews() {
  const msg = campaignRefundNotification(
    { nameEn: campaign.nameEn, nameAr: campaign.nameAr },
    { amount: payment.amount, currency: payment.currency, refundReason: payment.refundReason }
  );
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
    recipient: { name: "BuildCo Ltd", email: "ads@buildco.sa" },
  };
  const en = renderCampaignRefundEmail(payload, "en");
  const ar = renderCampaignRefundEmail(payload, "ar");
  return {
    "c-6": {
      subjectEn: en.subject,
      htmlEn: en.html,
      subjectAr: ar.subject,
      htmlAr: ar.html,
      recipient: { name: "BuildCo Ltd", email: "ads@buildco.sa" },
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

function renderDashboard(locale: "en" | "ar") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <AdminDashboard
        session={session}
        analytics={analytics}
        campaigns={[campaign]}
        campaignPayments={[{ campaign, payment }]}
        campaignEmailPreviews={makePreviews()}
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
async function openPreviewIframe(locale: "en" | "ar") {
  renderDashboard(locale);
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
    // Not the Arabic rendering.
    expect(srcDoc).not.toContain("تفاصيل الاسترداد");
  });

  it("Arabic admin previews the Arabic refund email (تفاصيل الاسترداد card, AR copy)", async () => {
    const { srcDoc } = await openPreviewIframe("ar");
    // AR email card — Arabic header, campaign name, refunded amount, reason.
    expect(srcDoc).toContain("تفاصيل الاسترداد");
    expect(srcDoc).toContain("بيروت ويش أ");
    expect(srcDoc).toContain("500");
    expect(srcDoc).toContain("Campaign violated ad policy");
    expect(srcDoc).toContain("/company");
    // Not the English rendering.
    expect(srcDoc).not.toContain("Refund details");
  });

  it("the dialog header/recipient lines follow the locale too", async () => {
    const { dialog } = await openPreviewIframe("ar");
    // The dialog title is the notification-type label (AR), the subtitle and
    // the recipient line render in Arabic as well.
    await waitFor(() => expect(dialog).toHaveTextContent("تم استرداد الحملة"));
    expect(dialog).toHaveTextContent("المستلم");
    expect(dialog).toHaveTextContent("BuildCo Ltd");
  });
});
