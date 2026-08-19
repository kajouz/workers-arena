// WorkersArena — Application Functionality & Step-by-Step Usage Manual (.docx generator)
//
// MAINTENANCE PROCEDURE (keep the manual current as features ship):
//   1. When a feature or module ships, update its section below (module title,
//      the "Roles involved" line, and the step-by-step list) — or add a new
//      module block after section 3.15. Keep steps user-facing and grounded in
//      the actual UI, and keep the revenue/identifier tables in sync with
//      BUSINESS-MODEL.md / PAYMENTS.md / INTERACTION-WORKFLOWS.md.
//   2. Regenerate with: npm run docs:manual
//   3. The standard check (npm run test:all) also runs docs:manual on every
//      pass, so the committed .docx is always the generator's output — a
//      stale manual shows up as a dirty diff, never as drift.
// Requires the `docx` package (devDependency, ^8.5.0).
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import { writeFileSync } from "node:fs";

const INK = "0F172A";
const MUTED = "475569";
const ACCENT = "0E7490";
const HEAD_FILL = "0F172A";
const ALT_FILL = "F1F5F9";

// ── helpers ────────────────────────────────────────────────────────────────
const H1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true, size: 34, color: INK })],
  });

const H2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
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
      new TextRun({ text, size: 22, color: INK, italics: opts.italic }),
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

const B = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 290 },
    children: [new TextRun({ text, size: 22, color: INK })],
  });

const STEP = (n, text) =>
  new Paragraph({
    spacing: { after: 70, line: 290 },
    indent: { left: 260, hanging: 260 },
    children: [
      new TextRun({ text: `${n}. `, bold: true, size: 22, color: ACCENT }),
      new TextRun({ text, size: 22, color: INK }),
    ],
  });

const ROLES = (label, value) =>
  new Paragraph({
    spacing: { after: 100, line: 290 },
    shading: { fill: "E0F2FE", type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: `Roles involved: `, bold: true, size: 22, color: ACCENT }),
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

const KV = (k, v) =>
  new Paragraph({
    spacing: { after: 60, line: 290 },
    children: [
      new TextRun({ text: `${k}: `, bold: true, size: 22, color: INK }),
      new TextRun({ text: v, size: 22, color: INK }),
    ],
  });

// ── document body ───────────────────────────────────────────────────────────
const children = [];

// Cover
children.push(
  new Paragraph({
    spacing: { before: 2400, after: 120 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "WorkersArena", bold: true, size: 64, color: ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Application Functionalities & Step-by-Step Module Usage", bold: true, size: 32, color: INK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "User Manual — with role responsibilities for Customers, Workers, Companies, and Admins", size: 24, color: MUTED })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)} — regenerated by \`npm run docs:manual\` (runs in the standard check \`npm run test:all\`), so this document always matches the shipped application.`, size: 18, color: MUTED, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: "Source of truth: scripts/generate-user-manual.mjs", size: 18, color: MUTED, italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Bilingual platform (English LTR / Arabic RTL) · Lebanon-first launch · OMT & Whish manual payments", size: 22, color: MUTED })],
  }),
);

// Contents
children.push(H1("Contents"));
["1. Introduction & platform overview", "2. User roles & responsibilities", "3. Modules — functionality, roles, step-by-step usage",
 "4. Cross-party interaction workflows", "5. Revenue generated by each party", "6. Key identifiers & reference formats",
 "7. Demo vs. real mode (what runs where)"].forEach((t) => B(t));

// 1. Introduction
children.push(
  H1("1. Introduction & platform overview"),
  P("WorkersArena is a bilingual (English LTR / Arabic RTL) marketplace SaaS where customers find, compare, and hire trusted professional workers — plumbers, electricians, AC technicians, carpenters, and 20+ trades — while workers grow their business with paid subscriptions and companies advertise to a qualified audience."),
  B("Four parties interact on the platform: Customers (bookers), Workers (supply), Companies (advertisers), and the Admin (platform operator)."),
  B("Customers always remain free — monetization is charged to workers (subscriptions, upgrades, a booking take rate) and companies (advertising), never to bookers."),
  B("The application is fully bilingual with one-click EN/AR switching, full RTL support, dark mode, and mobile-first responsive layout."),
  B("Lebanon is a first-class service country: payments run through the OMT and Whish Money manual methods (no gateway keys) — the customer pays at an OMT agent or inside the Whish app with a generated reference, and an admin confirms receipt."),
  B("Every booking carries an immutable audit trail (who did what, when, and why) that customers, workers, and admins can all view, print, and email."),
);

