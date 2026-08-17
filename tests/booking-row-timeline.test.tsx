// @vitest-environment jsdom
/**
 * Customer dispute timeline (docs/ENHANCEMENT-PLAN.md §2.4) — the read-only
 * "what happened and when" trail on /bookings rows, mirroring the admin
 * dispute view (/admin/bookings/[number]): every event renders its status
 * label, acting party, reason and timestamp from the SAME Booking.events
 * trail the admin page renders — so the customer and admin tell one story.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingRow } from "@/components/bookings/booking-row";
import { BookingRow as WorkerBookingRow } from "@/components/dashboard/bookings/booking-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { CustomerBookingRow } from "@/app/bookings/page";
import type { Booking, Worker } from "@/lib/data/types";

const { payBookingActionMock, confirmCompletionActionMock, availableSlotsActionMock, rescheduleBookingActionMock, respondBookingActionMock, submitQuoteActionMock, cancelBookingActionMock, transitionBookingActionMock, emailBookingAuditActionMock, sendBookingMessageActionMock, markChatReadActionMock, setChatTypingActionMock, getChatPresenceActionMock, refreshMock } = vi.hoisted(() => ({
  payBookingActionMock: vi.fn(),
  confirmCompletionActionMock: vi.fn(),
  availableSlotsActionMock: vi.fn(),
  rescheduleBookingActionMock: vi.fn(),
  respondBookingActionMock: vi.fn(),
  submitQuoteActionMock: vi.fn(),
  cancelBookingActionMock: vi.fn(),
  transitionBookingActionMock: vi.fn(),
  emailBookingAuditActionMock: vi.fn(),
  sendBookingMessageActionMock: vi.fn(),
  markChatReadActionMock: vi.fn(async () => ({ ok: true, count: 0 })),
  setChatTypingActionMock: vi.fn(async () => ({ ok: true })),
  getChatPresenceActionMock: vi.fn(async () => ({ ok: true, presence: { typingRole: null, typingAt: null, readAt: {} } })),
  refreshMock: vi.fn(),
}));

// The customer BookingRow (+ RescheduleDialog) and the worker BookingRow (+ its
// RespondDialog / BookingActions) import the booking server actions; mock the
// module so both rows render without a server round-trip.
vi.mock("@/app/actions/bookings", () => ({
  payBookingAction: payBookingActionMock,
  confirmCompletionAction: confirmCompletionActionMock,
  availableSlotsAction: availableSlotsActionMock,
  rescheduleBookingAction: rescheduleBookingActionMock,
  respondBookingAction: respondBookingActionMock,
  submitQuoteAction: submitQuoteActionMock,
  cancelBookingAction: cancelBookingActionMock,
  transitionBookingAction: transitionBookingActionMock,
  emailBookingAuditAction: emailBookingAuditActionMock,
  sendBookingMessageAction: sendBookingMessageActionMock,
  markChatReadAction: markChatReadActionMock,
  setChatTypingAction: setChatTypingActionMock,
  getChatPresenceAction: getChatPresenceActionMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const HOUR = 3_600_000;

/** A completed booking with the full lifecycle trail (the dispute timeline). */
function makeBooking(overrides: Partial<Booking> = {}): Booking {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();
  return {
    id: "bk-1",
    number: "BK-1001",
    workerId: "w1",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    status: "completed",
    startAt: at(4),
    endAt: at(3),
    quote: 15000,
    currency: "SAR",
    events: [
      { status: "requested", actorType: "customer", time: at(5) },
      { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 150", time: at(4) },
      { status: "inProgress", actorType: "worker", time: at(2) },
      { status: "completed", actorType: "worker", reason: "Job done, receipt issued", time: at(1) },
    ],
    ...overrides,
  };
}

/** The exact localized timestamp the audit line renders (same format options). */
const exactTime = (iso: string, locale: "en" | "ar" = "en") =>
  new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" });

function renderRow(locale: "en" | "ar" = "en", booking: Booking = makeBooking()) {
  const row: CustomerBookingRow = {
    booking,
    worker: {
      nameEn: "Khaled Al-Harbi",
      nameAr: "خالد الحربي",
      slug: "khaled-al-harbi-plumbing",
      hue: 25,
      email: "khaled@plumbfix.sa",
      whatsapp: "966501234567",
    },
    messages: [],
  };
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <BookingRow row={row} nowSeed={Date.now()} />
    </LocaleProvider>
  );
}

