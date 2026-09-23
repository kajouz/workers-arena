// @vitest-environment jsdom
/**
 * BookingDialog flow test (docs/booking-customer-ui.md §5.1): walks the
 * service → slot → details steps and asserts the M4 cancellation/refund
 * disclosure renders on the final step with the interpolated {hours} constant.
 * The RespondDialog test in this folder covers the take-rate split; the i18n
 * parity test covers EN/AR — so this locks the step flow in one locale.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingDialog } from "@/components/worker/booking-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { BookingSlot, Worker } from "@/lib/data/types";

// next/navigation — submit() calls router.refresh() on a slot-taken conflict;
// not exercised here (these tests never submit).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The server actions are mocked — these tests assert what the customer SEES
// through the three steps, not what the action persists.
vi.mock("@/app/actions/bookings", () => ({
  requestBookingAction: vi.fn(async () => ({ ok: true })),
  instantBookAction: vi.fn(async () => ({ ok: true })),
}));

import {
  instantBookAction,
  requestBookingAction,
} from "@/app/actions/bookings";

const instantBookActionMock = vi.mocked(instantBookAction);
const requestBookingActionMock = vi.mocked(requestBookingAction);

// vitest `globals` is off, so RTL cannot auto-register its cleanup — unmount
// between tests or the Radix dialog portals leak into the next case.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Deterministic clock per test — the live countdown derives from Date.now()
// (the SLA expiry is the selected slot's start capped at the 48h window), so a
// fixed "now" makes the asserted countdown text stable regardless of run time.
// Re-applied in beforeEach because afterEach() reverts to real timers, and
// without the fake clock the ticking test's real Date.now() would see the
// "tomorrow 09:00" fixture slot as already past (0m — nothing to decrement).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

const worker = {
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  currency: "USD",
  subscription: { plan: "premium", status: "active" },
  services: [
    { nameEn: "AC Repair", nameAr: "إصلاح مكيف", price: 150, unit: "job" },
    { nameEn: "Plumbing", nameAr: "سباكة", price: 100, unit: "hour" },
  ],
} as unknown as Worker;

// Business — reduced 4% platform fee (docs/fee-rules.md).
const enterpriseWorker = {
  ...worker,
  subscription: { plan: "enterprise", status: "active" },
} as unknown as Worker;

/**
 * §Instant booking (Phase 2) — a worker selling a published fixed price. The
 * first package is the fixed-price job; the hourly item is the trap: a rate is
 * not a total, so it must never be sold outright.
 */