// 2. Roles
children.push(
  H1("2. User roles & responsibilities"),
  P("Each role has a distinct job on the platform and a distinct set of modules it can use. The table below is the master map; module-by-module detail follows in section 3."),
  TABLE(
    ["Role", "Who they are", "Their job on the platform", "What it costs"],
    [
      ["Customer / User", "Anyone searching for a service — may book as a guest (name + phone) or create a signed-in account", "Search and compare workers, request quotes from up to 3 workers at once, book a slot, pay deposits, negotiate in the booking chat, confirm job completion, review the worker, follow the audit trail", "Free — no fees of any kind"],
      ["Worker", "A professional (plumber, electrician, AC tech, carpenter, …) with a public profile and availability slots", "Maintain the profile, respond to requests (accept with a quote / decline), bid in multi-candidate quote jobs, negotiate in chat, complete jobs for customer confirmation, withdraw earnings, buy subscriptions and upgrades", "Subscription $29–$299/mo (Basic / Professional / Premium / Enterprise) + optional add-ons; 7% platform take rate on accepted quotes (waived on Enterprise)"],
      ["Company", "A business advertising its services to the platform audience", "Create ad campaigns, pay for them (OMT/Whish), monitor impressions / clicks / CTR / budget spend, review invoices, receive refunds", "Campaign budget ($10 CPM / $1 click model) prepaid before the campaign goes live"],
      ["Admin", "Platform operator / support / finance", "Confirm manual payments, approve or reject verifications, change worker plans, approve payouts, cancel or refund bookings, resolve disputes, review the activity feed, audit everything, export trails", "N/A — platform side"],
    ],
    [15, 30, 40, 15],
  ),
);

// 3. Modules
children.push(H1("3. Modules — functionality, roles, step-by-step usage"));

// 3.1
children.push(
  H2("3.1 Search & discovery"),
  P("Customers find workers through a fuzzy bilingual search with autocomplete, filters, seven sort modes, and trust signals on every card. Search behavior is logged for admin analytics."),
  ROLES("Customer (main user) · Admin (view search-trends analytics)"),
  H3("Functionality"),
  B("Fuzzy search with Arabic normalization (tashkeel stripping, alef/hamza/ta-marbuta/ya unification) — a query works in either language."),
  B("Autocomplete suggestions: categories, workers, cities."),
  B("Filters: category, city, area, minimum rating, price band, minimum experience, verified / featured / emergency / open-now / availability."),
  B("Seven sort modes: relevance, rating, reviews, price ↑/↓, experience, nearest (distance to city centre)."),
  B("Trust chips on every card: the worker's response rate (share of answered requests) and a “Free this week” availability chip."),
  B("Admin search-trends card aggregates SearchLog data."),
  H3("Step by step"),
  STEP(1, "Open the homepage or /search. Type a service (e.g. “plumber”, “سباك”) or choose a category from the directory."),
  STEP(2, "Pick the city and area from the dropdowns (cities like Beirut, Riyadh, Dubai are seeded with their areas)."),
  STEP(3, "Apply filters — minimum rating, price band, verified / featured / emergency / open-now — to narrow the pool."),
  STEP(4, "Choose a sort mode (relevance is default; “Nearest” uses the city centre distance)."),
  STEP(5, "Read the trust chips on each card (response rate + free this week) before choosing."),
  STEP(6, "Click a worker card to open the full profile (module 3.2)."),
);

// 3.2
children.push(
  H2("3.2 Worker profiles"),
  P("A profile is the worker's storefront: identity, services and pricing, proof (certifications, gallery), availability, and direct contact."),
  ROLES("Worker (owns the profile) · Customer (browses, favorites, contacts, books)"),
  H3("Functionality"),
  B("Gradient cover, bilingual name / tagline / bio, photo gallery, portfolio items."),
  B("Services & pricing (ServiceItem catalog), certifications, working hours."),
  B("Service-area map (OpenStreetMap embed) and a contact card: call, WhatsApp deep link, email, website, socials."),
  B("Rating distribution, customer reviews (with a review form that notifies the worker), related workers."),
  B("QR code, share link, favorite (persisted), JSON-LD structured data, profile-view tracking."),
  B("Badges: Verified (paid verification tiers), Featured (paid slot), Emergency (paid marker), Enterprise plan fee-waived treatment."),
  H3("Step by step"),
  STEP(1, "From search (3.1), click a worker card to open the profile."),
  STEP(2, "Review the services and their prices, then check certifications and working hours."),
  STEP(3, "Read the rating distribution and customer reviews; submit your own review after a completed booking."),
  STEP(4, "Use the contact card to call or open WhatsApp with a pre-filled context message."),
  STEP(5, "Save the worker to favorites (heart) or share the profile link / QR code."),
  STEP(6, "Book directly (module 3.3) or click “Get quotes” to invite this worker into a multi-candidate quote job."),
);

