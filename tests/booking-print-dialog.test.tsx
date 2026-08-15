// @vitest-environment jsdom
/**
 * Printable audit-trail export (docs/ENHANCEMENT-PLAN.md §2.4) — the
 * BookingPrintButton dialog renders the standalone audit document
 * (renderBookingAuditPrint) in a sandboxed iframe and prints THAT iframe, so
 * the browser's print dialog saves exactly the booking's event trail as PDF.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingPrintButton } from "@/components/bookings/booking-print-button";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { AUDIT_DOC_LOCALE_KEY } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const booking: Booking = {
  id: "bk-1",
  number: "BK-1001",
  workerId: "w1",
  customerName: "Sara Customer",
  customerPhone: "+966 50 000 0000",
  customerEmail: "sara@example.com",
  jobTitle: "Leaking kitchen sink repair",
  status: "confirmed",
  startAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  endAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  quote: 15000,
  currency: "SAR",
  events: [
    { status: "requested", actorType: "customer", time: new Date(Date.now() - 5 * 3_600_000).toISOString() },
    { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 150", time: new Date(Date.now() - 4 * 3_600_000).toISOString() },
  ],
};

function renderButton(locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <BookingPrintButton booking={booking} workerName="Khaled Al-Harbi" />
    </LocaleProvider>
  );
}

describe("BookingPrintButton — printable audit-trail export", () => {
  it("opens a dialog with the audit document in a sandboxed iframe, and prints that iframe", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Booking audit trail")).toBeInTheDocument();

    // The document is rendered sandboxed (no scripts; allow-same-origin is
    // required so the parent can call contentWindow.print() on it — the
    // content is fully escaped generated HTML) and carries the full trail —
    // booking number, statuses, actors, reasons.
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain("BK-1001");
    expect(doc).toContain("Waiting for response");
    expect(doc).toContain("Confirmed");
    expect(doc).toContain("Can do — quote SAR 150");
    expect(doc).toContain("Khaled Al-Harbi");

    // The footer Print button targets the IFRAME's print dialog.
    const printSpy = vi.fn();
    Object.defineProperty(iframe, "contentWindow", { configurable: true, value: { print: printSpy } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Print" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the Arabic document in the dialog (RTL labels)", () => {
    renderButton("ar");
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));

    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain("سجل تدقيق الحجز");
    expect(doc).toContain("بانتظار الرد");
    expect(doc).toContain("العميل");
    expect(doc).toContain('<html lang="ar" dir="rtl">');
  });

  it("lets the user switch the document's language, and remembers the choice in localStorage", () => {
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    const dialog = screen.getByRole("dialog");
    let iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc") ?? "").toContain('<html lang="en" dir="ltr">');

    // The dialog chrome stays in the page locale; the toggle offers both.
    const arabicToggle = within(dialog).getByRole("button", { name: "العربية" });
    expect(arabicToggle).toHaveAttribute("aria-pressed", "false");

    // Picking Arabic re-renders the document as RTL and persists the choice.
    fireEvent.click(arabicToggle);
    iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(doc).toContain("سجل تدقيق الحجز");
    expect(arabicToggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBe("ar");
  });

  it("remembers the last-chosen language on the next open, even when the page locale differs", () => {
    // A previous session chose Arabic; the page is now in English.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(doc).toContain("سجل تدقيق الحجز");
    expect(doc).toContain("بانتظار الرد");
    // The toggle reflects the remembered choice.
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");

    // Switching back to English updates the document and the stored value.
    fireEvent.click(within(dialog).getByRole("button", { name: "English" }));
    const docEn = (within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
    expect(docEn).toContain('<html lang="en" dir="ltr">');
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBe("en");
  });

  it("falls back to the page locale when nothing was stored", () => {
    renderButton("ar");
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    const doc = (within(screen.getByRole("dialog")).getByTitle(/BK-1001/) as HTMLIFrameElement).getAttribute(
      "srcdoc"
    ) ?? "";
    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBeNull();
  });

  it("resets the remembered language and returns to following the page locale", () => {
    // A previous session chose Arabic; the page is English now.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    const dialog = screen.getByRole("dialog");
    const arabicToggle = within(dialog).getByRole("button", { name: "العربية" });
    expect(arabicToggle).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeEnabled();

    // Reset: the document follows the page locale again and the preference is gone.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset language" }));
    const doc = (within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
    expect(doc).toContain('<html lang="en" dir="ltr">');
    expect(arabicToggle).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBeNull();
    // Nothing left to reset.
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeDisabled();
  });

  it("disables the reset button when the document already follows the page locale", () => {
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset language" })).toBeDisabled();
  });

  it("fresh instance after a reset falls back to the page locale with the reset button disabled", () => {
    // A previous session chose Arabic; the page is English.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeEnabled();

    // Reset through the real UI — clears the preference.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset language" }));
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBeNull();

    // Remount a FRESH dialog instance: with nothing stored, its initializer
    // must fall back to the page locale and report nothing to reset.
    cleanup();
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeDisabled();
    const doc = (within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement).getAttribute("srcdoc") ?? "";
    expect(doc).toContain('<html lang="en" dir="ltr">');
  });

  it("labels the reset button in Arabic when the page is Arabic", () => {
    renderButton("ar");
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "إعادة تعيين اللغة" })).toBeDisabled();
  });
});
