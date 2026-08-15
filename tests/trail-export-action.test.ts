/**
 * §2.4 admin trails export (docs/ENHANCEMENT-PLAN.md §2.4) —
 * exportBookingTrailsAction: admin-only, loads EVERY booking's trail and
 * returns the flat CSV or the combined audit PDF (base64) for the client to
 * download. Session, repo seam, worker lookup and the PDF renderer are
 * mocked; the export builders stay real so the payloads are asserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportBookingTrailsAction } from "@/app/actions/bookings";
import { PdfRenderError } from "@/lib/data/booking-pdf";
import type { Booking } from "@/lib/data/types";

const { getSessionMock, getAllBookingsMock, getWorkerByIdMock, renderAuditPdfMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    getAllBookingsMock: vi.fn(),
    getWorkerByIdMock: vi.fn(),
    renderAuditPdfMock: vi.fn(),
  })
);

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
  getAllBookings: getAllBookingsMock,
  getBookingByNumber: vi.fn(),
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
  dispatch: vi.fn(),
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
  status: "confirmed",
  currency: "SAR",
  events: [
    { status: "requested", actorType: "customer", time: new Date().toISOString() },
    { status: "confirmed", actorType: "worker", reason: "Can do", time: new Date().toISOString() },
  ],
};

const worker = { id: "w-khaled", nameEn: "Khaled Al-Harbi", nameAr: "خالد الحربي", email: "khaled@plumbfix.sa" } as unknown as import("@/lib/data/types").Worker;

beforeEach(() => {
  getSessionMock.mockResolvedValue({ id: "u-admin", name: "Admin", email: "admin@workersarena.com", role: "admin", hue: 280 });
  getAllBookingsMock.mockResolvedValue([booking]);
  getWorkerByIdMock.mockResolvedValue(worker);
  renderAuditPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 trails"));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("exportBookingTrailsAction", () => {
  it("rejects invalid args", async () => {
    await expect(exportBookingTrailsAction("xlsx" as "csv", "en")).resolves.toEqual({ ok: false, error: "invalid" });
    await expect(exportBookingTrailsAction("csv", "fr" as "en")).resolves.toEqual({ ok: false, error: "invalid" });
    expect(getAllBookingsMock).not.toHaveBeenCalled();
  });

  it("rejects non-admins", async () => {
    getSessionMock.mockResolvedValue({ id: "u-customer", name: "Sara", email: "sara@example.com", role: "customer", hue: 200 });
    await expect(exportBookingTrailsAction("csv", "en")).resolves.toEqual({ ok: false, error: "unauthorized" });
    await expect(exportBookingTrailsAction("pdf", "en")).resolves.toEqual({ ok: false, error: "unauthorized" });
    expect(getAllBookingsMock).not.toHaveBeenCalled();
  });

  it("rejects when there are no bookings", async () => {
    getAllBookingsMock.mockResolvedValue([]);
    await expect(exportBookingTrailsAction("csv", "en")).resolves.toEqual({ ok: false, error: "no-data" });
    await expect(exportBookingTrailsAction("pdf", "en")).resolves.toEqual({ ok: false, error: "no-data" });
  });

  it("returns the localized CSV with the count and the worker display names", async () => {
    const res = await exportBookingTrailsAction("csv", "ar");
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(res.pdfBase64).toBeUndefined();
    expect(res.csv).toContain("\uFEFFالحجز,المهمة,العامل");
    expect(res.csv).toContain("خالد الحربي"); // localized worker name threaded in
    expect(renderAuditPdfMock).not.toHaveBeenCalled();
  });

  it("renders the combined audit document to a PDF and returns it as base64", async () => {
    const res = await exportBookingTrailsAction("pdf", "en");
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(res.csv).toBeUndefined();
    expect(res.pdfBase64).toBe(Buffer.from("%PDF-1.4 trails").toString("base64"));

    // The combined document (renderBookingTrailsPrint) was handed to the PDF
    // renderer with the resolved worker names + locale.
    expect(renderAuditPdfMock).toHaveBeenCalledTimes(1);
    const html = renderAuditPdfMock.mock.calls[0]![0] as string;
    expect(html).toContain("Booking audit trails");
    expect(html).toContain("BK-1001");
    expect(html).toContain("Khaled Al-Harbi");
    expect(html).toContain("Can do");
  });

  it("reports render-failed when no Chrome is available", async () => {
    renderAuditPdfMock.mockRejectedValue(new PdfRenderError());
    await expect(exportBookingTrailsAction("pdf", "en")).resolves.toEqual({ ok: false, error: "render-failed" });
  });
});