// 3.3
children.push(
  H2("3.3 Booking requests (single + multi-candidate quotes)"),
  P("The request phase. A customer can book one worker directly, or post one job and invite up to three workers to quote it. Every request carries a live SLA deadline."),
  ROLES("Customer (creates) · Worker (responds or bids) · Admin (sees the request in the funnel and dispute views)"),
  H3("Functionality"),
  B("Single booking dialog with three steps: details (service item, description, contact info) → slot (pick from the worker's AVAILABLE slots) → quote / deposit (optional worker quote, optional deposit, cancellation-policy disclosure)."),
  B("Multi-candidate “Get quotes”: a customer posts one job (QR-…) and invites up to 3 workers; each invited worker bids; the customer picks a winner plus a slot; the winner becomes a normal REQUESTED booking and the losers are auto-declined."),
  B("Request SLA: a live ticking countdown (shared urgency bar) shows the response deadline; the worker is nudged once after 24h and the request auto-cancels after 48h (slot freed, customer notified)."),
  B("Guests book with name + phone; signed-in customers are matched to their bookings by account as well."),
  H3("Step by step — direct booking"),
  STEP(1, "On a worker profile click Book / contact and open the booking dialog."),
  STEP(2, "Step 1 — Details: pick the service item, describe the job, enter your name, phone, and (optionally) email."),
  STEP(3, "Step 2 — Slot: choose a date and time from the worker's available slots."),
  STEP(4, "Step 3 — Quote & deposit: review the quote and required deposit (if any) and read the cancellation/refund policy note (deposit refundable outside the 24h window)."),
  STEP(5, "Submit — the booking is created as REQUESTED with an SLA countdown on your /bookings row."),
  H3("Step by step — multi-candidate quotes"),
  STEP(1, "On any worker profile click “Get quotes”; in the dialog pick up to 3 workers (from the profile + related pool) and describe the job."),
  STEP(2, "Submit — a Quote Request job (QR-…) is created; each invited worker sees it as a bid invitation on their dashboard Requests tab."),
  STEP(3, "Workers bid with their price and deposit requirements; you watch bids land on the job card in the /bookings “Quote requests” tab."),
  STEP(4, "Pick a winner: choose the best bid, then select a slot from the winner's availability."),
  STEP(5, "The card flips to SELECTED: the winner becomes a normal REQUESTED booking (the SLA countdown starts) and the losing bids show “another offer was chosen”."),
);

// 3.4
children.push(
  H2("3.4 Response, negotiation & chat"),
  P("After a request, the worker responds — and negotiation happens inside the booking's chat thread, which is preserved in the audit trail."),
  ROLES("Worker (responds, negotiates, shares quotes) · Customer (accepts, counters, chats) · Admin (read-only view of the conversation in the dispute view)"),
  H3("Functionality"),
  B("Worker respond dialog: accept with an optional quote + deposit, or decline. Accept-with-quote stamps the platform fee (7%, $5 floor / $300 cap, Enterprise waived) and shows “you receive X · platform fee Y”."),
  B("Booking chat thread keyed to the booking: actors are stamped (customer / worker / admin), messages are ordered oldest-first, and the worker can attach a price quote to a message (shown as an in-thread quote chip)."),
  B("Accept a quoted price from the thread: the customer clicks “Accept” on a worker's quoted message and the booking converts straight to CONFIRMED at that amount."),
  B("Read receipts (“Seen” badges on your own messages) and typing indicators (ephemeral, per booking)."),
  B("WhatsApp deep-link fallback: one click opens wa.me with the booking context pre-filled to the other party's number."),
  B("Every chat message is appended to the booking's audit trail, so the negotiation is visible in the dispute timeline."),
  H3("Step by step — worker responds"),
  STEP(1, "Open the dashboard Requests tab; the REQUESTED row shows the live SLA countdown and the customer's details."),
  STEP(2, "Click Respond; in the dialog enter your quote (optional) and deposit requirement (optional)."),
  STEP(3, "Review the live fee preview (“you receive X · platform fee Y”; Enterprise shows the waived line), then Accept."),
  STEP(4, "The booking flips to CONFIRMED with the slot booked and the fee stamped; the customer is notified."),
  H3("Step by step — negotiation in chat"),
  STEP(1, "Either party opens the booking's chat (from the customer /bookings row or the worker dashboard row)."),
  STEP(2, "Send messages; the worker can toggle the “attach quote” option to put a price on a message."),
  STEP(3, "The customer sees the quote chip in the thread and clicks “Accept this quote” if it works."),
  STEP(4, "Booking converts to CONFIRMED; a “confirmed” audit event with the negotiation trail lands in the timeline."),
  STEP(5, "If the conversation should move off-platform, click the WhatsApp link to continue with context pre-filled."),
);

