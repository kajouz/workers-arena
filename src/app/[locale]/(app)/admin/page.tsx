import { getSession } from "@/lib/auth-demo";
import { withReceiptTimes } from "@/lib/data/payment-receipts";
import { getFinanceQueues, overdueBalances, settledOutsideNeedingReview, withPaymentProgress } from "@/lib/data/payment-workflow-engine";
import { listRefundsDue } from "@/lib/data/payment-workflow-store";
import { FinanceQueuesCard } from "@/components/admin/finance-queues-card";
import { getI18n } from "@/lib/i18n/server";
import {
  getAnalyticsOverview,
  getCampaignPayment,
  getCampaignRecipient,
  getCampaigns,
  getPendingManualPayments,
  getPlatformFeeStats,
  getPendingPayouts,
  getSettlementReconciliation,
  getVerificationLogs,
  getVerificationQueue,
  getAllWorkers,
  getWorkerById,
  getSubscriptionAnalytics,
} from "@/lib/data/repo";
import { getAdminActivityFeed } from "@/lib/data/activity";
import { getWhatsAppDeliveries, getWhatsAppDeliveryStats, getWhatsAppDeliveryHealth } from "@/lib/data/whatsapp-delivery-store";
import { getReviewModerationStats } from "@/lib/data/review-moderation-store";
import { campaignRefundNotification } from "@/lib/data/campaign-notifications";
import { renderCampaignRefundEmail } from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { ActivityEntry, Campaign, CampaignPayment, LedgerEntry, Worker } from "@/lib/data/types";
import { timeAgo } from "@/lib/utils";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { GuaranteeClaimsCard } from "@/components/admin/guarantee-claims-card";
import { listGuaranteeClaims } from "@/lib/data/guarantee";
import { localeRedirect } from "@/lib/i18n/redirect";