describe("BookingRow — §2.4 customer dispute timeline", () => {
  it("shows the 'What happened' toggle with the event count; the trail stays hidden until expanded", () => {
    renderRow();

    const toggle = screen.getByRole("button", { name: /What happened/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("4"); // event count badge
    // Collapsed — no event rows, no reasons, no timestamps.
    expect(screen.queryByText("Can do — quote SAR 150")).not.toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it("expands to the full trail: status labels, actor badges, reasons and timestamps", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));

    // The timeline <ol> — scoped so the row's own status badge (also
    // "Completed") can't collide with the trail's entries.
    const trail = within(screen.getByRole("list"));

    // Every status from the same Booking.events trail the admin view renders.
    expect(trail.getByText("Waiting for response")).toBeInTheDocument();
    expect(trail.getByText("Confirmed")).toBeInTheDocument();
    expect(trail.getByText("In progress")).toBeInTheDocument();
    expect(trail.getByText("Completed")).toBeInTheDocument();

    // Actor badges — the customer who requested, the worker who confirmed.
    expect(trail.getByText("Customer")).toBeInTheDocument();
    expect(trail.getAllByText("Worker")).toHaveLength(3);

    // Reasons ride the entries (same as the admin event trail).
    expect(trail.getByText("Can do — quote SAR 150")).toBeInTheDocument();
    expect(trail.getByText("Job done, receipt issued")).toBeInTheDocument();

    // Timestamps — "when" is rendered for every entry.
    expect(trail.getByText("5 hours ago")).toBeInTheDocument();
    expect(trail.getByText("4 hours ago")).toBeInTheDocument();
    expect(trail.getByText("2 hours ago")).toBeInTheDocument();
    expect(trail.getByText("1 hour ago")).toBeInTheDocument();
  });

  it("renders the timeline in Arabic (toggle, actors and timestamps localized)", () => {
    renderRow("ar");
    fireEvent.click(screen.getByRole("button", { name: /ماذا حدث/ }));

    const trail = within(screen.getByRole("list"));
    expect(trail.getAllByText("العامل")).toHaveLength(3);
    expect(trail.getByText("العميل")).toBeInTheDocument();
    // Arabic timeAgo has no pluralization — "منذ 5 ساعة", not "ساعات".
    expect(trail.getByText("منذ 5 ساعة")).toBeInTheDocument();
    // Reasons are free text — they render as stored, in both locales.
    expect(trail.getByText("Job done, receipt issued")).toBeInTheDocument();
  });

  it("hides the toggle entirely when the booking has no recorded events", () => {
    renderRow("en", makeBooking({ events: [] }));
    expect(screen.queryByRole("button", { name: /What happened/ })).not.toBeInTheDocument();
  });

  it("tapping an entry reveals its full audit line — booking number, status, actor, exact timestamp and reason", () => {
    const booking = makeBooking();
    renderRow("en", booking);
    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));

    // Each entry is a tappable summary (status + actor + time); the detail is
    // hidden until tapped. The confirmed entry is the one carrying this reason
    // (its accessible name joins the sibling spans without spaces).
    const confirmedEntry = screen.getByRole("button", { name: /quote SAR 150/ });
    expect(confirmedEntry).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Audit line")).not.toBeInTheDocument();
    fireEvent.click(confirmedEntry);

    // The audit line — the same facts the admin dispute page renders for the
    // event (status, actor, reason, timestamp) plus the booking number.
    const detail = within(screen.getByText("Audit line").parentElement!);
    expect(detail.getByText("BK-1001")).toBeInTheDocument();
    expect(detail.getByText("Confirmed")).toBeInTheDocument();
    expect(detail.getByText("Worker")).toBeInTheDocument();
    expect(detail.getByText("Can do — quote SAR 150")).toBeInTheDocument();
    // The exact "when" — the localized full timestamp, not just the time-ago.
    expect(detail.getByText(exactTime(booking.events[1]!.time))).toBeInTheDocument();
    expect(confirmedEntry).toHaveAttribute("aria-expanded", "true");
  });

  it("tapping an open entry collapses its detail", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));

    const entry = screen.getByRole("button", { name: /quote SAR 150/ });
    fireEvent.click(entry);
    expect(screen.getByText("Audit line")).toBeInTheDocument();
    fireEvent.click(entry);
    expect(screen.queryByText("Audit line")).not.toBeInTheDocument();
  });

  it("localizes the audit line in Arabic", () => {
    const booking = makeBooking();
    renderRow("ar", booking);
    fireEvent.click(screen.getByRole("button", { name: /ماذا حدث/ }));
    fireEvent.click(screen.getByRole("button", { name: /بانتظار الرد/ }));

    const detail = within(screen.getByText("سطر التدقيق").parentElement!);
    expect(detail.getByText("BK-1001")).toBeInTheDocument();
    expect(detail.getByText("العميل")).toBeInTheDocument();
    expect(detail.getByText(exactTime(booking.events[0]!.time, "ar"))).toBeInTheDocument();
  });

  it("shows the compact Print link in the expanded header — and only then", () => {
    renderRow();
    // Collapsed: the print link lives where the trail is shown, so it's
    // hidden until the timeline is expanded.
    expect(screen.queryByRole("button", { name: "Print BK-1001" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));
    const printLink = screen.getByRole("button", { name: "Print BK-1001" });
    expect(printLink).toBeInTheDocument();

    // It opens the SAME audit dialog the row's full Print button opens.
    fireEvent.click(printLink);
    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    expect((iframe.getAttribute("srcdoc") ?? "")).toContain("Khaled Al-Harbi");
    expect((iframe.getAttribute("srcdoc") ?? "")).toContain("Can do — quote SAR 150");
  });

  it("localizes the compact Print link in Arabic", () => {
    renderRow("ar");
    fireEvent.click(screen.getByRole("button", { name: /ماذا حدث/ }));
    fireEvent.click(screen.getByRole("button", { name: "طباعة BK-1001" }));

    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    expect((iframe.getAttribute("srcdoc") ?? "")).toContain('lang="ar" dir="rtl"');
  });
});

