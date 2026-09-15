import { NextResponse } from "next/server";
import {
  createQuoteRequest,
  getCustomerQuoteRequests,
  getWorkerBySlug,
  getWorkers,
  isDemoMode,
  listLeadOffers,
} from "@/lib/data/repo";
import { grantCredits } from "@/lib/data/credit-ledger";
import { dialPrefix } from "@/lib/tenant/countries";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/seed-lead-market — demo-mode-only fixture for the §7–§10 lead
 * marketplace (docs/lead-marketplace.md).
 *
 * The board is only meaningful with real offers in it, so this posts four quote
 * requests of deliberately different qualification levels — a bare bronze, a
 * detailed silver, a verified gold with photos, and an emergency — through the
 * SAME `createQuoteRequest` seam a customer uses. Distribution then grades,
 * matches and offers them exactly as production would; nothing here fabricates
 * an offer row directly, so what the seed produces is what the engine produces.
 *
 * The demo worker is granted credits so a purchase can be exercised end to end.
 *
 * Guarded by demo mode: unreachable in production (404).
 */

/*
 * Idempotency markers. The BRONZE job deliberately carries no email address —
 * an email is worth 10 grading points (docs/lead-marketplace.md §7), which
 * would push a bare "I need a plumber" request from bronze (30) to silver (40).
 * So that job is identified by its phone and the rest by their email.
 */
const SEED_EMAIL = "leads@workersarena.test";
const BRONZE_PHONE = "70 111 222";

/** Phones come from the tenant's dial prefix, never a hardcoded country code. */
const phone = (suffix: string) => `${dialPrefix()} ${suffix}`;

export async function POST() {
  if (!isDemoMode) {
    return NextResponse.json({ error: "demo-only" }, { status: 404 });
  }

  // Idempotent: a quote on either marker means this seed already ran.
  const [byEmail, byPhone] = await Promise.all([
    getCustomerQuoteRequests({ email: SEED_EMAIL }),
    getCustomerQuoteRequests({ phone: phone(BRONZE_PHONE) }),
  ]);
  const existing = [...byEmail, ...byPhone];
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, alreadySeeded: true, requests: existing.length });
  }

  const [plumbing, electrical] = await Promise.all([
    getWorkers({ category: "plumbing", city: "beirut", sort: "rating", page: 1 }),
    getWorkers({ category: "electrical", city: "beirut", sort: "rating", page: 1 }),
  ]);
  // The invite list is deliberately NOT the demo worker: an invited worker gets
  // the job for free, so inviting the only plumber would leave the marketplace
  // no one to offer the plumbing lead to. Every job below is therefore a
  // plumbing request that invites ONE colleague from a neighbouring trade (a
  // customer who knows an electrician has them look at a leak — normal enough),
  // which leaves the demo plumber as the unmatched professional the lead is
  // sold to. The demo workforce has one worker per trade, so this is the only
  // way a single-trade request can produce an offer at all.
  const invited = electrical.items.slice(0, 1);
  if (invited.length === 0 || plumbing.items.length === 0) {
    return NextResponse.json({ error: "no workers to invite" }, { status: 500 });
  }

  // One job per grade, so the board shows all four price points. The grading
  // signals are deliberately spread: trade + area only → BRONZE (30), a
  // described leak with a reachable email → SILVER (55), a verified signed-in
  // customer with a long brief → GOLD (70), and an urgent burst pipe →
  // EMERGENCY.
  const jobs = [
    {
      jobTitle: "I need a plumber",
      email: undefined as string | undefined,
      phone: phone(BRONZE_PHONE),
      name: "Rami Haddad",
      note: undefined as string | undefined,
      customerId: undefined as string | undefined,
      isEmergency: false,
    },
    {
      jobTitle: "Kitchen sink leak under the cabinet",
      email: SEED_EMAIL,
      phone: phone("71 333 444"),
      name: "Nour Salameh",
      note: "The pipe under the kitchen sink drips steadily and the cabinet floor is soaked. It started two days ago and is getting worse. Please bring a replacement trap if needed.",
      customerId: undefined as string | undefined,
      isEmergency: false,
    },
    {
      jobTitle: "Full bathroom re-pipe, verified customer",
      email: SEED_EMAIL,
      phone: phone("76 555 666"),
      name: "Karim Nassar",
      note: "Two bathrooms need new supply lines and shut-off valves before we tile. I have photos of the current layout and a budget of $600 for labour. Available weekday mornings or Saturday.",
      customerId: "u-customer",
      isEmergency: false,
    },
    {
      jobTitle: "Water heater burst — water everywhere",
      email: SEED_EMAIL,
      phone: phone("78 777 888"),
      name: "Layla Khoury",
      note: "The water heater is leaking onto the floor and I have shut the mains off. I need someone now.",
      customerId: "u-customer",
      isEmergency: true,
    },
  ];

  const created: Array<{ number: string; title: string }> = [];
  const errors: string[] = [];
  for (const job of jobs) {
    const result = await createQuoteRequest(
      {
        customerName: job.name,
        customerPhone: job.phone,
        ...(job.email ? { customerEmail: job.email } : {}),
        jobTitle: job.jobTitle,
        ...(job.note ? { note: job.note } : {}),
        ...(job.customerId ? { customerId: job.customerId } : {}),
        categorySlug: "plumbing",
        citySlug: "beirut",
        ...(job.isEmergency ? { isEmergency: true } : {}),
      },
      invited.map((w) => w.id)
    );
    if ("error" in result) {
      errors.push(`${job.jobTitle}: ${result.error}`);
      continue;
    }
    created.push({ number: result.number, title: result.jobTitle });
  }

  // Credits so the worker can buy a lead. A grant (not a purchase) because the
  // demo has no checkout, and the reason names the seed so it is auditable.
  const demoWorker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (demoWorker) {
    await grantCredits({
      workerId: demoWorker.id,
      amount: 60,
      kind: "grant",
      reason: "Demo seed — lead marketplace credits",
      createdBy: "seed",
    });
  }

  // The offers the seed produced, so a caller can see the marketplace actually
  // distributed the matches rather than trusting the request count.
  const offers = demoWorker ? await listLeadOffers(20) : [];
  return NextResponse.json({
    ok: true,
    created: created.length,
    requests: created,
    offers: offers.map((o) => ({ lead: o.leadNumber, grade: o.grade, worker: o.workerId, credits: o.priceCredits, status: o.status })),
    ...(errors.length > 0 ? { errors } : {}),
  });
}
