#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVENUE STREAM TEST GUIDE — .docx generator
 * ────────────────────────────────────────────────────────────────────────────
 * Generates a step-by-step PDF-style guide for testing every revenue stream
 * in the WorkersArena platform.
 *
 * Usage:  node scripts/generate-revenue-test-guide.mjs
 * Output: docs/WorkersArena-Revenue-Test-Guide.docx
 *
 * MAINTENANCE PROCEDURE:
 *   1. When a revenue stream changes, update the relevant section below.
 *   2. Regenerate with: node scripts/generate-revenue-test-guide.mjs
 *   3. The committed .docx is always the generator's output.
 *
 * Requires the `docx` package (devDependency).
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import { writeFileSync } from "node:fs";

/* ── theme ─────────────────────────────────────────────────────────────────── */

const INK = "0F172A";
const MUTED = "475569";
const ACCENT = "0E7490";
const GREEN = "059669";
const AMBER = "D97706";
const RED = "DC2626";
const HEAD_FILL = "0F172A";
const ALT_FILL = "F1F5F9";
const GREEN_BG = "ECFDF5";
const AMBER_BG = "FFFBEB";
const RED_BG = "FEF2F2";

/* ── helpers ──────────────────────────────────────────────────────────────── */

const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 36, color: INK })],
  });

const H2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: ACCENT })],
  });

const H3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: INK })],
  });

const P = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: opts.align,
    children: [
      new TextRun({ text, size: 22, color: opts.color ?? INK, italics: opts.italic, bold: opts.bold }),
    ],
  });

const rich = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 300 },
    alignment: opts.align,
    children: runs.map(
      (r) => new TextRun({ text: r.text, bold: r.bold, size: 22, color: r.color ?? INK, italics: r.italic }),
    ),
  });

const B = (text, opts = {}) =>
  new Paragraph({
    bullet: { level: opts.level ?? 0 },
    spacing: { after: 60, line: 290 },
    children: [new TextRun({ text, size: 22, color: opts.color ?? INK, bold: opts.bold })],
  });

const STEP = (n, text, opts = {}) =>
  new Paragraph({
    spacing: { after: 70, line: 290 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: `${n}. `, bold: true, size: 22, color: opts.color ?? ACCENT }),
      new TextRun({ text, size: 22, color: INK }),
    ],
  });

const CHECK = (text) =>
  new Paragraph({
    spacing: { after: 60, line: 290 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: "✅ ", size: 22 }),
      new TextRun({ text, size: 22, color: GREEN, bold: true }),
    ],
  });

const WARN = (text) =>
  new Paragraph({
    spacing: { after: 60, line: 290 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: "⚠️ ", size: 22 }),
      new TextRun({ text, size: 22, color: AMBER }),
    ],
  });

const FAIL = (text) =>
  new Paragraph({
    spacing: { after: 60, line: 290 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: "❌ ", size: 22 }),
      new TextRun({ text, size: 22, color: RED }),
    ],
  });

const ROLES = (value) =>
  new Paragraph({
    spacing: { after: 100, line: 290 },
    shading: { fill: "E0F2FE", type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: "Roles involved: ", bold: true, size: 22, color: ACCENT }),
      new TextRun({ text: value, size: 22, color: INK }),
    ],
  });

const cell = (text, opts = {}) =>
  new TableCell({
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      spacing: { after: 0, line: 280 },
      children: [new TextRun({ text, bold: opts.bold, size: 19, color: opts.color ?? INK })],
    })],
  });

const TABLE = (headers, rows, widths) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          cell(h, { fill: HEAD_FILL, bold: true, color: "FFFFFF", width: widths?.[i] }),
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((c, i) => cell(c, { width: widths?.[i] })),
          }),
      ),
    ],
  });

const SEPARATOR = () =>
  new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" } },
    children: [],
  });

/* ── document body ─────────────────────────────────────────────────────────── */

const children = [];

