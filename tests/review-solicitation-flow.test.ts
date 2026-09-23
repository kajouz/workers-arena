import { beforeEach, describe, expect, it, vi } from "vitest";

// The booking + review server actions touch next/cache; the demo adapter under
// them stays real, so this suite runs the actual lifecycle rather than hand-made
// booking objects (the same approach as tests/bookings.test.ts).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));

import { ACTING } from "./helpers/acting-session";
import {
  confirmBookingCompletion,
  getBookingById,
  getCustomerBookings,
  getReviewedWorkerIdsForCustomer,
  getWorkerById,
  getWorkerBySlug,
  respondToBooking,
  transitionBooking,
} from "../src/lib/data/repo";
import { submitReviewAction } from "../src/app/actions/auth";
import { listReviewQueue } from "../src/lib/data/review-moderation-store";
import { demoSeedCompletedBookingForCustomer } from "../src/lib/data/bookings";
import { pendingSolicitations, solicitationDecision } from "../src/lib/data/review-solicitation";

/**
 * §Review solicitation (docs/review-solicitation.md) — the wiring, not just the
 * engine: a job completed NOW must ask, the ask must disappear once the review
 * exists, and the review it produces must be a verified purchase (which is what
 * the profiles and the landing pages claim).
 *
 * The demo store is per-process, so the cases below share it. Every one of them
 * is written to hold in any order: they either use the booking that never
 * completes (bk-1002) or go through `ensureCompleted`, which completes bk-1001
 * once and returns it thereafter.
 */

const customer = ACTING.customer;

/** Drive bk-1001 (Sara's seeded booking with Khaled) to completed, as the app does. */
async function ensureCompleted() {
  const existing = await getBookingById("bk-1001");
  if (existing?.status === "completed") return existing;

  getSessionMock.mockResolvedValue(ACTING.worker);
  await respondToBooking("bk-1001", { accept: true });
  await transitionBooking("bk-1001", "inProgress");
  await transitionBooking("bk-1001", "completed"); // staged — completionPending
  getSessionMock.mockResolvedValue(customer);
  const done = await confirmBookingCompletion("bk-1001");
  expect(done?.status).toBe("completed");
  return done!;
}

/**
 * The rows the bookings page builds: the booking plus its worker's reviews. The
 * `hasReview` test is the page's own (author id + worker), so this exercises the
 * real decision input rather than an assumption about it.
 */
async function rowsForCustomer() {
  const bookings = await getCustomerBookings({ customerId: customer.id });
  // The page's own source for "already reviewed" — the pending-inclusive seam,
  // NOT the workers' public reviews (which hide an unapproved review).
  const reviewed = new Set(await getReviewedWorkerIdsForCustomer(customer.id));
  const rows = [];
  for (const booking of bookings) {
    const worker = await getWorkerById(booking.workerId);
    rows.push({
      bookingId: booking.id,
      status: booking.status,
      completedAt: booking.events.find((e) => e.status === "completed")?.time ?? null,
      hasReview: reviewed.has(booking.workerId),
      workerSlug: worker?.slug ?? "",
      workerId: booking.workerId,
    });
  }
  return rows;
}

async function review(workerId: string, text: string) {
  const formData = new FormData();
  formData.set("rating", "5");
  formData.set("name", "Sara Customer");
  formData.set("text", text);
  return submitReviewAction(workerId, formData);
}

describe("review solicitation — end to end against the real booking lifecycle", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue(customer);
  });

  it("asks about a completed job and stays quiet about one from last season", async () => {
    await ensureCompleted();

    // A job completed 45 days ago — the same fixture seam the demo-mode seed
    // route uses. Same customer, same completed state, no ask: the window.
    const khaled = await getWorkerBySlug("khaled-al-harbi-plumbing");
    demoSeedCompletedBookingForCustomer({
      id: "bk-0991",
      number: "BK-0991",
      workerId: khaled!.id,
      customerId: customer.id,
      customerName: "Sara Customer",
      customerPhone: "+961 70 000 000",
      customerEmail: "sara@example.com",
      jobTitle: "Old sink repair",
    });

    const rows = await rowsForCustomer();
    const asked = pendingSolicitations(rows);
    expect(asked.map((a) => a.candidate.bookingId)).toContain("bk-1001");

    const stale = rows.find((r) => r.bookingId === "bk-0991");
    expect(stale).toBeTruthy();
    expect(stale!.status).toBe("completed");
    expect(
      solicitationDecision({ status: stale!.status, completedAt: stale!.completedAt, hasReview: false })
    ).toMatchObject({ ask: false, reason: "window-passed" });
    expect(asked.map((a) => a.candidate.bookingId)).not.toContain("bk-0991");

    // Completed seconds ago: the completion-time ask, not the reminder.
    const a = asked.find((x) => x.candidate.bookingId === "bk-1001")!;
    expect(a.stage).toBe("first");
    expect(a.daysSinceCompletion).toBe(0);
  });

  it("stops asking once the review exists, and records it as a verified purchase", async () => {
    const completed = await ensureCompleted();

    const res = await review(completed.workerId, "Khaled fixed the leak the same day and cleaned up after — recommended.");
    expect(res.ok).toBe(true);

    // The review is PENDING (moderation publishes it) — and it already counts as
    // "reviewed", so the prompt stops before an admin has touched it. The public
    // profile does NOT show it yet, which is why the seam is the ask's source.
    expect(res.pending).toBe(true);
    expect(await getReviewedWorkerIdsForCustomer(customer.id)).toContain(completed.workerId);
    expect((await getWorkerById(completed.workerId))?.reviews.some((r) => r.author === "Sara Customer")).toBe(false);

    // Where the review actually waits: the moderation queue, which carries the
    // verified flag the profile will publish.
    const queue = await listReviewQueue("pending");
    const written = queue.find((item) => item.workerId === completed.workerId && item.author === "Sara Customer");
    expect(written).toBeTruthy();
    // The claim the profiles and the landing pages make: this customer did
    // complete a booking with this worker, so the review IS a verified purchase.
    expect(written?.verifiedPurchase).toBe(true);

    const rows = await rowsForCustomer();
    expect(rows.find((r) => r.bookingId === "bk-1001")?.hasReview).toBe(true);
    expect(pendingSolicitations(rows).map((x) => x.candidate.bookingId)).not.toContain("bk-1001");
  });

  it("does NOT call a review verified when the customer never booked that worker", async () => {
    const stranger = await getWorkerBySlug("omar-al-mutairi-ac-technician");
    expect(stranger).toBeTruthy();

    const res = await review(stranger!.id, "Quick response and a clear explanation before starting the work.");
    expect(res.ok).toBe(true);

    const written = (await listReviewQueue("pending")).find(
      (item) => item.workerId === stranger!.id && item.author === "Sara Customer"
    );
    expect(written).toBeTruthy();
    expect(written?.verifiedPurchase).toBe(false);
    // They still count as reviewed for THIS worker — the flag is about proof of
    // purchase, not about whether the customer acted.
    expect(await getReviewedWorkerIdsForCustomer(customer.id)).toContain(stranger!.id);
  });
});