// 3.5
children.push(
  H2("3.5 Payments, deposits & invoices (Lebanon: OMT / Whish)"),
  P("Payments run through a modular provider seam. In Lebanon the live methods are OMT and Whish Money — manual, admin-confirmed. The platform registry also knows Stripe, PayPal, MyFatoorah, Tap, bank transfer, and cash."),
  ROLES("Customer (pays deposits) · Worker (receives) · Company (pays campaigns) · Admin (confirms manual receipts, refunds)"),
  H3("Functionality"),
  B("Deposit flow: accept-with-deposit creates a PENDING payment; checkout mints the provider instructions; payment confirm flips the booking PENDING_PAYMENT → CONFIRMED."),
  B("OMT / Whish manual flow: the platform mints a signed instructions page (/payments/manual) with the provider's steps and a reference (OMT-… or WHISH-…); the payer pays at an OMT agent / Western Union or inside the Whish app; an admin confirms receipt from the /admin pending-payments card."),
  B("Invoices: confirmed payments mint a WA-YYYY-NNNNN invoice (signed-in customers); the invoice shows on the customer receipt and company invoice list."),
  B("Refunds route through the paying provider — an OMT-paid deposit refunds via OMT, a Whish-paid campaign via Whish; a refund voids the invoice (credit note) and logs an audit event."),
  B("Idempotent checkouts: re-clicking Pay returns the same minted URL; switching method re-mints with the new provider."),
  H3("Step by step — OMT / Whish deposit"),
  STEP(1, "The worker accepts the booking with a deposit required; you land on the payment step with the method picker."),
  STEP(2, "Choose OMT or Whish and Pay — the signed instructions page opens showing the amount, the reference (e.g. OMT-BK-1001-000), and the provider's steps (OMT agent / OMT Pay app / Whish app)."),
  STEP(3, "Complete the payment in the real world (OMT agent or Whish app) using the reference."),
  STEP(4, "The admin confirms receipt from the /admin pending-payments card; the payment flips PAID and the booking becomes CONFIRMED."),
  STEP(5, "Your WA-… invoice appears on the booking receipt; the worker is notified."),
  H3("Step by step — refund"),
  STEP(1, "Cancellations: a customer or system cancel, or a worker cancel outside the 24h window, refunds the deposit via the paying provider."),
  STEP(2, "Admin refund: from the dispute view (3.7) the admin can refund a PAID deposit or cancel-and-refund; the payment flips REFUNDED and the invoice voids."),
  STEP(3, "The customer receives the refund email; the audit trail gains a REFUNDED event with the admin's identity."),
);

// 3.6
children.push(
  H2("3.6 Job completion & worker payouts"),
  P("Completion is customer-gated — the worker stages completion and only the customer's confirmation completes the job and releases the payout. Earnings flow into a ledger and out through an admin-reviewed payout queue."),
  ROLES("Worker (stages completion, withdraws) · Customer (confirms completion) · Admin (auto-confirm grace, payout approvals)"),
  H3("Functionality"),
  B("Worker marks the job complete → the booking enters COMPLETION_PENDING and the customer gets a “Confirm job completion” notification."),
  B("Customer confirms on /bookings → COMPLETED; earnings (quote − platform fee) are credited to the worker ledger idempotently."),
  B("If the customer never confirms, a grace cron auto-confirms after 72h, credits the ledger, and emails the receipt."),
  B("Payouts card: available balance, pending withdrawals, full history with per-entry balance-after audit."),
  B("Admin /admin pending-payouts queue: approve (settled debit) or reject (voided)."),
  H3("Step by step"),
  STEP(1, "Worker finishes the job and clicks “Mark complete” on the booking row — status shows “Awaiting confirmation”."),
  STEP(2, "Customer opens /bookings, sees the violet Confirm card, and confirms the completion (or raises the timeline to dispute instead)."),
  STEP(3, "The booking flips to COMPLETED; the worker ledger is credited with net earnings; the worker is told the payout is on its way."),
  STEP(4, "Worker opens the dashboard Payouts card and requests a withdrawal (capped at available − pending)."),
  STEP(5, "Admin approves or rejects in the /admin pending-payouts queue; an approved payout settles and appears in history."),
);

// 3.7
children.push(
  H2("3.7 Audit trail, disputes & admin money actions"),
  P("Every booking carries an immutable event trail. All three sides see the identical timeline, can print it as a PDF, and email it — and the admin can act on it with money."),
  ROLES("Customer (views, prints, emails) · Worker (views, prints, emails) · Admin (dispute view, cancel/refund, export all trails)"),
  H3("Functionality"),
  B("“What happened” toggle on the customer row and worker dashboard card expands the full event trail (status, actor, reason, timestamp) with the same color coding as the admin page."),
  B("Tap an entry for the full audit line: booking number, status, actor, exact localized timestamp, reason."),
  B("Print button opens a print-optimized audit document (facts + events table, RTL for Arabic) and prints it to PDF; the dialog remembers the last-chosen document language."),
  B("Email audit button sends the same PDF to the customer and/or worker on demand (per-recipient language)."),
  B("Admin export: the booking-funnel card exports ALL bookings' event trails as CSV (one row per event) or one combined PDF."),
  B("Admin money actions on the dispute view: Cancel booking (frees the slot, always refunds a PAID deposit, notifies both parties) and Refund deposit (money-only correction, idempotent) — both two-step dialogs with a reason, both audited."),
  B("Chat messages appear in the trail as events, so negotiation is fully reconstructable."),
  H3("Step by step — customer / worker"),
  STEP(1, "On the booking row click “What happened (N events)” to expand the timeline."),
  STEP(2, "Tap any entry to see the full audit line (actor, timestamp, reason, booking number)."),
  STEP(3, "Click Print to preview the printable document; choose EN/العربية and Print (the dialog remembers your choice)."),
  STEP(4, "Click Email audit, tick who should receive the PDF (customer / worker), and send — each recipient gets their language."),
  H3("Step by step — admin"),
  STEP(1, "Open /admin/bookings/[number] to see the full dispute view: booking facts, slot, payments, invoice, and the complete event trail."),
  STEP(2, "Review the conversation (chat) and the audit trail, including any refund/cancel events."),
  STEP(3, "To refund: click Refund deposit → enter the reason → confirm; the payment flips REFUNDED and the invoice voids."),
  STEP(4, "To cancel: click Cancel booking → reason → confirm; the slot frees, a PAID deposit refunds, and both parties are notified."),
  STEP(5, "For a platform-wide audit, use Export trails (CSV or PDF) on the booking-funnel card."),
);

