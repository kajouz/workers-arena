/*
 * Live-PostgreSQL smoke for payment workflow v2 (docs/PAYMENTS.md §Workflow v2,
 * docs/PAYMENT-COMMS-ACCOUNTING-PLAN.md §1–§3).
 *
 *   npm run db:smoke        # runs smoke-prisma.ts, then this file
 *
 * Proves, against a real migrated + seeded database (the Prisma adapters, not
 * the demo stores):
 *  - D1: a job paid deposit + balance credits the worker EXACTLY the net —
 *    one EARNING plus one top-up ADJUSTMENT on the same booking (the old
 *    unique index on bookingId made the top-up impossible);
 *  - D2: an OMT credit-pack top-up appears in the admin pending queue and
 *    confirms (credits granted, invoice minted);
 *  - D4: concurrent invoice-number claims never collide;
 *  - evidence-based confirmation: receipt → amount + transaction number →
 *    confirmed, receipt frozen, audit rows written; a reused transaction
 *    number is refused; four-eyes waits for a different admin; a short
 *    payment stays pending;
 *  - a cancelled paid OMT deposit is booked as a refund DUE, then SENT;
 *  - an unpaid deposit past its deadline is lapsed (booking cancelled, slot
 *    released) by the expiry sweep;
 *  - guest deposits and job balances get WA- invoices with a bill-to snapshot.
 * Every row it creates is removed at the end. Exits non-zero on any failure.
 */
process.env.DEMO_MODE = "false";