export const metadata = { title: "Admin" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) return await localeRedirect("/auth/login");
  if (session.role !== "admin") return await localeRedirect("/dashboard");

  // Worker-management audit state survives reloads + is shareable: the client
  // syncs /admin?wm=<query>&sort=<planAsc|planDesc|name>&feeWaived=1 back via
  // router.replace, so the initial props here always match the URL.
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k]![0] : raw[k]);
  const wmSort = one("sort");
  const workerManagementInit = {
    query: one("wm") ?? "",
    sort: (wmSort === "name" || wmSort === "planAsc" || wmSort === "planDesc" ? wmSort : "planAsc") as
      | "name"
      | "planAsc"
      | "planDesc",
    feeWaivedOnly: one("feeWaived") === "1" || one("feeWaived") === "true",
  };

  const [{ locale }, analytics, campaigns, verificationQueue, verificationLogs, platformFeeStats, subscriptionAnalytics, whatsappDeliveries, whatsappDeliveryStats, whatsappHealth, reviewModerationStats, settlementJobs] = await Promise.all([
    getI18n(),
    getAnalyticsOverview(),
    getCampaigns(),
    getVerificationQueue(),
    getVerificationLogs(),
    getPlatformFeeStats(30),
    getSubscriptionAnalytics(6),
    getWhatsAppDeliveries({ limit: 100 }),
    getWhatsAppDeliveryStats(),
    getWhatsAppDeliveryHealth(),
    // Review moderation is a publication gate, so its backlog belongs on the
    // overview next to the verification queue rather than one click away.
    getReviewModerationStats(),
    // §Settlement — the collected-vs-stamped audit sits with the money cards,
    // because it is the one that says whether the other money figures are real.
    getSettlementReconciliation(30),
  ]);

  // Campaign purchases — payment state per campaign for the payments card
  // (the demo store keys payments by campaign id; seeded campaigns have none).
  const campaignPaymentRows: { campaign: Campaign; payment: CampaignPayment | null }[] = await Promise.all(
    campaigns.map(async (c) => ({ campaign: c, payment: await getCampaignPayment(c.id) }))
  );
  const campaignPayments = campaignPaymentRows.filter(
    (row): row is { campaign: Campaign; payment: CampaignPayment } => Boolean(row.payment)
  );

  // Campaign refund email previews — for REFUNDED purchases, render the exact
  // email the company received in BOTH locales (the shared
  // campaignRefundNotification builder + renderCampaignRefundEmail — the same
  // never-drift pattern as the booking dispute view), so the payments card's
  // Preview button shows the real thing in the admin's UI locale.
  const campaignEmailPreviews = Object.fromEntries(
    await Promise.all(
      campaignPayments
        .filter(({ payment }) => payment.status === "refunded")
        .map(async ({ campaign, payment }) => {
          const msg = campaignRefundNotification(campaign, payment);
          const recipient = (await getCampaignRecipient(campaign.id)) ?? undefined;
          const payload: ChannelPayload = {
            id: `preview-${campaign.id}`,
            type: msg.type,
            titleEn: msg.titleEn,
            titleAr: msg.titleAr,
            bodyEn: msg.bodyEn,
            bodyAr: msg.bodyAr,
            href: msg.href,
            time: new Date().toISOString(),
            campaignRefund: msg.campaignRefund,
            recipient,
          };
          const emailEn = renderCampaignRefundEmail(payload, "en");
          const emailAr = renderCampaignRefundEmail(payload, "ar");
          return [
            campaign.id,
            {
              subjectEn: emailEn.subject,
              htmlEn: emailEn.html,
              subjectAr: emailAr.subject,
              htmlAr: emailAr.html,
              recipient,
            },
          ] as const;
        })
    )
  ) as Record<
    string,
    {
      subjectEn: string;
      htmlEn: string;
      subjectAr: string;
      htmlAr: string;
      recipient?: { name: string; email: string; locale: "en" | "ar" };
    }
  >;

  // Surface the most recent verification decisions at the top of Recent activity.
  // The code stamps WORKER_VERIFIED / VERIFICATION_DECLINED so the feed can
  // render admin decisions distinctly from worker-side requests.
  const verificationActivities: ActivityEntry[] = verificationLogs.slice(0, 3).map((log) => ({
    id: `vl-activity-${log.id}`,
    actionEn: log.action === "approved" ? "Worker verified" : "Verification declined",
    actionAr: log.action === "approved" ? "توثيق عامل" : "رفض التوثيق",
    actor: locale === "ar" ? log.workerNameAr : log.workerNameEn,
    time: timeAgo(log.time, locale),
    type: "verification",
    code: log.action === "approved" ? "WORKER_VERIFIED" : "VERIFICATION_DECLINED",
  }));
  // Runtime events (push prunes, forced removals, …) go to the top of the feed.
  const liveActivities: ActivityEntry[] = (await getAdminActivityFeed()).slice(0, 6).map((act) => ({
    ...act,
    time: timeAgo(act.time, locale),
  }));
  analytics.activities = [...liveActivities, ...verificationActivities, ...analytics.activities];

  // Payouts (docs/payouts.md) — withdrawals waiting for review, enriched with
  // the worker's display name (the ledger rows carry only workerId).
  const pendingPayoutRows: { entry: LedgerEntry; worker: Worker }[] = [];
  for (const entry of await getPendingPayouts()) {
    const worker = await getWorkerById(entry.workerId);
    if (worker) pendingPayoutRows.push({ entry, worker });
  }
  const pendingPayouts = pendingPayoutRows.map(({ entry, worker }) => ({
    entry,
    workerName: locale === "ar" ? worker.nameAr : worker.nameEn,
  }));

  // WorkersArena Guarantee — open claims surface here so none waits unseen;
  // the full queue (with recent decisions) is /admin/guarantee.
  const openClaims = (await listGuaranteeClaims()).filter((c) => c.status === "open");

  // Payment workflow v2 — the finance queues: amounts waiting for a second
  // approver, unmatched (late/orphan) receipts, refunds owed, overdue job
  // balances and unanswered / denied "settled directly" declarations.
  const [financeQueues, refundsDue, overdue, outsideReview] = await Promise.all([
    getFinanceQueues(),
    listRefundsDue(),
    overdueBalances(),
    settledOutsideNeedingReview(),
  ]);
  const finance = {
    awaitingApproval: financeQueues.awaitingApproval.map((t) => ({
      id: t.id,
      label: locale === "ar" ? t.labelAr : t.labelEn,
      amountMinor: t.amountMinor,
      txnId: t.externalTxnId,
      enteredBy: t.enteredBy ?? "",
      enteredByMe: t.enteredById === session.id,
      createdAt: t.createdAt,
    })),
    unmatched: financeQueues.unmatched.map((t) => ({
      id: t.id,
      label: locale === "ar" ? t.labelAr : t.labelEn,
      amountMinor: t.amountMinor,
      txnId: t.externalTxnId,
      createdAt: t.createdAt,
    })),
    refunds: refundsDue.map((r) => ({ paymentId: r.paymentId, label: r.label, amountMinor: r.amountMinor, method: r.method ?? "", createdAt: r.createdAt })),
    overdue: overdue.map((o) => ({ bookingId: o.booking.id, number: o.booking.number, customer: o.booking.customerName, outstandingMinor: o.outstandingMinor, stage: o.stage })),
    outsideReview: outsideReview.map((o) => ({ bookingId: o.booking.id, number: o.booking.number, customer: o.booking.customerName, disputed: o.disputed })),
  };
  const financeCount =
    finance.awaitingApproval.length + finance.unmatched.length + finance.refunds.length + finance.overdue.length + finance.outsideReview.length;

  return (
    <>
    {openClaims.length > 0 && (
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <GuaranteeClaimsCard claims={openClaims} />
      </div>
    )}
    {financeCount > 0 && (
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <FinanceQueuesCard queues={finance} />
      </div>
    )}
    <AdminDashboard
      session={session}
      analytics={analytics}
      campaigns={campaigns}
      campaignPayments={campaignPayments}
      campaignEmailPreviews={campaignEmailPreviews}
      verificationQueue={verificationQueue}
      platformFeeStats={platformFeeStats}
      pendingPayouts={pendingPayouts}
      pendingManualPayments={await withPaymentProgress(await withReceiptTimes(await getPendingManualPayments()))}
      nowSeed={Date.now()}
      workers={await getAllWorkers()}
      workerManagementInit={workerManagementInit}
      subscriptionAnalytics={subscriptionAnalytics}
      whatsappDeliveries={whatsappDeliveries}
      whatsappDeliveryStats={whatsappDeliveryStats}
      whatsappHealth={whatsappHealth}
      reviewModerationStats={reviewModerationStats}
      settlementJobs={settlementJobs}
    />
    </>
  );
}