/* Cover */
children.push(
  new Paragraph({
    spacing: { before: 2000, after: 120 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "WorkersArena", bold: true, size: 64, color: ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Business Model & Revenue Stream", bold: true, size: 36, color: INK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: "Step-by-Step Testing Guide", bold: true, size: 32, color: INK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "Comprehensive verification guide for every revenue path — from subscription sign-up to lead purchase to campaign billing", size: 22, color: MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 18, color: MUTED, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: "Regenerate: node scripts/generate-revenue-test-guide.mjs", size: 18, color: MUTED, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Bilingual platform · Lebanon-first launch · OMT & Whish manual payments · USD currency", size: 22, color: MUTED })],
  }),
);

/* Table of Contents */
children.push(
  H1("Table of Contents"),
  B("1. Pre-Test Setup & Environment"),
  B("2. Revenue Stream 1 — Worker Subscriptions"),
  B("3. Revenue Stream 2 — Platform Take Rate (Booking Fees)"),
  B("4. Revenue Stream 3 — Lead Marketplace"),
  B("5. Revenue Stream 4 — Credit Purchases"),
  B("6. Revenue Stream 5 — Advertising Campaigns"),
  B("7. Revenue Stream 6 — Paid Upgrades (Verification, Featured, Emergency)"),
  B("8. Revenue Stream 7 — Lead Rebates (Fee Reduction Loop)"),
  B("9. Revenue Stream 8 — Worker ROI & Earnings Statements"),
  B("10. End-to-End Revenue Flow Test"),
  B("11. Admin Revenue Dashboard Verification"),
  B("12. Database & Ledger Integrity Checks"),
  B("13. Updating This Guide"),
);

/* ─────────────────────────────── Section 1 ─────────────────────────────── */

