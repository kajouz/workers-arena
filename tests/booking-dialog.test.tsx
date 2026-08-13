// @vitest-environment jsdom
/**
 * BookingDialog flow test (docs/booking-customer-ui.md §5.1): walks the
 * service → slot → details steps and asserts the M4 cancellation/refund
 * disclosure renders on the final step with the interpolated {hours} constant.
 * The RespondDialog test in this folder covers the take-rate split; the i18n
 * parity test covers EN/AR — so this locks the step flow in one locale.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingDialog } from "@/components/worker/booking-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { BookingSlot, Worker } from "@/lib/data/types";

// next/navigation — submit() calls router.refresh() on a slot-taken conflict;
// not exercised here (these tests never submit).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The server action is mocked — these tests assert what the customer SEES
// through the three steps, not what the action persists.
vi.mock("@/app/actions/bookings", () => ({
  requestBookingAction: vi.fn(async () => ({ ok: true })),
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup — unmount
// between tests or the Radix dialog portals leak into the next case.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Deterministic clock — the live countdown derives from Date.now() (the SLA
// expiry is the selected slot's start capped at the 48h window), so a fixed
// "now" makes the asserted countdown text stable regardless of run time.
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));

const worker = {
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  currency: "SAR",
  subscription: { plan: "premium", status: "active" },
  services: [
    { nameEn: "AC Repair", nameAr: "إصلاح مكيف", price: 150, unit: "job" },
    { nameEn: "Plumbing", nameAr: "سباكة", price: 100, unit: "hour" },
  ],
} as unknown as Worker;

// Enterprise — exempt from the platform fee (docs/booking-take-rate.md §5).
const enterpriseWorker = {
  ...worker,
  subscription: { plan: "enterprise", status: "active" },
} as unknown as Worker;

/** An AVAILABLE 1h slot starting at the given local hour tomorrow. */
function makeSlot(id: string, startHour: number): BookingSlot {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(startHour, 0, 0, 0);
  return {
    id,
    workerId: worker.id,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3_600_000).toISOString(),
    status: "available",
  };
}

const slots = [makeSlot("s1", 9), makeSlot("s2", 14)];

function renderDialog(workerForDialog: Worker = worker) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <BookingDialog worker={workerForDialog} slots={slots}>
        <button type="button">Request booking</button>
      </BookingDialog>
    </LocaleProvider>
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Request booking" }));
}

describe("BookingDialog step flow", () => {
  it("walks service → slot → details and shows the cancellation policy on the final step", () => {
    renderDialog();
    openDialog();

    // Step 1 — service: the custom-job card and the job-title input render.
    expect(screen.getByText("Describe the job yourself")).toBeInTheDocument();
    const jobTitle = screen.getByLabelText("Job title");
    expect(jobTitle).toBeInTheDocument();

    // Picking a service fills the job title and enables Next.
    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    expect(jobTitle).toHaveValue("AC Repair");

    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    // Step 2 — slot: the available-times heading and the slot chips render.
    expect(screen.getByText("Available times")).toBeInTheDocument();
    const slotChip = screen.getByRole("button", { name: "09:00 – 10:00" });
    fireEvent.click(slotChip);
    expect(slotChip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Step 3 — details: the customer fields render…
    expect(screen.getByText("Your name")).toBeInTheDocument();
    expect(screen.getByText("Email (optional)")).toBeInTheDocument();

    // …and the cancellation/refund disclosure shows the policy constant
    // interpolated (BOOKING_CANCEL_REFUND_WINDOW_MS → 24 hours), so the copy
    // the customer commits to can never drift from bookingCancelRefundDue.
    expect(screen.getByText("Cancellation & refunds")).toBeInTheDocument();
    expect(
      screen.getByText(/more than 24 hours before the start, you get a full refund/)
    ).toBeInTheDocument();
    expect(screen.getByText(/within 24 hours the deposit is kept/)).toBeInTheDocument();

    // …and the §2.2 request-SLA disclosure shows a LIVE countdown derived from
    // the selected slot (its start capped at the 48h window — the earliest the
    // request can auto-cancel, since no booking row exists yet).
    expect(screen.getByText("Request auto-expiry")).toBeInTheDocument();
    expect(
      screen.getByText(/Auto-cancels in \d+h \d+m if the worker doesn't respond/)
    ).toBeInTheDocument();
  });

  it("does not show the cancellation policy before the details step", () => {
    renderDialog();
    openDialog();

    // On the service step the disclosures must be absent — they only appear on
    // the final step, right before the request is sent.
    expect(screen.queryByText("Cancellation & refunds")).not.toBeInTheDocument();
    expect(screen.queryByText(/more than 24 hours/)).not.toBeInTheDocument();
    expect(screen.queryByText("Request auto-expiry")).not.toBeInTheDocument();
    expect(screen.queryByText(/Auto-cancels in/)).not.toBeInTheDocument();
  });

  it("shows the fee-waiver note on the details step for an Enterprise worker", () => {
    renderDialog(enterpriseWorker);
    openDialog();

    // Not on the earlier steps — the perk is confirmed at the point of commit.
    expect(screen.queryByText("Fee waived by the worker's plan")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00 – 10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // The summary step carries the waiver note next to the cancel policy — the
    // SAME copy (booking.feeWaivedNote) the booking row shows afterwards.
    expect(screen.getByText("Fee waived by the worker's plan")).toBeInTheDocument();
    expect(screen.getByText("Cancellation & refunds")).toBeInTheDocument();
    expect(screen.getByText("Request auto-expiry")).toBeInTheDocument();
  });
});