describe("WorkerBookingRow — the same §2.4 timeline from the worker's side", () => {
  const worker = {
    id: "w1",
    slug: "khaled-al-harbi-plumbing",
    priceMin: 80,
    nameEn: "Khaled Al-Harbi",
    nameAr: "خالد الحربي",
    email: "khaled@plumbfix.sa",
  } as unknown as Worker;

  function renderWorkerRow(locale: "en" | "ar" = "en", booking: Booking = makeBooking()) {
    return render(
      <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
        <WorkerBookingRow booking={booking} messages={[]} worker={worker} nowSeed={Date.now()} />
      </LocaleProvider>
    );
  }

  it("renders the identical timeline (shared component) with the same trail", () => {
    renderWorkerRow();
    const toggle = screen.getByRole("button", { name: /What happened/ });
    expect(toggle).toHaveTextContent("4");
    fireEvent.click(toggle);

    const trail = within(screen.getByRole("list"));
    expect(trail.getByText("Waiting for response")).toBeInTheDocument();
    expect(trail.getByText("Confirmed")).toBeInTheDocument();
    expect(trail.getByText("In progress")).toBeInTheDocument();
    expect(trail.getByText("Completed")).toBeInTheDocument();
    expect(trail.getByText("Customer")).toBeInTheDocument();
    expect(trail.getAllByText("Worker")).toHaveLength(3);
    expect(trail.getByText("Can do — quote SAR 150")).toBeInTheDocument();
    expect(trail.getByText("5 hours ago")).toBeInTheDocument();
  });

  it("localizes the worker-side timeline in Arabic", () => {
    renderWorkerRow("ar");
    fireEvent.click(screen.getByRole("button", { name: /ماذا حدث/ }));

    const trail = within(screen.getByRole("list"));
    expect(trail.getByText("العميل")).toBeInTheDocument();
    expect(trail.getAllByText("العامل")).toHaveLength(3);
    expect(trail.getByText("منذ 5 ساعة")).toBeInTheDocument();
  });

  it("hides the toggle when the worker-side booking has no events", () => {
    renderWorkerRow("en", makeBooking({ events: [] }));
    expect(screen.queryByRole("button", { name: /What happened/ })).not.toBeInTheDocument();
  });

  it("tapping an entry reveals the same audit line with the booking number", () => {
    const booking = makeBooking();
    renderWorkerRow("en", booking);
    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));
    fireEvent.click(screen.getByRole("button", { name: /quote SAR 150/ }));

    const detail = within(screen.getByText("Audit line").parentElement!);
    expect(detail.getByText("BK-1001")).toBeInTheDocument();
    expect(detail.getByText("Can do — quote SAR 150")).toBeInTheDocument();
    expect(detail.getByText(exactTime(booking.events[1]!.time))).toBeInTheDocument();
  });

  it("renders the printable audit export (same BookingPrintButton the other two sides use)", () => {
    renderWorkerRow();
    // The Print button lives next to the timeline, like the customer row.
    const print = screen.getByRole("button", { name: "Print" });
    fireEvent.click(print);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Booking audit trail")).toBeInTheDocument();
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    const doc = iframe.getAttribute("srcdoc") ?? "";
    // The audit document carries the worker's name + the same event trail.
    expect(doc).toContain("BK-1001");
    expect(doc).toContain("Khaled Al-Harbi");
    expect(doc).toContain("Can do — quote SAR 150");
  });

  it("localizes the print button + audit document in Arabic", () => {
    renderWorkerRow("ar");
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));

    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    const doc = iframe.getAttribute("srcdoc") ?? "";
    expect(doc).toContain('lang="ar" dir="rtl"');
    expect(doc).toContain("سجل تدقيق الحجز");
    expect(doc).toContain("خالد الحربي");
  });

  it("shows the compact Print link inside the expanded timeline header", () => {
    renderWorkerRow();
    fireEvent.click(screen.getByRole("button", { name: /What happened/ }));
    const printLink = screen.getByRole("button", { name: "Print BK-1001" });
    fireEvent.click(printLink);

    const dialog = screen.getByRole("dialog");
    const iframe = within(dialog).getByTitle(/BK-1001/) as HTMLIFrameElement;
    expect((iframe.getAttribute("srcdoc") ?? "")).toContain("Khaled Al-Harbi");
  });

  it("emails the audit PDF to the customer and the worker from the picker", async () => {
    emailBookingAuditActionMock.mockResolvedValue({ ok: true });
    renderWorkerRow();
    fireEvent.click(screen.getByRole("button", { name: "Email audit" }));

    const dialog = screen.getByRole("dialog");
    // Both recipients are offered — the customer (from the booking) and the
    // worker themselves (their own email address).
    expect(within(dialog).getByRole("checkbox", { name: "Sara Customer" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Khaled Al-Harbi" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sara Customer" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Khaled Al-Harbi" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send email" }));

    expect(emailBookingAuditActionMock).toHaveBeenCalledWith("BK-1001", ["customer", "worker"], "en");
    expect(await within(dialog).findByText(/Audit emailed/)).toBeInTheDocument();
  });
});

