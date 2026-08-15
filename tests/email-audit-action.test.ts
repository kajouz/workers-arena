/**
 * §2.4 audit-trail email (docs/ENHANCEMENT-PLAN.md §2.4) — emailBookingAuditAction:
 * permission model (admin / owning customer / the worker on the booking),
 * PDF rendering of the exact audit document, and one dispatched email per
 * recipient with the PDF attached. The repo seam, session, PDF renderer and
 * dispatcher are mocked; the i18n dictionaries stay real so the payload copy
 * is asserted verbatim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emailBookingAuditAction } from "@/app/actions/bookings";
import { PdfRenderError } from "@/lib/data/booking-pdf";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Booking, Worker } from "@/lib/data/types";

const { getSessionMock, getBookingByNumberMock, getWorkerByIdMock, renderAuditPdfMock, dispatchMock, dispatched } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    getBookingByNumberMock: vi.fn(),
    getWorkerByIdMock: vi.fn(),
    renderAuditPdfMock: vi.fn(),
    dispatchMock: vi.fn(),
    dispatched: [] as ChannelPayload[],
  }));

vi.mock("@/lib/auth-demo", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/data/repo", () => ({
  cancelBooking: vi.fn(),
  cancelRecurringContract: vi.fn(),
  confirmBookingCompletion: vi.fn(),
  confirmBookingPayment: vi.fn(),
  createBookingCheckout: vi.fn(),
  createBookingRequest: vi.fn(),
  createQuoteRequest: vi.fn(),
  createRecurringRequest: vi.fn(),
  generateSlots: vi.fn(),
  getBookingByNumber: getBookingByNumberMock,
  getWorkerById: getWorkerByIdMock,
  getWorkerBySlug: vi.fn(),
  getWorkerSlots: vi.fn(),
  rescheduleBooking: vi.fn(),
  respondToBooking: vi.fn(),
  respondToRecurring: vi.fn(),
  selectQuote: vi.fn(),
  setSlotBlocked: vi.fn(),
  submitQuote: vi.fn(),
  transitionBooking: vi.fn(),
}));
vi.mock("@/lib/data/booking-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/booking-pdf")>();
  return { ...actual, renderAuditPdf: renderAuditPdfMock };
});
vi.mock("@/lib/notifications/dispatcher", () => ({
  dispatch: (payload: ChannelPayload) => {
    dispatched.push(payload);
    return dispatchMock(payload);
  },
}));

const booking: Booking = {
  id: "bk-1001",
  number: "BK-1001",
  workerId: "w-khaled",
  customerId: "u-customer",
  customerName: "Sara Customer",
  customerPhone: "+966 50 000 0000",
  customerEmail: "sara@example.com",
  jobTitle: "Leaking kitchen sink repair",
  status: "requested",
  currency: "SAR",
  events: [
    { status: "requested", actorType: "customer", time: new Date().toISOString() },
  ],
};

// The action only reads id / nameEn / nameAr / email off the worker — a
// structural cast keeps the fixture tiny (the full Worker interface has ~40
// required fields).
const worker = {
  id: "w-khaled",
  nameEn: "Khaled Al-Harbi",
  nameAr: "خالد الحربي",
  email: "khaled@plumbfix.sa",
} as unknown as Worker;

beforeEach(() => {
  dispatched.length = 0;
  getSessionMock.mockResolvedValue({ id: "u-admin", name: "Admin", email: "admin@workersarena.com", role: "admin", hue: 280 });
  getBookingByNumberMock.mockResolvedValue(booking);
  getWorkerByIdMock.mockResolvedValue(worker);
  renderAuditPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 audit"));
  dispatchMock.mockResolvedValue([{ channel: "email", ok: true, provider: "console" }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("emailBookingAuditAction", () => {
  it("rejects invalid args (no recipients / bad locale)", async () => {
    await expect(emailBookingAuditAction("BK-1001", [], "en")).resolves.toEqual({ ok: false, error: "invalid" });
    await expect(emailBookingAuditAction("", ["customer"], "en")).resolves.toEqual({ ok: false, error: "invalid" });
    await expect(emailBookingAuditAction("BK-1001", ["customer" as "customer"], "fr" as "en")).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    expect(dispatched.length).toBe(0);
  });

  it("rejects signed-out callers", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(emailBookingAuditAction("BK-1001", ["customer"], "en")).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(dispatched.length).toBe(0);
  });

  it("rejects a booking that doesn't exist", async () => {
    getBookingByNumberMock.mockResolvedValue(null);
    await expect(emailBookingAuditAction("BK-9999", ["customer"], "en")).resolves.toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("rejects a customer who does not own the booking", async () => {
    getSessionMock.mockResolvedValue({ id: "u-other", name: "Other", email: "other@example.com", role: "customer", hue: 100 });
    await expect(emailBookingAuditAction("BK-1001", ["customer"], "en")).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(dispatched.length).toBe(0);
  });

  it("allows the owning customer (matched by customerId) and emails the audit PDF", async () => {
    getSessionMock.mockResolvedValue({ id: "u-customer", name: "Sara Customer", email: "sara@example.com", role: "customer", hue: 200 });
    const res = await emailBookingAuditAction("BK-1001", ["customer"], "en");
    expect(res).toEqual({ ok: true });

    expect(renderAuditPdfMock).toHaveBeenCalledTimes(1);
    const html = renderAuditPdfMock.mock.calls[0]![0] as string;
    expect(html).toContain("BK-1001");
    expect(html).toContain("Khaled Al-Harbi");

    expect(dispatched.length).toBe(1);
    const p = dispatched[0]!;
    expect(p.recipient).toEqual({ name: "Sara Customer", email: "sara@example.com", locale: "en" });
    expect(p.attachments).toEqual([
      { filename: "BK-1001-audit.pdf", content: Buffer.from("%PDF-1.4 audit"), contentType: "application/pdf" },
    ]);
    expect(p.titleEn).toBe("Booking audit trail — BK-1001");
    expect(p.titleAr).toBe("سجل تدقيق الحجز — BK-1001");
    expect(p.bodyEn).toContain("BK-1001");
  });

  it("emails BOTH the customer and the worker when both are requested", async () => {
    const res = await emailBookingAuditAction("BK-1001", ["customer", "worker"], "ar");
    expect(res).toEqual({ ok: true });
    expect(dispatched.length).toBe(2);
    expect(dispatched.map((d) => d.recipient?.email)).toEqual(["sara@example.com", "khaled@plumbfix.sa"]);
    // The PDF is rendered once (the same attachment for both recipients) and
    // the worker recipient carries the worker's display name.
    expect(renderAuditPdfMock).toHaveBeenCalledTimes(1);
    expect(dispatched[1]!.recipient?.name).toBe("خالد الحربي");
    // The audit document renders in the requested locale (Arabic RTL here).
    const html = renderAuditPdfMock.mock.calls[0]![0] as string;
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("خالد الحربي");
  });

  it("rejects when a requested recipient has no email address on file", async () => {
    getWorkerByIdMock.mockResolvedValue({ ...worker, email: "" });
    await expect(emailBookingAuditAction("BK-1001", ["customer", "worker"], "en")).resolves.toEqual({
      ok: false,
      error: "no-email",
    });
    expect(renderAuditPdfMock).not.toHaveBeenCalled();
  });

  it("reports render-failed when no Chrome is available", async () => {
    renderAuditPdfMock.mockRejectedValue(new PdfRenderError());
    await expect(emailBookingAuditAction("BK-1001", ["customer"], "en")).resolves.toEqual({
      ok: false,
      error: "render-failed",
    });
    expect(dispatched.length).toBe(0);
  });

  it("reports send-failed when a provider reports ok:false", async () => {
    dispatchMock.mockResolvedValue([{ channel: "email", ok: false, provider: "smtp", error: "boom" }]);
    await expect(emailBookingAuditAction("BK-1001", ["customer"], "en")).resolves.toEqual({
      ok: false,
      error: "send-failed",
    });
  });

  it("allows the worker on the booking (matched by email)", async () => {
    getSessionMock.mockResolvedValue({ id: "u-worker", name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", role: "worker", hue: 25 });
    const res = await emailBookingAuditAction("BK-1001", ["worker"], "en");
    expect(res).toEqual({ ok: true });
    expect(dispatched[0]!.recipient).toEqual({ name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", locale: "en" });
  });

  it("rejects a different worker", async () => {
    getSessionMock.mockResolvedValue({ id: "u-other-worker", name: "Other", email: "other@plumb.sa", role: "worker", hue: 25 });
    await expect(emailBookingAuditAction("BK-1001", ["worker"], "en")).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
  });
});
