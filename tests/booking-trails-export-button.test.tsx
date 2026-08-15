// @vitest-environment jsdom
/**
 * §2.4 admin trails export (docs/ENHANCEMENT-PLAN.md §2.4) —
 * BookingTrailsExportButton: the funnel-card dropdown (CSV / PDF) calls the
 * admin-only server action and downloads the returned payload as a file,
 * with localized success / error toasts. Radix dropdowns open on pointer
 * events, so the tests drive the trigger via @testing-library/user-event.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { BookingTrailsExportButton } from "@/components/dashboard/booking-trails-export-button";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { useToastStore } from "@/components/ui/toast";
import { AUDIT_DOC_LOCALE_KEY } from "@/lib/data/booking-print";

const { exportBookingTrailsActionMock, createObjectURLMock } = vi.hoisted(() => ({
  exportBookingTrailsActionMock: vi.fn(),
  createObjectURLMock: vi.fn(() => "blob:mock-url"),
}));

vi.mock("@/app/actions/bookings", () => ({
  exportBookingTrailsAction: exportBookingTrailsActionMock,
}));

let pushSpy: ReturnType<typeof vi.spyOn>;
let user: ReturnType<typeof userEvent.setup>;

// jsdom lacks URL.createObjectURL — stub it and the anchor navigation.
beforeEach(() => {
  vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectURLMock, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  pushSpy = vi.spyOn(useToastStore.getState(), "push").mockImplementation(() => {});
  user = userEvent.setup();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

function renderButton(locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <BookingTrailsExportButton />
    </LocaleProvider>
  );
}

describe("BookingTrailsExportButton", () => {
  it("downloads the CSV from the action and toasts the exported count", async () => {
    exportBookingTrailsActionMock.mockResolvedValue({ ok: true, count: 2, csv: "\uFEFFa,b\r\n1,2\r\n" });

    renderButton();
    await user.click(screen.getByRole("button", { name: "Export trails" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV" }));

    await waitFor(() => expect(exportBookingTrailsActionMock).toHaveBeenCalledWith("csv", "en"));
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("success", "Exported 2 bookings", undefined));
  });

  it("downloads the PDF (base64 → bytes) with the pdf mime type", async () => {
    exportBookingTrailsActionMock.mockResolvedValue({
      ok: true,
      count: 1,
      pdfBase64: Buffer.from("%PDF-1.4 x").toString("base64"),
    });

    renderButton();
    await user.click(screen.getByRole("button", { name: "Export trails" }));
    await user.click(await screen.findByRole("menuitem", { name: "PDF" }));

    await waitFor(() => expect(exportBookingTrailsActionMock).toHaveBeenCalledWith("pdf", "en"));
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("success", "Exported 1 bookings", undefined));
  });

  it("toasts the localized no-data error", async () => {
    exportBookingTrailsActionMock.mockResolvedValue({ ok: false, error: "no-data" });

    renderButton("ar");
    await user.click(screen.getByRole("button", { name: "تصدير السجلات" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV" }));

    await waitFor(() =>
      expect(exportBookingTrailsActionMock).toHaveBeenCalledWith("csv", "ar")
    );
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("error", "لا توجد حجوزات للتصدير بعد.", undefined));
  });

  it("toasts the localized render-failed error for PDF", async () => {
    exportBookingTrailsActionMock.mockResolvedValue({ ok: false, error: "render-failed" });

    renderButton();
    await user.click(screen.getByRole("button", { name: "Export trails" }));
    await user.click(await screen.findByRole("menuitem", { name: "PDF" }));

    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith(
        "error",
        "PDF rendering is unavailable — no Chrome/Chromium executable was found on this server.",
        undefined
      )
    );
  });

  it("renders both formats in the Arabic dropdown", async () => {
    renderButton("ar");
    fireEvent.pointerDown(screen.getByRole("button", { name: "تصدير السجلات" }));
    expect(await screen.findByRole("menuitem", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "PDF" })).toBeInTheDocument();
  });

  it("uses the remembered audit-document language for the CSV and PDF, even when the page locale differs", async () => {
    // A print/email dialog session chose Arabic; the page is English.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    renderButton("en");

    exportBookingTrailsActionMock.mockResolvedValue({ ok: true, count: 2, csv: "a,b\r\n" });
    await user.click(screen.getByRole("button", { name: "Export trails" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV" }));
    await waitFor(() => expect(exportBookingTrailsActionMock).toHaveBeenCalledWith("csv", "ar"));

    exportBookingTrailsActionMock.mockResolvedValue({
      ok: true,
      count: 1,
      pdfBase64: Buffer.from("%PDF-1.4 x").toString("base64"),
    });
    await user.click(screen.getByRole("button", { name: "Export trails" }));
    await user.click(await screen.findByRole("menuitem", { name: "PDF" }));
    await waitFor(() => expect(exportBookingTrailsActionMock).toHaveBeenCalledWith("pdf", "ar"));
  });
});