const instantWorker = {
  ...worker,
  instantBook: true,
  services: [
    { nameEn: "AC Repair", nameAr: "إصلاح مكيف", price: 150, unit: "job", fixedPrice: true },
    { nameEn: "Plumbing", nameAr: "سباكة", price: 100, unit: "hour", fixedPrice: true },
  ],
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

/**
 * Opens the dialog and lets the open-time availability refresh settle. The
 * dialog now fetches /api/workers/[slug]/slots when it opens (the profile page
 * is prerendered, so its slots prop is a build-time snapshot) and hides the
 * slot picker until that settles — in jsdom the relative fetch rejects
 * immediately, which is exactly the failure path the SSR prop covers.
 */
async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Request booking" }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BookingDialog step flow", () => {
  it("walks service → slot → details and shows the cancellation policy on the final step", async () => {
    renderDialog();
    await openDialog();

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

    // …and the urgency bar mirrors the worker dialog's: at step entry the
    // window is untouched (captured == now), so it's 100% full and green.
    const bar = screen.getByRole("progressbar", { name: "Request auto-expiry" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.firstElementChild).toHaveClass("bg-emerald-500");
  });

  it("the SLA countdown ticks down against its captured expiry", async () => {
    renderDialog();
    await openDialog();

    // Walk to the details step and read the countdown — the expiry is captured
    // once on entry (fixed system time: 48h 0m for a slot past the window).
    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00 – 10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const readCountdown = () => {
      const m = screen.getByText(/Auto-cancels in/).textContent?.match(/(\d+)h (\d+)m/);
      if (!m) throw new Error("countdown text missing");
      return { hours: Number(m[1]), minutes: Number(m[2]) };
    };
    const before = readCountdown();
    const beforeTotal = before.hours * 60 + before.minutes;

    // Advance well past a 30s tick. A bare 31s would NOT flip the display: the
    // expiry is captured on entering the step, so ~31s later only ~30s have
    // elapsed and Math.ceil keeps the same minute. 61s guarantees a visible
    // decrement — proving the clock is alive rather than a static render (the
    // bug it locks: recomputing the expiry from a moving `now` pinned the
    // countdown at 48h 0m forever).
    act(() => {
      vi.advanceTimersByTime(61_000); // two interval ticks → setNow
    });

    const after = readCountdown();
    const afterTotal = after.hours * 60 + after.minutes;
    expect(afterTotal).toBeLessThan(beforeTotal);
    expect(beforeTotal - afterTotal).toBeGreaterThanOrEqual(1);
    expect(afterTotal).toBeGreaterThanOrEqual(0);
  });

  it("pulses the urgency bar red once the deadline is past 20%", async () => {
    renderDialog();
    await openDialog();

    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00 – 10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const fill = () => screen.getByRole("progressbar").firstElementChild as HTMLElement;

    // Full window at entry — green, no pulse.
    expect(fill()).toHaveClass("bg-emerald-500");
    expect(fill()).not.toHaveClass("animate-pulse-soft");

    // Advance past the 48h cap — the expiry is min(slotStart, capture+48h), so
    // it can never exceed capture+48h; 50h always exhausts it (the fixture slot
    // is real-date "tomorrow", which drifts, so only the cap is trustworthy).
    // The bar hits 0% → red and pulses softly.
    act(() => {
      vi.advanceTimersByTime(50 * 3_600_000);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(fill()).toHaveClass("bg-red-500");
    expect(fill()).toHaveClass("animate-pulse-soft");
  });

  it("does not show the cancellation policy before the details step", async () => {
    renderDialog();
    await openDialog();

    // On the service step the disclosures must be absent — they only appear on
    // the final step, right before the request is sent.
    expect(screen.queryByText("Cancellation & refunds")).not.toBeInTheDocument();
    expect(screen.queryByText(/more than 24 hours/)).not.toBeInTheDocument();
    expect(screen.queryByText("Request auto-expiry")).not.toBeInTheDocument();
    expect(screen.queryByText(/Auto-cancels in/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("does not show a fee-waiver note for a Business worker on the reduced-rate plan", async () => {
    renderDialog(enterpriseWorker);
    await openDialog();

    // Not on the earlier steps — the perk is confirmed at the point of commit.
    expect(screen.queryByText("Fee waived by the worker's plan")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00 – 10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Business is discounted, not exempt, so no waiver note is shown.
    expect(screen.queryByText("Fee waived by the worker's plan")).not.toBeInTheDocument();
    expect(screen.getByText("Cancellation & refunds")).toBeInTheDocument();
    expect(screen.getByText("Request auto-expiry")).toBeInTheDocument();
  });
});

describe("BookingDialog instant booking", () => {
  beforeEach(() => {
    instantBookActionMock.mockClear();
    requestBookingActionMock.mockClear();
  });

  /** Walk the three steps picking `serviceName` on the 09:00 slot. */
  async function walkToDetails(workerForDialog: Worker, serviceName: string) {
    renderDialog(workerForDialog);
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(serviceName) }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "09:00 – 10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }

  it("badges the instant-bookable package on the service step only", async () => {
    renderDialog(instantWorker);
    await openDialog();

    // One package is sellable outright; the hourly item is not. The badge is
    // the discovery half of the feature — a customer who never notices instant
    // booking simply books the slow way.
    expect(screen.getAllByText("Instant")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /AC Repair/ })).toHaveTextContent("Instant");
    expect(screen.getByRole("button", { name: /Plumbing/ })).not.toHaveTextContent("Instant");
  });

  it("offers the published price as a one-tap buy, keeping the request path", async () => {
    await walkToDetails(instantWorker, "AC Repair");

    const buy = screen.getByRole("button", { name: /Book instantly — \$150/ });
    // The customer can still negotiate instead — the instant path is primary,
    // not exclusive.
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeInTheDocument();
    expect(screen.getByText(/Payable now, at the published price/)).toBeInTheDocument();

    // The details fields are labelled visually (no `htmlFor`), so address them
    // as what they are: the first two text inputs on the step.
    const boxes = screen.getAllByRole("textbox");
    fireEvent.change(boxes[0]!, { target: { value: "Nadia Haddad" } });
    fireEvent.change(boxes[1]!, { target: { value: "70123456" } });
    fireEvent.click(buy);
    await act(async () => {
      await Promise.resolve();
    });

    expect(instantBookActionMock).toHaveBeenCalledTimes(1);
    expect(requestBookingActionMock).not.toHaveBeenCalled();
    const [slug, payload] = instantBookActionMock.mock.calls[0]!;
    expect(slug).toBe(instantWorker.slug);
    expect((payload as FormData).get("serviceItemName")).toBe("AC Repair");
    // Accepted with no checkout offered (the manual rails) — confirmed, so the
    // customer is told so rather than left waiting on a request.
    // Fake timers are installed, so `findBy*` would never advance — the click's
    // flush inside `act` is enough for the confirmation to be on screen.
    expect(screen.getByText("Booked and confirmed!")).toBeInTheDocument();
  });

  it("never sells an hourly rate outright, even at a fixed price", async () => {
    await walkToDetails(instantWorker, "Plumbing");

    // `fixedPrice: true` on an hourly item is still a RATE. Charging it as a
    // total would overcharge the customer, so the unit decides.
    expect(screen.queryByRole("button", { name: /Book instantly/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeInTheDocument();
  });

  it("stays off for a worker who has not opted in", async () => {
    const optedOut = { ...instantWorker, instantBook: false } as unknown as Worker;
    await walkToDetails(optedOut, "AC Repair");

    expect(screen.queryByRole("button", { name: /Book instantly/ })).not.toBeInTheDocument();
    expect(screen.queryAllByText("Instant")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeInTheDocument();
  });

  it("refuses a slot inside the minimum lead time, falling back to a request", async () => {
    // 30 minutes out — inside INSTANT_BOOK_MIN_LEAD_MINUTES (120). The picker
    // still offers the slot as a REQUEST: it is bookable, just not instantly.
    const soon = new Date(Date.now() + 30 * 60_000);
    const soonSlot: BookingSlot = {
      id: "soon",
      workerId: instantWorker.id,
      startAt: soon.toISOString(),
      endAt: new Date(soon.getTime() + 3_600_000).toISOString(),
      status: "available",
    };
    render(
      <LocaleProvider locale="en" dir="ltr">
        <BookingDialog worker={instantWorker} slots={[soonSlot]}>
          <button type="button">Request booking</button>
        </BookingDialog>
      </LocaleProvider>
    );
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /AC Repair/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const chip = screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") !== null && /:\d\d/.test(b.textContent ?? ""));
    expect(chip).toBeDefined();
    fireEvent.click(chip!);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByRole("button", { name: /Book instantly/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send booking request" })).toBeInTheDocument();
  });
});

/**
 * §WhatsApp booking entry (docs/booking-entry.md) — resolved IN THE BROWSER.
 *
 * It used to be resolved on the server by reading `searchParams` in the profile
 * page, which is what opted `/[locale]/workers/[slug]` into dynamic rendering:
 * Next prerendered ZERO of the 36 catalogue pages while `generateStaticParams`
 * kept succeeding and the build printed no error. These tests pin the
 * replacement — the dialog opens itself, pre-filled, from the URL alone — so a
 * server read never comes back to buy that silence again.
 */
describe("booking entry from a shared link", () => {
  const PLAIN = "/en/workers/khaled-al-harbi-plumbing";

  afterEach(() => {
    window.history.replaceState({}, "", PLAIN);
  });

  /** Let the mount effect and the open-time availability fetch settle. */
  async function flushMount() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("opens the dialog pre-filled from ?book= without anyone pressing the button", async () => {
    window.history.replaceState({}, "", `${PLAIN}?book=AC%20Repair&src=share`);
    renderDialog();
    await flushMount();

    // No click happened: the requested service was applied, so the dialog went
    // straight to slot picking instead of waiting to be opened.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Available times")).toBeInTheDocument();
  });

  it("a plain visit with no entry params never opens the dialog", async () => {
    window.history.replaceState({}, "", PLAIN);
    renderDialog();
    await flushMount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a slot entry opens on details, resolving the slot against live availability", async () => {
    // The slot half is the one that CANNOT trust the build-time snapshot: the
    // profile is prerendered, so `slots` may predate the slot in the link. The
    // dialog asks /api/workers/[slug]/slots first and falls back to the prop
    // when that fetch is unavailable — in jsdom it rejects immediately, which
    // is exactly the fallback path.
    window.history.replaceState({}, "", `${PLAIN}?book=Plumbing&slot=s1&src=share`);
    renderDialog();
    await flushMount();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Prefilled slot → the step the customer would have been asked to pick is
    // already made, so it lands on details.
    expect(screen.getByText("Your name")).toBeInTheDocument();
  });

  it("a stale service still opens — degraded, not refused", async () => {
    window.history.replaceState({}, "", `${PLAIN}?book=Not%20a%20service%20we%20sell&src=share`);
    renderDialog();
    await flushMount();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Nothing resolvable survived, so it stays on the service step rather than
    // pretending the customer asked for something we sell.
    expect(screen.getByText("Describe the job yourself")).toBeInTheDocument();
  });
});