// 3.8
children.push(
  H2("3.8 Worker subscriptions & paid upgrades"),
  P("Workers grow their business with a paid plan plus a la carte trust and visibility upgrades. All purchases are payable via OMT / Whish and activated on admin confirmation."),
  ROLES("Worker (purchases) · Admin (confirms payments, changes plans, audits)"),
  H3("Functionality"),
  B("Plans: Basic $29, Professional $59, Premium $119, Enterprise $299 per month (annual billing = 10 paid months for 12)."),
  B("Expired subscriptions hide the worker from public search — the natural upsell trigger; renewal reminders fire at 7 / 3 / 1 days."),
  B("Upgrade dialog: verification tiers (Basic $9 ID check / Professional $19 license + background check, 12-month validity, Verified badge in search), the Featured slot ($49/category/month, homepage + search placement), and the Emergency marker ($9/month)."),
  B("Purchase flow: upgrade → pending manual payment (OMT/Whish instructions page) → admin confirms → the capability activates."),
  B("Admin can change a worker's plan inline (audited as ADMIN_PLAN_CHANGED with the acting admin's identity), reactivate an expired subscription, toggle fee-waived, and export the worker table as CSV."),
  H3("Step by step — worker"),
  STEP(1, "On the dashboard open the upgrade / renewal dialog; pick the plan or add-on (verification, Featured, Emergency)."),
  STEP(2, "Choose the payment method (OMT / Whish) and Pay — the signed instructions page shows the reference."),
  STEP(3, "Pay at the OMT agent or in the Whish app with the reference."),
  STEP(4, "Admin confirms receipt; the subscription renews (or the upgrade activates) and the badge appears on the profile in search."),
  H3("Step by step — admin"),
  STEP(1, "Confirm the receipt from the /admin pending-payments card — the purchased capability flips on."),
  STEP(2, "For corrections: /admin worker-management table → change plan / reactivate / fee-waived switch → confirm in the two-step dialog."),
  STEP(3, "Every change lands in the activity feed with your identity and the before → after copy (EN + AR)."),
);

// 3.9
children.push(
  H2("3.9 Worker dashboard"),
  P("The worker's command centre: stats, bookings, requests, payouts, upgrades, and notifications."),
  ROLES("Worker (owner) · Admin (sees the same booking data in dispute/funnel views)"),
  H3("Functionality"),
  B("Stats row + profile-views chart; subscription status with the renewal dialog; verification banner (submit / resubmit); invoices; notifications bell."),
  B("Bookings panel tabs: Upcoming (rows carry the live SLA countdown + respond action + chat + print/email audit), Past (with the completion flow), Recurring."),
  B("Requests tab: REQUESTED rows with the SLA countdown; QUOTING invites render an inline bid form; QUOTED shows “awaiting the customer's decision”."),
  B("Payouts card (3.6) and the upgrade dialog (3.8)."),
  H3("Step by step"),
  STEP(1, "Sign in and open /dashboard."),
  STEP(2, "Respond to requests in the Requests tab (3.4) before the SLA expires — the countdown tells you how much time is left."),
  STEP(3, "Manage upcoming jobs: chat, print/email the audit trail, mark complete when the job is done (3.6)."),
  STEP(4, "Watch the Payouts card as balances move; withdraw when available."),
  STEP(5, "Renew your subscription or buy upgrades from the dialogs (3.8)."),
);

// 3.10
children.push(
  H2("3.10 Customer bookings page (/bookings)"),
  P("The customer's home for everything after the request: live status, deadlines, receipts, negotiation, and the audit trail."),
  ROLES("Customer (owner) · Admin (dispute view mirrors the same data)"),
  H3("Functionality"),
  B("Every booking row shows the status badge, the live SLA countdown / urgency bar, and the booking number."),
  B("Expanded row: what-happened timeline (3.7), Print + Email audit buttons, chat (3.4), invoice receipt (WA-…), confirm-completion card when staged."),
  B("Quote requests tab: one card per multi-candidate job (bids per worker, pick the winner + slot)."),
  B("Bookings match by email, phone, or signed-in customer ID — a customer who skips the optional email still sees their own jobs."),
  H3("Step by step"),
  STEP(1, "Open /bookings — your requests and quote jobs are listed with their deadlines."),
  STEP(2, "Pick a quote winner (multi-candidate) or watch a REQUESTED booking's countdown while the worker decides."),
  STEP(3, "Negotiate in the chat thread; accept a quoted price from the thread when it works (3.4)."),
  STEP(4, "Pay the deposit via OMT/Whish when required (3.5); the row flips CONFIRMED once the admin confirms."),
  STEP(5, "When the worker marks the job complete, confirm completion to release their payout (3.6)."),
  STEP(6, "Use What happened / Print / Email audit for your records or a dispute (3.7)."),
);