const RECEIPT =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  // Dynamic imports: repo.ts decides its adapter at module load, so the env
  // must be set before the data layer is evaluated.
  const { getPrisma } = await import("../src/lib/server/prisma");
  const repo = await import("../src/lib/data/prisma-repo");
  const engine = await import("../src/lib/data/payment-workflow-engine");
  const store = await import("../src/lib/data/payment-workflow-store");
  const receipts = await import("../src/lib/data/payment-receipts");
  const { claimInvoiceNumber } = await import("../src/lib/data/invoice-numbering");
  const prisma = getPrisma();

  const khaled = await prisma.worker.findFirst({ where: { slug: { contains: "khaled" } } });
  if (!khaled) throw new Error("seeded worker khaled not found — run npm run db:seed");

  const created = { bookings: [] as string[], slots: [] as string[], payments: [] as string[], refs: [] as string[] };
  // Real admin accounts: the seeded admin, and a temporary second admin for
  // the four-eyes step (the activity log references User rows).
  const seededAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!seededAdmin) throw new Error("seeded admin user not found — run npm run db:seed");
  const second = await prisma.user.create({
    data: { email: `smoke-finance-${Date.now()}@workersarena.test`, name: "Smoke Finance", role: "ADMIN" },
  });
  const ADMIN = { id: seededAdmin.id, name: seededAdmin.name ?? "Platform Admin" };
  const ADMIN_2 = { id: second.id, name: "Smoke Finance" };
  const run = Date.now().toString(36).toUpperCase();
  let txn = 0;
  const nextTxn = () => `SMK${run}${(txn += 1)}`;
  let hourOffset = 24 * 40 + Math.floor(Math.random() * 500);

  async function slot(): Promise<string> {
    hourOffset += 3;
    const start = new Date(Date.now() + hourOffset * 60 * 60 * 1000);
    start.setUTCMinutes(0, 0, 0);
    const s = await prisma.bookingSlot.create({
      data: { workerId: khaled!.id, startAt: start, endAt: new Date(start.getTime() + 3_600_000), status: "AVAILABLE", note: "smoke-pwf" },
    });
    created.slots.push(s.id);
    return s.id;
  }

  async function depositBooking(quote: number, deposit: number, phone = "+961 70 999 000") {
    const b = await repo.prismaCreateBookingRequest({
      workerId: khaled!.id,
      slotId: await slot(),
      customerName: "Smoke Guest",
      customerPhone: phone,
      customerEmail: "smoke-guest@workersarena.test",
      jobTitle: "Payment workflow smoke",
    });
    if ("error" in b) throw new Error(`create booking: ${b.error}`);
    created.bookings.push(b.id);
    const accepted = await repo.prismaRespondToBooking(b.id, { accept: true, quote, deposit });
    assert(accepted?.status === "pendingPayment", `accept with $${deposit / 100} deposit → PENDING_PAYMENT`);
    return accepted!;
  }

  async function openReference(bookingId: string) {
    const checkout = await repo.prismaCreateBookingCheckout(bookingId, "OMT");
    if (!checkout) throw new Error("checkout");
    const p = (await repo.prismaGetPendingManualPayments()).find((x) => x.entityId === bookingId && x.leg !== "settlement");
    if (!p) throw new Error("pending reference not listed");
    created.payments.push(p.id);
    created.refs.push(p.reference);
    return p;
  }

  try {
    console.log("D4 — race-free invoice numbering");
    const numbers = await Promise.all(Array.from({ length: 12 }, () => prisma.$transaction((tx) => claimInvoiceNumber(tx))));
    assert(new Set(numbers).size === numbers.length, "12 concurrent claims → 12 distinct WA- numbers");

    console.log("Evidence-based confirm (receipt + amount + transaction number)");
    const b1 = await depositBooking(8_000, 3_000);
    const r1 = await openReference(b1.id);
    await receipts.savePaymentReceipt({ reference: r1.reference, provider: "OMT", dataUrl: RECEIPT });
    const t1 = nextTxn();
    const c1 = await engine.recordManualPayment({ paymentId: r1.id, amountMinor: 3_000, txnId: t1, actor: ADMIN });
    assert(c1.ok && c1.outcome === "confirmed", "exact amount with a receipt confirms at once");
    const b1Row = await prisma.booking.findUnique({ where: { id: b1.id }, include: { payment: { include: { invoice: true } } } });
    assert(b1Row?.status === "CONFIRMED" && b1Row.payment?.status === "PAID", "booking CONFIRMED, payment PAID");
    assert(b1Row?.payment?.invoice?.billToPhone === "+961 70 999 000" && b1Row.payment.invoice.userId === null, "guest deposit invoiced with a bill-to snapshot");
    assert(await receipts.isPaymentReceiptLocked(r1.reference), "receipt frozen after confirm");
    assert((await prisma.paymentAuditEvent.count({ where: { paymentId: r1.id } })) >= 2, "audit trail rows written");

    console.log("D1 — deposit + balance credits the worker exactly once each");
    await repo.prismaTransitionBooking(b1.id, "inProgress");
    await repo.prismaTransitionBooking(b1.id, "completed");
    await repo.prismaConfirmBookingCompletion(b1.id);
    const afterDeposit = await prisma.workerLedgerEntry.findMany({ where: { bookingId: b1.id } });
    assert(afterDeposit.length === 1 && afterDeposit[0]!.kind === "EARNING", "the deposit credits ONE EARNING");
    const balanceCheckout = await repo.prismaCreateBookingSettlementCheckout(b1.id, "OMT");
    assert(balanceCheckout !== null, "balance reference minted");
    const leg = (await repo.prismaGetPendingManualPayments()).find((x) => x.entityId === b1.id && x.leg === "settlement")!;
    created.payments.push(leg.id);
    created.refs.push(leg.reference);
    await receipts.savePaymentReceipt({ reference: leg.reference, provider: "OMT", dataUrl: RECEIPT });
    const c2 = await engine.recordManualPayment({ paymentId: leg.id, amountMinor: leg.amount, txnId: nextTxn(), actor: ADMIN });
    assert(c2.ok && c2.outcome === "confirmed", "balance confirmed with evidence");
    const ledger = await prisma.workerLedgerEntry.findMany({ where: { bookingId: b1.id }, orderBy: { createdAt: "asc" } });
    const settlement = await repo.prismaSettlementFor(b1.id);
    assert(ledger.length === 2 && ledger[1]!.kind === "ADJUSTMENT", "the balance tops it up with ONE ADJUSTMENT");
    assert(
      ledger.reduce((s, e) => s + e.amount, 0) === settlement!.workerNetTargetMinor,
      `worker credited exactly the net (${settlement!.workerNetTargetMinor})`
    );
    const balanceInvoice = await prisma.invoice.findUnique({ where: { paymentId: leg.id } });
    assert(balanceInvoice?.number.startsWith("WA-") === true, "the job balance gets its own WA- invoice");

    console.log("Duplicate transaction numbers and four-eyes");
    const b2 = await depositBooking(30_000, 25_000, "+961 70 999 001");
    const r2 = await openReference(b2.id);
    await receipts.savePaymentReceipt({ reference: r2.reference, provider: "OMT", dataUrl: RECEIPT });
    const dup = await engine.recordManualPayment({ paymentId: r2.id, amountMinor: 25_000, txnId: t1, actor: ADMIN });
    assert(!dup.ok && dup.error === "duplicate-txn", "a transaction number already used is refused");
    const big = await engine.recordManualPayment({ paymentId: r2.id, amountMinor: 25_000, txnId: nextTxn(), actor: ADMIN });
    assert(big.ok && big.outcome === "awaiting-approval", "$250 waits for a second admin");
    assert((await prisma.booking.findUnique({ where: { id: b2.id } }))?.status === "PENDING_PAYMENT", "nothing activates before approval");
    const waiting = (await store.listTranches({ paymentId: r2.id, status: "pending-approval" }))[0]!;
    const self = await engine.approveTranche(waiting.id, ADMIN);
    assert(!self.ok && self.error === "same-admin", "the recording admin cannot approve their own entry");
    const approved = await engine.approveTranche(waiting.id, ADMIN_2);
    assert(approved.ok && approved.outcome === "confirmed", "a different admin approves → confirmed");

    console.log("Refund due → sent");
    const cancelled = await repo.prismaCancelBooking(b2.id, { by: "customer", reason: "smoke" });
    assert(cancelled !== null, "customer cancels the paid booking");
    // The repo seam books this automatically after a cancel; the smoke calls
    // the adapter directly, so it books the refund through the engine.
    await engine.bookRefundDue({ paymentId: r2.id, amountMinor: 25_000, label: "smoke refund", reference: r2.reference, method: "OMT" });
    assert((await store.listRefundsDue()).some((r) => r.paymentId === r2.id), "refund is DUE (money has not left)");
    const sent = await engine.sendRefund({ paymentId: r2.id, txnId: nextTxn(), actor: ADMIN });
    assert(sent.ok, "finance records the refund transfer");
    const r2Row = await prisma.payment.findUnique({ where: { id: r2.id } });
    assert(r2Row?.refundState === "sent" && r2Row.refundTxnId !== null, "refund SENT with its transfer number");

    console.log("Short payment stays pending");
    const b3 = await depositBooking(9_000, 4_000, "+961 70 999 002");
    const r3 = await openReference(b3.id);
    await receipts.savePaymentReceipt({ reference: r3.reference, provider: "OMT", dataUrl: RECEIPT });
    const short = await engine.recordManualPayment({ paymentId: r3.id, amountMinor: 1_500, txnId: nextTxn(), actor: ADMIN });
    assert(short.ok && short.outcome === "partial" && short.remainingMinor === 2_500, "$15 of $40 → partial, $25 remaining");
    assert((await prisma.booking.findUnique({ where: { id: b3.id } }))?.status === "PENDING_PAYMENT", "a short payment activates nothing");

    console.log("Unpaid deposit lapses at its deadline");
    const b4 = await depositBooking(5_000, 2_000, "+961 70 999 003");
    const b4Slot = created.slots[created.slots.length - 1]!;
    const sweep = await engine.runPaymentExpirySweep(new Date(Date.now() + 26 * 60 * 60 * 1000));
    assert(sweep.depositsExpired >= 1, "the expiry sweep lapses the unpaid deposit");
    const b4Row = await prisma.booking.findUnique({ where: { id: b4.id } });
    assert(b4Row?.status === "CANCELLED" && b4Row.cancelReason === engine.PAYMENT_TIMEOUT_REASON, "booking cancelled for payment timeout");
    assert((await prisma.bookingSlot.findUnique({ where: { id: b4Slot } }))?.status === "AVAILABLE", "the slot is released");
    assert((await prisma.booking.findUnique({ where: { id: b3.id } }))?.status === "PENDING_PAYMENT", "a deposit with money recorded is never lapsed");

    console.log("D2 — OMT credit top-up reaches the admin queue and confirms");
    const top = await repo.prismaCreatePurchaseCheckout({
      workerSlug: khaled.slug,
      scope: "credit",
      creditPackage: { id: "starter", credits: 10, bonusCredits: 0, priceUsd: 10 },
      method: "OMT",
    });
    assert(top !== null, "credit top-up reference minted");
    created.payments.push(top!.paymentId);
    const queued = (await repo.prismaGetPendingManualPayments()).find((p) => p.id === top!.paymentId);
    assert(queued?.scope === "credit", "the credit top-up is IN the admin pending queue");
    created.refs.push(queued!.reference);
    await receipts.savePaymentReceipt({ reference: queued!.reference, provider: "OMT", dataUrl: RECEIPT });
    const credit = await engine.recordManualPayment({ paymentId: top!.paymentId, amountMinor: 1_000, txnId: nextTxn(), actor: ADMIN });
    assert(credit.ok && credit.outcome === "confirmed", "the top-up confirms");
    assert((await prisma.workerCreditEntry.count({ where: { workerId: khaled.id, promotionId: { contains: top!.paymentId } } })) >= 1, "credits granted");
    assert((await prisma.invoice.findUnique({ where: { paymentId: top!.paymentId } })) !== null, "the top-up is invoiced");

    console.log("✅ PAYMENT WORKFLOW SMOKE OK");
  } finally {
    // Cleanup — every row this run created.
    await prisma.workerLedgerEntry.deleteMany({ where: { bookingId: { in: created.bookings } } });
    await prisma.workerCreditEntry.deleteMany({ where: { promotionId: { in: created.payments.map((p) => p) } } }).catch(() => {});
    for (const id of created.payments) {
      await prisma.workerCreditEntry.deleteMany({ where: { promotionId: { contains: id } } }).catch(() => {});
    }
    await prisma.paymentAuditEvent.deleteMany({ where: { paymentId: { in: created.payments } } });
    await prisma.paymentTranche.deleteMany({ where: { paymentId: { in: created.payments } } });
    await prisma.paymentReceipt.deleteMany({ where: { reference: { in: created.refs } } });
    await prisma.invoice.deleteMany({ where: { paymentId: { in: created.payments } } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: created.bookings } } });
    await prisma.booking.deleteMany({ where: { id: { in: created.bookings } } });
    await prisma.payment.deleteMany({ where: { id: { in: created.payments } } });
    await prisma.bookingSlot.deleteMany({ where: { id: { in: created.slots } } });
    await prisma.paymentAuditEvent.deleteMany({ where: { action: "payment.expired", actorName: "system", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
    await prisma.activityLog.deleteMany({ where: { actorId: second.id } });
    await prisma.user.delete({ where: { id: second.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