children.push(
  H1("1. Pre-Test Setup & Environment"),
  P("Before testing any revenue stream, ensure the environment is ready."),
  H3("Prerequisites"),
  B("Local Postgres running with DATABASE_URL in .env"),
  B("Run: npx prisma migrate deploy (all migrations applied)"),
  B("Run: npx tsx scripts/seed-production.ts (populates demo data)"),
  B("Start the dev server: npm run dev"),
  B("Open http://localhost:3000"),
  H3("Seed Data Summary"),
  TABLE(
    ["Entity", "Count", "Purpose"],
    [
      ["Workers", "5+ (across trades)", "Test subscriptions, upgrades, earnings"],
      ["Bookings", "8+ completed", "Test take rate, rebates, payouts"],
      ["Credit grants", "50 per worker", "Test lead purchases"],
      ["Categories", "21", "Test matching engine"],
      ["Cities", "6", "Test geo-based matching"],
    ],
    [25, 25, 50],
  ),
  H3("User Accounts"),
  B("Admin: sign in as admin (role: admin) — access /admin/* routes"),
  B("Worker (Khaled): slug khaled-al-harbi-plumbing — has Professional plan"),
  B("Worker (Sara): slug sara-mansour-electrical — has Premium plan"),
  B("Customer: signed-in user u-customer"),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 2 ─────────────────────────────── */

children.push(
  H1("2. Revenue Stream 1 — Worker Subscriptions"),
  P("Workers pay $29–$299/month for a subscription plan that gates visibility and features."),
  ROLES("Worker (purchases) · Admin (confirms)"),
  H3("Test: Renew a Worker Subscription"),
  STEP(1, "Sign in as the demo worker (Khaled)."),
  STEP(2, "Open /dashboard — the subscription card shows current plan, days left, and expiry date."),
  STEP(3, "Click Renew / upgrade on the subscription card."),
  STEP(4, "The dialog shows plan options: Basic $29, Professional $59, Premium $119, Enterprise $299."),
  STEP(5, "Select a plan and choose OMT or Whish as the payment method."),
  STEP(6, "Click Pay — the OMT/Whish instructions page opens with a reference number."),
  CHECK("Instructions page shows the correct amount, reference (OMT-… or WHISH-…), and steps."),
  STEP(7, "Switch to the Admin account. Open /admin → Pending manual payments."),
  STEP(8, "Find the pending payment and click Confirm."),
  CHECK("The subscription flips to active with the new plan and expiry date."),
  CHECK("A notification appears on the worker's bell."),
  CHECK("The activity feed logs ADMIN_PLAN_CHANGED with the admin's identity."),
  H3("Test: Plan Expiry Hides Worker"),
  STEP(1, "As admin, change a worker's plan to expired (or wait for expiry)."),
  STEP(2, "Search for that worker in /search."),
  CHECK("The expired worker does NOT appear in search results."),
  STEP(3, "Renew the subscription."),
  CHECK("The worker reappears in search results."),
  H3("Revenue Verification"),
  CHECK("The /admin Revenue card shows subscription revenue for the period."),
  CHECK("The worker's invoice list shows the WA-… invoice for the renewal."),
  CHECK("The database WorkerSubscription row has the correct plan, status, and expiry."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 3 ─────────────────────────────── */

children.push(
  H1("3. Revenue Stream 2 — Platform Take Rate (Booking Fees)"),
  P("The platform charges 7% (700 bps) of the job quote as a fee, with a $5 floor and $300 cap. Enterprise plan is exempt."),
  ROLES("Customer (books) · Worker (accepts with quote) · Admin (audits)"),
  H3("Test: Accept a Booking with Fee"),
  STEP(1, "As a customer, create a booking request for a worker (e.g. Khaled)."),
  STEP(2, "As the worker, open the dashboard → Requests tab and click Respond."),
  STEP(3, "Enter a quote of $200 (20000 minor units) and accept."),
  CHECK("The respond dialog shows: \"You receive $186 · Platform fee $14\" (7% of $200)."),
  CHECK("The fee snapshot is stamped on the booking (platformFee: 1400, platformFeeRateBps: 700)."),
  STEP(4, "The booking flips to CONFIRMED. Open the admin dispute view (/admin/bookings/BK-…)."),
  CHECK("The fee snapshot is visible in the booking details."),
  H3("Test: Floor and Cap"),
  STEP(1, "Create a booking with a $50 quote → fee = $5 (floor)."),
  STEP(2, "Create a booking with a $5000 quote → fee = $300 (cap)."),
  STEP(3, "Create a booking with an Enterprise worker → fee = $0 (exempt)."),
  CHECK("Each fee matches the expected floor/cap/exempt value."),
  H3("Test: Fee Stamping is Immutable"),
  STEP(1, "Accept a booking with a quote. Note the fee."),
  STEP(2, "Admin changes the fee rule set to a different rate."),
  STEP(3, "Check the original booking's fee — it must NOT have changed."),
  CHECK("The booking fee remains the original rate (immutable snapshot)."),
  H3("Revenue Verification"),
  CHECK("Admin Revenue → Platform Fees card shows gross, refunded, net, and avg fee."),
  CHECK("The WorkerLedgerEntry for the completed booking shows the correct earning (quote − fee)."),
  CHECK("The database Booking.platformFee matches the computed fee."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 4 ─────────────────────────────── */

children.push(
  H1("4. Revenue Stream 3 — Lead Marketplace"),
  P("Workers buy platform credits to purchase qualified leads. Leads are graded (bronze/silver/gold/emergency), matched to a few workers, and offered at a locked credit price."),
  ROLES("Worker (buys leads) · Admin (configures prices, matching, auditing)"),
  H3("Test: Seed and View Leads"),
  STEP(1, "Run the seed: POST /api/dev/seed-lead-market (creates 4 leads of different grades)."),
  STEP(2, "As the worker, open /dashboard/leads."),
  CHECK("The Available tab shows leads with grade badges, match scores, credit prices, and countdown timers."),
  CHECK("Each lead shows \"why you were matched\" (matching signals)."),
  H3("Test: Purchase a Lead"),
  STEP(1, "Ensure the worker has credits (grant via admin if needed)."),
  STEP(2, "Click \"Unlock for N credits\" on a lead."),
  CHECK("Credits are debited from the worker's balance."),
  CHECK("The lead moves to the Purchased tab."),
  CHECK("Customer contact details are revealed (masked before, revealed after purchase)."),
  CHECK("The LeadOffer status flips from \"offered\" to \"purchased\"."),
  H3("Test: Lead Pricing"),
  TABLE(
    ["Grade", "Default Price", "Rating Discount", "Rating Surcharge"],
    [
      ["Bronze", "5 credits", "4 credits (0.8×)", "6 credits (1.2×)"],
      ["Silver", "9 credits", "7 credits (0.8×)", "11 credits (1.2×)"],
      ["Gold", "20 credits", "16 credits (0.8×)", "24 credits (1.2×)"],
      ["Emergency", "35 credits", "28 credits (0.8×)", "42 credits (1.2×)"],
    ],
    [20, 25, 25, 30],
  ),
  STEP(3, "Admin → Revenue Settings → Lead marketplace: change a grade's price."),
  STEP(4, "Publish the new policy."),
  CHECK("New offers use the updated price; existing offers keep their original price."),
  H3("Test: Exclusivity & Expiry"),
  STEP(1, "Set the lead market config to exclusive=true, offerTtlMinutes=60."),
  STEP(2, "Create a lead with 2 matched workers."),
  STEP(3, "Worker A buys the lead."),
  CHECK("Worker B's offer is revoked (exclusivity)."),
  STEP(4, "Wait 60 minutes (or mock the clock)."),
  CHECK("Unpurchased offers expire."),
  H3("Revenue Verification"),
  CHECK("Credit ledger shows the debited entry for the lead purchase."),
  CHECK("Admin panel shows the offer as \"purchased\" with the credit amount."),
  CHECK("The WorkerCreditEntry records the spend."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 5 ─────────────────────────────── */

children.push(
  H1("5. Revenue Stream 4 — Credit Purchases"),
  P("Workers buy platform credits through OMT/Whish to fund lead purchases. Credits are the internal currency."),
  ROLES("Worker (purchases) · Admin (confirms)"),
  H3("Test: Buy Credits via OMT"),
  STEP(1, "As the worker, open /dashboard/credits."),
  STEP(2, "The page shows available packages (e.g. Starter 10 credits $10, Pro 25 credits $20, Bulk 100 credits $70)."),
  STEP(3, "Click Buy on a package."),
  STEP(4, "Choose OMT as the payment method."),
  CHECK("A checkout is created (POST /api/credits/purchase)."),
  CHECK("The OMT instructions page shows the amount and reference."),
  STEP(5, "As admin, confirm the purchase."),
  CHECK("Credits are added to the worker's balance."),
  CHECK("The WorkerCreditEntry records the grant with the purchase reason."),
  H3("Test: Credit Balance Display"),
  STEP(1, "Open /dashboard/credits — the balance card shows the current credit balance."),
  STEP(2, "Purchase a lead — the balance decreases."),
  STEP(3, "Admin grants credits — the balance increases."),
  CHECK("The balance always reflects the net of grants and spends."),
  H3("Revenue Verification"),
  CHECK("The credit ledger (WorkerCreditEntry) shows all grants and spends."),
  CHECK("The admin panel shows the full credit ledger with reasons and dates."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 6 ─────────────────────────────── */

children.push(
  H1("6. Revenue Stream 5 — Advertising Campaigns"),
  P("Companies buy ad campaigns (banner, slider, featured card, etc.) with OMT/Whish prepayment."),
  ROLES("Company (creates) · Admin (confirms, refunds)"),
  H3("Test: Create and Pay for a Campaign"),
  STEP(1, "Sign in as a company. Open the company dashboard."),
  STEP(2, "Click Create campaign."),
  STEP(3, "Configure: ad type (banner), targeting (Beirut, plumbing), budget ($500), CPM model."),
  STEP(4, "Submit — the campaign is created as PENDING with a \"Pay now\" button."),
  STEP(5, "Click Pay now → choose OMT → the instructions page shows the reference."),
  CHECK("A Payment row (PENDING) and an Invoice (pending, advertising scope) are created."),
  STEP(6, "As admin, open /admin → Pending manual payments."),
  STEP(7, "Confirm the campaign payment."),
  CHECK("The campaign flips to ACTIVE."),
  CHECK("The invoice flips to PAID."),
  CHECK("The ad starts serving on the homepage/search."),
  CHECK("A notification \"Campaign is live\" appears on the company bell."),
  H3("Test: Campaign Refund"),
  STEP(1, "As admin, open the campaign in the admin dashboard."),
  STEP(2, "Click Refund → enter a reason → confirm."),
  CHECK("The invoice flips to REFUNDED (credit note)."),
  CHECK("The campaign ends (status → ended)."),
  CHECK("A CAMPAIGN_REFUNDED audit event is logged with the admin's identity."),
  CHECK("The company receives a refund notification."),
  H3("Revenue Verification"),
  CHECK("The admin Revenue card shows campaign revenue."),
  CHECK("The Invoice list shows paid/refunded advertising invoices."),
  CHECK("The database Payment and Invoice rows are consistent."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 7 ─────────────────────────────── */

children.push(
  H1("7. Revenue Stream 6 — Paid Upgrades"),
  P("Workers buy a la carte upgrades: verification tiers, featured slot, emergency marker."),
  ROLES("Worker (purchases) · Admin (confirms)"),
  H3("Test: Purchase Verification"),
  STEP(1, "As the worker, open the upgrade dialog on the dashboard."),
  STEP(2, "Select Verification — Basic ($9) or Professional ($19)."),
  STEP(3, "Pay via OMT → admin confirms."),
  CHECK("The worker's profile shows a Verified badge."),
  CHECK("The worker appears in \"verified only\" search results."),
  CHECK("The verification has a 12-month validity."),
  H3("Test: Purchase Featured Slot"),
  STEP(1, "Select Featured slot ($49/category/month)."),
  STEP(2, "Pay via OMT → admin confirms."),
  CHECK("The worker appears in Featured placement on the homepage and search."),
  CHECK("The Featured badge is visible on the worker card."),
  H3("Test: Purchase Emergency Marker"),
  STEP(1, "Select Emergency marker ($9/month)."),
  STEP(2, "Pay via OMT → admin confirms."),
  CHECK("The worker can be matched for emergency leads."),
  CHECK("The Emergency badge is visible on the worker card."),
  H3("Revenue Verification"),
  CHECK("Each purchase creates a pending payment and an invoice."),
  CHECK("Admin confirmation activates the capability and flips the invoice to PAID."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 8 ─────────────────────────────── */

children.push(
  H1("8. Revenue Stream 7 — Lead Rebates (Fee Reduction Loop)"),
  P("When a job from a bought lead completes, the lead's cost is credited back as a fee reduction — so buying leads lowers the effective take rate."),
  ROLES("Worker (benefits) · Admin (configures)"),
  H3("Test: Complete a Job from a Bought Lead"),
  STEP(1, "Worker buys a lead (e.g. gold lead, 20 credits)."),
  STEP(2, "Worker quotes and wins the job ($300 quote)."),
  STEP(3, "Worker marks the job complete → customer confirms."),
  CHECK("The booking shows: Platform fee $21 (7% of $300) → Lead rebate $20 → Effective fee $1."),
  CHECK("The worker's net earnings are $299 (not $279)."),
  CHECK("The WorkerLedgerEntry records the earning with the rebate applied."),
  H3("Test: Rebate Boundaries"),
  STEP(1, "Set rebate config: enabled, pctBps=10000 (100%), maxMinor=null."),
  STEP(2, "Complete a job with fee $21 and lead cost $20 → rebate = $20 (limited by lead cost)."),
  STEP(3, "Complete a job with fee $5 and lead cost $20 → rebate = $5 (limited by fee)."),
  STEP(4, "Set maxMinor=$10 → rebate = $5 (limited by ceiling)."),
  CHECK("Each rebate is bounded by the lowest of: fee share, lead cost, and ceiling."),
  H3("Test: Rebate Disabled"),
  STEP(1, "Set rebate config: enabled=false."),
  STEP(2, "Complete a job from a bought lead."),
  CHECK("No rebate is applied — the full fee is charged."),
  H3("Revenue Verification"),
  CHECK("The admin Lead Rebate section shows total rebates given back."),
  CHECK("The WorkerLeadRebate records are consistent with the fee snapshots."),
  CHECK("The earnings statement shows the rebate on each relevant job."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 9 ─────────────────────────────── */

children.push(
  H1("9. Revenue Stream 8 — Worker ROI & Earnings Statements"),
  P("Workers see their return on investment from lead purchases and their monthly earnings breakdown."),
  ROLES("Worker (views)"),
  H3("Test: Worker ROI Dashboard"),
  STEP(1, "As the worker, open /dashboard/roi."),
  STEP(2, "The page shows: return multiple, GMV, earnings, total spend, funnel (leads → quotes → wins → completions)."),
  CHECK("The return multiple = GMV / (lead spend + subscription cost)."),
  CHECK("The funnel counts are accurate."),
  CHECK("The 6-month trend sparklines render."),
  H3("Test: Earnings Statement"),
  STEP(1, "Open /dashboard/earnings."),
  STEP(2, "The page shows: net earnings, GMV, platform fees, lead rebates, and a table of completed jobs."),
  CHECK("Each job shows: GMV, fee, rebate, net, source (lead vs. direct)."),
  CHECK("The net balance = earnings − payouts."),
  CHECK("Payout lines show withdrawals with status and reason."),
  STEP(3, "Navigate to a previous month."),
  CHECK("The statement shows only jobs completed in that month."),
  H3("Test: Earnings Statement with Payouts"),
  STEP(1, "Worker requests a withdrawal from the Payouts card."),
  STEP(2, "Admin approves the payout."),
  STEP(3, "Open the earnings statement for that month."),
  CHECK("The payout appears in the Payouts section with status \"processed\"."),
  CHECK("The net balance reflects the withdrawal."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 10 ─────────────────────────────── */

children.push(
  H1("10. End-to-End Revenue Flow Test"),
  P("This test exercises the complete money flow from customer request to worker payout."),
  H3("Scenario: Lead Purchase → Job → Rebate → Payout"),
  STEP(1, "Customer posts a plumbing request in Beirut."),
  STEP(2, "The request is graded GOLD (verified customer, detailed description, priced service)."),
  STEP(3, "The matching engine scores workers and offers the lead to the top 3."),
  STEP(4, "Worker Khaled buys the lead for 20 credits."),
  CHECK("Credit balance decreases by 20."),
  STEP(5, "Khaled quotes $300 and wins the job."),
  STEP(6, "Customer pays deposit via OMT → admin confirms."),
  CHECK("Payment flips PAID, invoice created."),
  STEP(7, "Khaled completes the job → customer confirms."),
  CHECK("Booking flips COMPLETED."),
  CHECK("Fee stamped: $21 (7% of $300)."),
  CHECK("Lead rebate applied: $20 (limited by lead cost)."),
  CHECK("Effective fee: $1."),
  CHECK("Worker ledger credited: $299."),
  STEP(8, "Khaled requests a withdrawal of $200."),
  STEP(9, "Admin approves the payout."),
  CHECK("Ledger entry: withdrawal -$200, balanceAfter updated."),
  STEP(10, "Check the earnings statement for the month."),
  CHECK("GMV: $300, Fee: $21, Rebate: $20, Net earnings: $299."),
  CHECK("Payout: $200, Net balance: $99."),
  STEP(11, "Check the ROI dashboard."),
  CHECK("Return multiple reflects the GMV vs. total spend."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 11 ─────────────────────────────── */

children.push(
  H1("11. Admin Revenue Dashboard Verification"),
  P("The admin must see accurate revenue data across all streams."),
  H3("Test: Revenue Settings Page"),
  STEP(1, "Open /admin/revenue-settings."),
  CHECK("Fee Rules panel shows the current take rate (7%, $5 floor, $300 cap)."),
  CHECK("Promotions panel shows active promotions and credit grants."),
  CHECK("Lead Market panel shows prices per grade, matching weights, reveal rules, and rebate config."),
  CHECK("The lead quality metrics section shows per-grade star averages and conversion rates."),
  H3("Test: Admin Revenue Cards"),
  STEP(1, "Open /admin → Platform Fees card."),
  CHECK("Shows gross fees, refunded fees, net fees, and average fee per booking."),
  STEP(2, "Open /admin → Pending manual payments card."),
  CHECK("Lists all unconfirmed OMT/Whish payments (deposits, campaigns, upgrades, credit purchases)."),
  STEP(3, "Open /admin → Pending payouts card."),
  CHECK("Lists all unapproved worker withdrawal requests."),
  H3("Test: Activity Feed"),
  STEP(1, "Open /admin/activity."),
  CHECK("The feed shows all revenue-related events: plan changes, payment confirms, refunds, lead purchases, payout approvals."),
  CHECK("Each event has the admin's identity and EN/AR copy."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 12 ─────────────────────────────── */

children.push(
  H1("12. Database & Ledger Integrity Checks"),
  P("Run these checks to verify the database is consistent."),
  H3("Automated Tests"),
  STEP(1, "Run the full test suite: npx vitest run."),
  CHECK("All tests pass (except the pre-existing lead-market-prisma flaky test)."),
  STEP(2, "Run the typecheck: npm run typecheck."),
  CHECK("Zero type errors."),
  STEP(3, "Run lint: npm run lint."),
  CHECK("Zero lint errors (warnings are acceptable)."),
  H3("Database Checks"),
  STEP(1, "Check WorkerSubscription rows: every active worker has a subscription."),
  STEP(2, "Check Booking.platformFee: every COMPLETED booking with a quote has a fee."),
  STEP(3, "Check WorkerLedgerEntry: every COMPLETED booking has a corresponding earning entry."),
  STEP(4, "Check WorkerCreditEntry: every lead purchase has a debit entry."),
  STEP(5, "Check LeadRebate: every rebate matches a completed booking with a bought lead."),
  STEP(6, "Check Payment and Invoice: every PAID payment has a PAID invoice; every REFUNDED payment has a REFUNDED invoice."),
  SEPARATOR(),
);

/* ─────────────────────────────── Section 13 ─────────────────────────────── */

children.push(
  H1("13. Updating This Guide"),
  P("This guide should be updated whenever a revenue stream changes."),
  H3("When to Update"),
  B("A new revenue stream is added (e.g. Stripe integration, supplier marketplace)."),
  B("An existing stream's pricing or logic changes (e.g. fee rate adjustment)."),
  B("A new admin capability is added (e.g. new refund type)."),
  B("The database schema changes (e.g. new ledger entry kind)."),
  B("The UI for any revenue surface changes."),
  H3("How to Update"),
  STEP(1, "Open scripts/generate-revenue-test-guide.mjs."),
  STEP(2, "Find the relevant section (numbered 2–12)."),
  STEP(3, "Update the test steps, expected results, and verification checks."),
  STEP(4, "Regenerate: node scripts/generate-revenue-test-guide.mjs."),
  STEP(5, "Commit the updated .docx."),
  H3("Revenue Stream Reference"),
  TABLE(
    ["Stream", "Section", "Revenue Type", "Status"],
    [
      ["Worker Subscriptions", "2", "Recurring ($29–$299/mo)", "Live"],
      ["Platform Take Rate", "3", "Per-booking (7%, $5–$300)", "Live"],
      ["Lead Marketplace", "4", "Per-lead (5–35 credits)", "Live"],
      ["Credit Purchases", "5", "One-time packages", "Live"],
      ["Advertising", "6", "Campaign budget ($10 CPM)", "Live"],
      ["Paid Upgrades", "7", "One-time ($9–$49)", "Live"],
      ["Lead Rebates", "8", "Fee reduction loop", "Live"],
      ["Worker ROI", "9", "Dashboard (no direct revenue)", "Live"],
    ],
    [28, 12, 35, 25],
  ),
);

/* ── build & write ─────────────────────────────────────────────────────────── */

const doc = new Document({
  creator: "WorkersArena",
  title: "WorkersArena — Business Model & Revenue Stream Testing Guide",
  description: "Step-by-step guide for testing every revenue stream in the WorkersArena platform.",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [{ properties: {}, children }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(new URL("../docs/WorkersArena-Revenue-Test-Guide.docx", import.meta.url), buf);
console.log("✅ Wrote docs/WorkersArena-Revenue-Test-Guide.docx");