// 3.11
children.push(
  H2("3.11 Company dashboard & advertising"),
  P("Companies buy self-serve ad campaigns. A campaign only goes live after payment — via the same OMT / Whish manual rails — and every purchase, serve, and refund is audited."),
  ROLES("Company (creates, pays, monitors) · Admin (confirms payment, refunds, monitors) · Customer (sees the ads)"),
  H3("Functionality"),
  B("Campaign builder: 8 ad formats (banner, slider, featured card, sponsored search, sponsored category, popup, native, video), placement/category/city targeting, budget, CPM/CPC model."),
  B("Campaigns start PENDING and only go ACTIVE after payment confirm; ads then rotate on the homepage / search with impression + click tracking and spend accruing against the budget."),
  B("Company invoice list renders the real WA-* purchase receipts (paid, advertising); a refund flips the invoice to VOID (credit note)."),
  B("Notification bell with campaign-live, campaign-refunded, and duplicate-purchase alerts; email preview dialogs on the admin side."),
  H3("Step by step"),
  STEP(1, "Sign in as the company and open the dashboard; click Create campaign and configure budget, targeting, and ad type."),
  STEP(2, "The campaign is created PENDING with a Pay now button (a payment + advertising invoice are minted)."),
  STEP(3, "Click Pay now → choose OMT or Whish → pay at the agent / app with the reference (3.5 pattern)."),
  STEP(4, "Admin confirms; the campaign flips ACTIVE, the creative starts serving, and the company is notified “Campaign is live”."),
  STEP(5, "Monitor impressions / clicks / CTR / spend vs. budget on the dashboard; view invoices in the list."),
  STEP(6, "If the campaign is refunded, the invoice voids, the campaign ends, and the bell shows the refund with amount + reason."),
);

// 3.12
children.push(
  H2("3.12 Admin dashboard & operations (/admin)"),
  P("The operator's full control surface: money, trust, funnel, and audit."),
  ROLES("Admin only"),
  H3("Functionality"),
  B("KPIs, revenue chart, category bars, plan donut, top workers, search trends, alerts."),
  B("Verification queue with approve/reject (Basic / Professional tiers) and a verification funnel."),
  B("Live activity feed (structured ACTION_CODES, actor identity, EN+AR copy) + full history at /admin/activity; retention cron."),
  B("Booking funnel card (status counts REQUESTED → CONFIRMED → completed/cancelled/no-show) with the Export trails dropdown."),
  B("Platform fees card (gross / refunded / net / avg per booking over 30 days)."),
  B("Pending manual payments card (OMT/Whish confirms) and pending payouts queue."),
  B("Campaign-payments card: confirm campaign payment, refund a campaign, preview the refund email in EN/AR (the company's preferred locale leads)."),
  B("Worker management table: search, plan-tier sort, fee-waived switch, inline plan change (audited), CSV export of the current filtered view."),
  B("Dispute view per booking (3.7) with cancel / refund money actions and email previews."),
  B("Push-subscription manager and search-trends analytics."),
  H3("Step by step"),
  STEP(1, "Open /admin — scan the KPI cards and the live activity feed for anomalies."),
  STEP(2, "Confirm pending OMT/Whish payments (deposits, campaigns, upgrades) from the pending-payments card."),
  STEP(3, "Work the verification queue: approve or reject each submitted verification."),
  STEP(4, "Approve or reject payout requests in the pending-payouts queue."),
  STEP(5, "Drill into any booking via the dispute view: review the trail, chat, and email previews; cancel or refund with a reason (3.7)."),
  STEP(6, "Manage workers: fix a mis-tiered plan, reactivate an expired subscription, or export the table (3.8)."),
  STEP(7, "Audit: check /admin/activity for the full history, or export all booking trails as CSV/PDF."),
);

// 3.13
children.push(
  H2("3.13 Notifications (multi-channel)"),
  P("Every event pushes a notification through the channel(s) a recipient prefers — in the recipient's own language, not the page's."),
  ROLES("All four roles receive; Admin manages push subscriptions"),
  H3("Functionality"),
  B("In-app inbox (demo file store / Prisma Notification) with unread badges and read-state persistence."),
  B("Four outbound channels: email (console / SMTP / Resend), SMS (console / Twilio), push (console / web-push + VAPID), WhatsApp (console / Meta Cloud API) — lazy-loaded providers that never throw."),
  B("Per-recipient locale: a booking dispatched to an Arabic-speaking worker renders Arabic (title + body) even on an English page; each user's stored locale drives their channels."),
  B("Lifecycle notifications: booking requested / confirmed / paid / completion-pending / completed, request nudges and SLA expiry, quote accepted, refunds (booking + campaign), verification decisions, subscription renewals."),
  B("Subscription reminders at 7 / 3 / 1 days before expiry, then deactivation + admin alert."),
  B("Email preview dialogs on admin surfaces (refund email, receipt email) that render exactly what the recipient received, in the recipient's language."),
  H3("Step by step"),
  STEP(1, "Open the notification bell (worker / company / customer) to see unread items; open the notifications page for the full inbox."),
  STEP(2, "Mark items read — the badge decrements and the state persists."),
  STEP(3, "Admins: preview any dispatched email from the relevant admin card to verify the recipient's copy."),
);

