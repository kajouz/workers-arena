// @vitest-environment jsdom
/**
 * §Instant booking (docs/ENHANCEMENT-PLAN.md Phase 2) — the package editor.
 *
 * The opt-in toggle is worthless on its own: `fixedPrice` was only ever true on
 * seeded rows, so the feature was unreachable for a real worker. This locks the
 * editor that gives the opt-in something to sell — what the worker sees, what it
 * sends, and the refusals it must surface rather than swallow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/actions/bookings", () => ({
  generateSlotsAction: vi.fn(async () => ({ ok: true, created: 0 })),
  setSlotBlockedAction: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/app/actions/business", () => ({
  setInstantBookAction: vi.fn(async () => ({ ok: true })),
  publishFixedPricePackageAction: vi.fn(async () => ({ ok: true })),
}));

import { AvailabilityPanel } from "@/components/dashboard/bookings/availability-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { publishFixedPricePackageAction } from "@/app/actions/business";
import { useToastStore } from "@/components/ui/toast";
import type { BookingSlot, Worker } from "@/lib/data/types";

/** The Toaster is not mounted in jsdom, so read the store it feeds. */
const errorToast = () =>
  useToastStore.getState().toasts.find((entry) => entry.kind === "error")?.title;

const publishMock = vi.mocked(publishFixedPricePackageAction);

const worker = {
  id: "w1",
  slug: "khaled-al-harbi-plumbing",
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  currency: "USD",
  instantBook: true,
  services: [
    { nameEn: "AC Repair", nameAr: "إصلاح مكيف", price: 150, unit: "job", fixedPrice: true },
    { nameEn: "Plumbing", nameAr: "سباكة", price: 100, unit: "job", fixedPrice: false },
    { nameEn: "Hourly Labour", nameAr: "عمل بالساعة", price: 25, unit: "hour", fixedPrice: false },
  ],
} as unknown as Worker;

const slots: BookingSlot[] = [];

function renderPanel() {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <AvailabilityPanel slots={slots} worker={worker} />
    </LocaleProvider>
  );
}

/** The per-package price input, addressed by its accessible name. */
const priceInput = (serviceName: string) =>
  screen.getByLabelText(`Price — ${serviceName}`) as HTMLInputElement;

afterEach(() => cleanup());
beforeEach(() => {
  publishMock.mockClear();
  useToastStore.setState({ toasts: [] });
});

describe("AvailabilityPanel package editor", () => {
  it("lists every service and only lets per-job rows be sold instantly", () => {
    renderPanel();

    expect(screen.getByText("Your packages")).toBeInTheDocument();
    // Two job services (one already on sale), one hourly row that cannot be.
    expect(screen.getByLabelText("Price — AC Repair")).toHaveValue(150);
    expect(screen.getByLabelText("Price — Plumbing")).toHaveValue(100);
    expect(screen.queryByLabelText("Price — Hourly Labour")).not.toBeInTheDocument();

    // The already-published package shows the badge and offers withdrawal; the
    // unpublished one offers publication.
    expect(screen.getByRole("button", { name: "Stop selling instantly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell instantly" })).toBeInTheDocument();
  });

  it("publishes the typed price for the row that was clicked", async () => {
    renderPanel();

    fireEvent.change(priceInput("Plumbing"), { target: { value: "175" } });
    fireEvent.click(screen.getByRole("button", { name: "Sell instantly" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const payload = publishMock.mock.calls[0]![0] as FormData;
    expect(payload.get("serviceNameEn")).toBe("Plumbing");
    // The TYPED value, not the listed one — the edit is the whole point.
    expect(payload.get("price")).toBe("175");
    expect(payload.get("sellInstantly")).toBe("true");
  });

  it("withdraws without re-pricing — the listed price is not overwritten", async () => {
    renderPanel();

    // Type something into the AC Repair box, then withdraw instead of publish.
    fireEvent.change(priceInput("AC Repair"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop selling instantly" }));
    await act(async () => {
      await Promise.resolve();
    });

    const payload = publishMock.mock.calls[0]![0] as FormData;
    expect(payload.get("sellInstantly")).toBe("false");
    // The action ignores the price on withdrawal; what matters is that the
    // surface does not pretend a withdrawal is a re-publish.
    expect(payload.get("serviceNameEn")).toBe("AC Repair");
  });

  it("refuses to switch on over an empty shelf, but never blocks switching off", () => {
    // A worker who withdraws their last package keeps the opt-in flag set: the
    // shelf is empty and nothing is sellable, but the control must still be able
    // to cancel the feature — otherwise the state is a dead end.
    render(
      <LocaleProvider locale="en" dir="ltr">
        <AvailabilityPanel
          slots={slots}
          worker={
            {
              ...worker,
              services: [
                { nameEn: "Plumbing", nameAr: "سباكة", price: 100, unit: "job", fixedPrice: false },
              ],
            } as unknown as Worker
          }
        />
      </LocaleProvider>
    );

    expect(screen.getByRole("button", { name: "Turn off" })).toBeEnabled();
  });

  it("keeps an opted-out worker with nothing to sell from switching on", () => {
    render(
      <LocaleProvider locale="en" dir="ltr">
        <AvailabilityPanel
          slots={slots}
          worker={
            {
              ...worker,
              instantBook: false,
              services: [
                { nameEn: "Hourly Labour", nameAr: "عمل بالساعة", price: 25, unit: "hour", fixedPrice: false },
              ],
            } as unknown as Worker
          }
        />
      </LocaleProvider>
    );

    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
  });

  it("surfaces an hourly refusal instead of silently doing nothing", async () => {
    publishMock.mockResolvedValueOnce({ ok: false, error: "hourly" });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sell instantly" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(errorToast()).toBe(
      "An hourly service cannot be sold instantly — set it to a per-job price first."
    );
  });

  it("reports a bad price as a bad price", async () => {
    publishMock.mockResolvedValueOnce({ ok: false, error: "invalid-price" });
    renderPanel();

    fireEvent.change(priceInput("Plumbing"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Sell instantly" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(errorToast()).toBe("Enter a price of at least 1.");
  });
});