describe("BookingRow — M3 receipt vs voided receipt", () => {
  const invoice = (status: "paid" | "voided"): Booking["invoice"] => ({
    number: "WA-2026-00001",
    amount: 15000,
    currency: "SAR",
    status,
    date: new Date().toISOString(),
  });

  it("renders a PAID receipt as the green invoice pill", () => {
    renderRow("en", makeBooking({ invoice: invoice("paid") }));
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("WA-2026-00001")).toBeInTheDocument();
    // Green paid styling — no voided chip.
    expect(screen.queryByText("Voided")).not.toBeInTheDocument();
    expect(screen.getByText("Invoice").closest("div")!.className).toContain("emerald");
  });

  it("strikes a VOIDED receipt through with the Voided chip (admin refunded the deposit)", () => {
    renderRow("en", makeBooking({ invoice: invoice("voided") }));
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("WA-2026-00001")).toHaveClass("line-through");
    expect(screen.getByText("Voided")).toBeInTheDocument();
    // No green paid pill.
    expect(screen.getByText("Invoice").closest("div")!.className).not.toContain("emerald");
  });

  it("localizes the Voided chip in Arabic", () => {
    renderRow("ar", makeBooking({ invoice: invoice("voided") }));
    expect(screen.getByText("ملغاة")).toBeInTheDocument();
    expect(screen.getByText("WA-2026-00001")).toHaveClass("line-through");
  });
});