// 3.14
children.push(
  H2("3.14 Bilingual UX & language memory"),
  P("The platform is fully bilingual (English / العربية) with RTL, and language preferences are remembered per user and per document."),
  ROLES("All roles"),
  H3("Functionality"),
  B("One-click EN/AR switch; server-side locale detection (cookie → Accept-Language); full RTL layout; Arabic font (Cairo)."),
  B("Dark mode persisted without hydration warnings."),
  B("Print / email audit documents remember the last-chosen document language (wa_print_locale) — a reset button returns to following the page locale."),
  B("Email, SMS, WhatsApp, and push dispatch in each recipient's preferred language, not the sender's page language."),
);

// 3.15
children.push(
  H2("3.15 Recurring bookings & maintenance contracts"),
  P("Repeat jobs (AC servicing, pest control, water-heater checks) can be set up once and flow automatically."),
  ROLES("Customer (creates the recurring request) · Worker (accepts once)"),
  H3("Functionality"),
  B("Repeat selector in the booking dialog: weekly / biweekly / monthly cadence with an anchor slot."),
  B("Worker accepts the contract once; future occurrences auto-materialize from the worker's availability with the same quote and take-rate."),
  B("Recurring tab on the worker Bookings panel (inline accept with quote/deposit or decline)."),
  B("Currently shipped on the demo adapter; the real-mode (Prisma) wave is the documented next step."),
  H3("Step by step"),
  STEP(1, "In the booking dialog choose a recurring cadence (weekly / biweekly / monthly) and the anchor slot."),
  STEP(2, "The worker accepts the recurring contract once (inline in their Recurring tab)."),
  STEP(3, "Future occurrences materialize as confirmed bookings; each follows the normal lifecycle (completion, payouts, audit)."),
);

// 3.16
children.push(
  H2("3.16 Installable app (PWA) & offline"),
  P("WorkersArena is an installable PWA: every page registers the service worker on first visit, the app can be added to the home screen on any device, and a bilingual offline page covers you when the network drops."),
  ROLES("All four roles (customers, workers, companies, admins) — device-level capability, no account needed to install"),
  H3("Functionality"),
  B("Installable: the web manifest (PNG icons at 192/512 + maskable, display: standalone) makes the app installable on Android, iOS, and desktop; an Arabic user's installed app opens RTL."),
  B("App shortcuts: long-press the installed icon for deep links to Search, My bookings, the Worker dashboard, and the Company dashboard."),
  B("Offline shell: the service worker precaches the app shell and serves a bilingual offline page (with a retry button) when a navigation fails — the shell works offline, live data only when online."),
  B("Web Push still rides the same service worker: notification display and click-through deep links work in the installed app."),
  H3("Step by step"),
  STEP(1, "Open any page of the app in a mobile or desktop browser — the service worker installs automatically on first visit."),
  STEP(2, "Use the browser's Add to Home Screen / Install app action; the installed app opens full-screen with its own icon."),
  STEP(3, "Long-press the installed icon to jump straight to Search, Bookings, the Worker dashboard, or the Company dashboard."),
  STEP(4, "If the network drops, failed navigations show the bilingual offline page with a Try again button instead of a browser error."),
);

// 4. Cross-party workflows
children.push(
  H1("4. Cross-party interaction workflows"),
  P("The platform is eight directed party pairs. The full sequence diagrams and revenue notes live in docs/INTERACTION-WORKFLOWS.md; the summaries below are the user-facing version."),
  H2("4.1 Customer ⇄ Worker"),
  B("Customer → Worker: search, view profile, book, request quotes (up to 3), pay deposit, reschedule / cancel, review, chat, accept a quoted price, confirm completion, create recurring contracts."),
  B("Worker → Customer: accept / decline / counter, bid in quote jobs, respond to recurring contracts, start / complete / no-show, reschedule / cancel, chat with quote sharing, WhatsApp fallback."),
  H2("4.2 Admin ⇄ Customer"),
  B("Admin → Customer: dispute timeline, export trails, email the audit PDF, cancel the booking or refund the deposit (always with a reason and an audit event)."),
  B("Customer → Admin: payments (deposits via OMT/Whish), dispute escalation (the trail they bring), requests that flow into the admin funnel."),
  H2("4.3 Admin ⇄ Worker"),
  B("Admin → Worker: verification approve / reject, inline plan changes, reactivation of expired subscriptions, payout approvals, booking cancel / refund, worker-management table + CSV export."),
  B("Worker → Admin: subscriptions and upgrades (OMT/Whish purchases awaiting confirmation), verification submissions, payout withdrawal requests, SLA-nudged requests the admin sees in the funnel."),
  H2("4.4 Admin ⇄ Company"),
  B("Admin → Company: confirm campaign payments, refund campaigns (invoice voids, campaign ends, audit + notification), email previews in the company's language."),
  B("Company → Admin: campaign creation and purchase (PENDING → paid), payment confirmations, refund requests, invoice history."),
);

