// @vitest-environment jsdom
/**
 * §2.4 on-demand audit email — BookingEmailButton: the recipient picker
 * (customer / worker checkboxes, disabled with a hint when no email is on
 * file), the disabled-until-selection Send button, the server-action round
 * trip, and the success / error states — EN + AR.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingEmailButton } from "@/components/bookings/booking-email-button";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { AUDIT_DOC_LOCALE_KEY } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";

const { emailBookingAuditActionMock } = vi.hoisted(() => ({
  emailBookingAuditActionMock: vi.fn(),
}));

vi.mock("@/app/actions/bookings", () => ({
  emailBookingAuditAction: emailBookingAuditActionMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  quote: 15000,
  currency: "SAR",
  events: [
    { status: "requested", actorType: "customer", time: new Date().toISOString() },
  ],
};

function renderButton(locale: "en" | "ar" = "en", workerEmail: string | undefined = "khaled@plumbfix.sa") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <BookingEmailButton booking={booking} workerName="Khaled Al-Harbi" workerEmail={workerEmail} />
    </LocaleProvider>
  );
}

describe("BookingEmailButton — on-demand audit email", () => {
  it("opens the recipient picker, sends to the checked recipients, shows success", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Email booking audit trail")).toBeInTheDocument();

    // Send stays disabled until at least one recipient is picked.
    const send = within(dialog).getByRole("button", { name: "Send email" });
    expect(send).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Khaled Al-Harbi" }));
    fireEvent.click(send);

    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer", "worker"], "en");
    expect(await within(dialog).findByText(/Audit emailed/)).toBeInTheDocument();
  });

  it("disables a recipient with no email on file and shows the hint", () => {
    // No workerEmail passed → the worker checkbox must be disabled + hinted.
    render(
      <LocaleProvider locale="en" dir="ltr">
        <BookingEmailButton booking={booking} workerName="Khaled Al-Harbi" />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");

    // Worker has no email → its checkbox is disabled and the hint replaces the address.
    const workerBox = within(dialog).getByRole("checkbox", { name: "Khaled Al-Harbi" }) as HTMLInputElement;
    expect(workerBox.disabled).toBe(true);
    expect(within(dialog).getByText("No email address on file for this recipient.")).toBeInTheDocument();

    // The customer can still be picked and emailed.
    const customerBox = within(dialog).getByRole("checkbox", { name: "Sara Customer" }) as HTMLInputElement;
    expect(customerBox.disabled).toBe(false);
  });

  it("surfaces the localized no-email error from the action", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: false, error: "no-email" });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
    expect(await within(dialog).findByText("No email address on file for this recipient.")).toBeInTheDocument();
  });

  it("surfaces the render-failed error (no Chrome on the server)", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: false, error: "render-failed" });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
    expect(
      await within(dialog).findByText(/PDF rendering is unavailable/)
    ).toBeInTheDocument();
  });

  it("renders the picker in Arabic", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("ar");

    fireEvent.click(screen.getByRole("button", { name: "إرسال التدقيق" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("إرسال سجل تدقيق الحجز")).toBeInTheDocument();
    expect(within(dialog).getByText("المستلمون")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "إرسال البريد" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إرسال البريد" }));
    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer"], "ar");
    expect(await within(dialog).findByText(/تم إرسال التدقيق/)).toBeInTheDocument();
  });

  it("lets the user switch the PDF's language, and remembers the choice in localStorage", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("en");

    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");
    // Defaults to the page locale; the toggle offers both languages.
    const englishToggle = within(dialog).getByRole("button", { name: "English" });
    expect(englishToggle).toHaveAttribute("aria-pressed", "true");
    const arabicToggle = within(dialog).getByRole("button", { name: "العربية" });
    expect(arabicToggle).toHaveAttribute("aria-pressed", "false");

    // Picking Arabic persists the choice; sending uses it for the PDF/email.
    fireEvent.click(arabicToggle);
    expect(arabicToggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBe("ar");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer"], "ar");
  });

  it("remembers the last-chosen language on the next open, even when the page locale differs", async () => {
    // A previous session (print or email) chose Arabic; the page is English now.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("en");

    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer"], "ar");
  });

  it("shares the remembered language with the print dialog", async () => {
    // A print dialog session chose English; the page is Arabic.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "en");
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("ar");

    fireEvent.click(screen.getByRole("button", { name: "إرسال التدقيق" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إرسال البريد" }));
    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer"], "en");
  });

  it("resets the remembered language and returns to following the page locale", async () => {
    // A previous session chose Arabic; the page is English now.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("en");

    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeEnabled();

    // Reset: the PDF follows the page locale again and the preference is gone.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset language" }));
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeDisabled();

    // Sending now uses the page locale.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer"], "en");
  });

  it("disables the reset button when the document already follows the page locale", () => {
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset language" })).toBeDisabled();
  });

  it("fresh instance after a reset falls back to the page locale with the reset button disabled", async () => {
    // A previous session chose Arabic; the page is English.
    localStorage.setItem(AUDIT_DOC_LOCALE_KEY, "ar");
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeEnabled();

    // Reset through the real UI — clears the shared preference.
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset language" }));
    expect(localStorage.getItem(AUDIT_DOC_LOCALE_KEY)).toBeNull();

    // Remount a FRESH dialog instance: with nothing stored, its initializer
    // must fall back to the page locale and report nothing to reset.
    cleanup();
    renderButton("en");
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Reset language" })).toBeDisabled();
  });

  it("labels the reset button in Arabic when the page is Arabic", () => {
    renderButton("ar");
    fireEvent.click(screen.getByRole("button", { name: "إرسال التدقيق" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "إعادة تعيين اللغة" })).toBeDisabled();
  });
});