// 5. Revenue
children.push(
  H1("5. Revenue generated by each party"),
  P("WorkersArena monetizes three flows. All amounts are USD; internally stored as integer minor units."),
  H2("5.1 From workers — subscriptions & upgrades (live)"),
  TABLE(
    ["Plan / add-on", "Price", "What it gates"],
    [
      ["Basic", "$29/mo", "Listing, leads"],
      ["Professional", "$59/mo", "+ boost, verified badge"],
      ["Premium", "$119/mo", "+ analytics, gallery"],
      ["Enterprise", "$299/mo", "+ emergency marker, priority support, ads — and take-rate exemption (fee waived)"],
      ["Verification — Basic", "$9", "ID check, 12-month validity, Verified badge in search"],
      ["Verification — Professional", "$19", "License + background check, Verified badge in search"],
      ["Featured slot", "$49/category/mo", "Featured placement in search + homepage"],
      ["Emergency marker", "$9/mo", "24/7 emergency visibility flag"],
    ],
    [32, 18, 50],
  ),
  B("Renewal mints an invoice; annual = 10 paid months for a 12-month term."),
  B("Expiry hides the worker from public search — the natural upsell trigger."),
  H2("5.2 From bookings — platform take rate (live)"),
  B("Rate: 7.0% (700 bps), floor $5, cap $300 per job."),
  B("Stamped once at accept-with-quote as an immutable snapshot on the booking; Enterprise is exempt (fee 0)."),
  B("Settlement: worker earnings = quote − platform fee, credited to the ledger at COMPLETED, withdrawn through the admin-reviewed payout queue."),
  B("Customers see “includes platform fee · worker receives” on the booking row; the worker sees “you receive X · platform fee Y” in the respond dialog."),
  H2("5.3 From companies — advertising (live purchase flow)"),
  B("Purchase: campaign creation → PENDING → pay (OMT/Whish) → admin confirm → ACTIVE + paid advertising invoice."),
  B("Spend model: ~$10 CPM + $1/click; spend accrues against the campaign budget."),
  B("Refunds: admin refund → invoice voids (credit note) + CAMPAIGN_REFUNDED audit + company notification."),
  H2("5.4 What the platform does NOT take"),
  B("No customer-side fees of any kind — customers pay only the worker's quote (+ deposit when required)."),
  B("No fee on deposits, no fee on quote requests / multi-candidate bidding, no charge for reviews, favorites, or leads."),
);

// 6. Identifiers
children.push(
  H1("6. Key identifiers & reference formats"),
  TABLE(
    ["Identifier", "Format", "What it is"],
    [
      ["Booking number", "BK-YYYY-NNNNN (e.g. BK-1001)", "Each booking, used everywhere (rows, dispute URLs, receipts)"],
      ["Quote request", "QR-YYYY-NNNNN", "Multi-candidate quote job container"],
      ["Invoice", "WA-YYYY-NNNNN", "Minted at confirmed payment (booking receipts, campaign purchases)"],
      ["Demo invoice", "INV-*", "Demo-adapter subscription / campaign invoices"],
      ["Payment reference", "OMT-… / WHISH-…", "Reference to pay with at the OMT agent / Whish app"],
      ["Slot", "SLOT-*", "Availability slot claimed by a booking"],
    ],
    [22, 33, 45],
  ),
);

// 7. Demo vs real
children.push(
  H1("7. Demo vs. real mode (what runs where)"),
  B("The application runs two modes behind one seam (src/lib/data/repo.ts). DEMO_MODE=true uses in-memory stores; real mode uses Prisma + PostgreSQL."),
  B("Demo mode: everything works end-to-end with seeded data — payments simulate (or use OMT/Whish instructions with admin confirm), stores reset per process."),
  B("Real mode: the same flows run against Prisma rows — cities, invoices, ad rotation, bookings, notifications, activity, payouts, and the payment rails all read/write the database."),
  B("The db:smoke script (npm run db:smoke) validates real-mode flows against a live Postgres after every schema change."),
  B("Documented production steps (Redis, Cloudinary, Sentry, argon2, email/SMS/push providers with real keys) live in docs/ARCHITECTURE.md."),
);

// ── build & write ───────────────────────────────────────────────────────────
const doc = new Document({
  creator: "WorkersArena",
  title: "WorkersArena — Application Functionalities & Step-by-Step Module Usage",
  description: "User manual covering all modules, step-by-step usage, and role responsibilities for customers, workers, companies, and admins.",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [{ properties: {}, children }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(new URL("../docs/WorkersArena-User-Manual.docx", import.meta.url), buf);
console.log("Wrote docs/WorkersArena-User-Manual.docx");
