import { describe, expect, it } from "vitest";
import { renderBookingAuditPrint } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";

/**
 * Printable audit-trail export (docs/ENHANCEMENT-PLAN.md §2.4) — the pure
 * document builder shared by the customer booking row and the admin dispute
 * page. Asserts the standalone HTML document carries the full event trail
 * (exact timestamps, status labels, actors, reasons) in both locales, with
 * HTML-escaping of user strings.
 */

const HOUR = 3_600_000;

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
    quote: 15000, // minor units → 150.00
    currency: "SAR",
    events: [
      { status: "requested", actorType: "customer", time: at(5) },
      { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 150", time: at(4) },
      { status: "completed", actorType: "worker", reason: "Job done, receipt issued", time: at(1) },
    ],
    ...overrides,
  };
}

/** The same exact-timestamp format the document renders. */
const exactTime = (iso: string, locale: "en" | "ar") =>
  `${new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" })}, ${new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { timeStyle: "short" })}`;

describe("renderBookingAuditPrint", () => {
  it("renders a standalone EN document with the booking facts + the full event trail", () => {
    const booking = makeBooking();
    const doc = renderBookingAuditPrint(booking, { locale: "en", workerName: "Khaled Al-Harbi" });

    expect(doc).toMatch(/^<!doctype html>/);
    expect(doc).toContain('<html lang="en" dir="ltr">');
    expect(doc).toContain("<title>BK-1001 — Booking audit trail</title>");
    expect(doc).toContain("Booking audit trail");

    // Facts — job, worker, customer (name · phone · email), slot, quote.
    expect(doc).toContain("Leaking kitchen sink repair");
    expect(doc).toContain("Khaled Al-Harbi");
    expect(doc).toContain("Sara Customer · +966 50 000 0000 · sara@example.com");
    expect(doc).toContain("150.00 SAR");

    // The trail — every event with status, actor, reason and exact timestamp.
    expect(doc).toContain("Waiting for response");
    expect(doc).toContain("Confirmed");
    expect(doc).toContain("Completed");
    expect(doc).toContain("Customer");
    expect(doc).toContain("Worker");
    expect(doc).toContain("Can do — quote SAR 150");
    expect(doc).toContain("Job done, receipt issued");
    expect(doc).toContain(exactTime(booking.events[0]!.time, "en"));
    expect(doc).toContain(exactTime(booking.events[2]!.time, "en"));
    // The generated footer (the print timestamp line).
    expect(doc).toContain("Generated on");
  });

  it("renders the RTL Arabic document with localized labels", () => {
    const doc = renderBookingAuditPrint(makeBooking(), { locale: "ar", workerName: "خالد الحربي" });

    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(doc).toContain("سجل تدقيق الحجز");
    expect(doc).toContain("المهمة"); // disputeJob
    expect(doc).toContain("خالد الحربي");
    expect(doc).toContain("بانتظار الرد"); // status label
    expect(doc).toContain("العميل"); // actor — customer
    expect(doc).toContain("العامل"); // actor — worker
    expect(doc).toContain("السبب"); // reason column header
    expect(doc).toContain("أُنشئ في"); // generated footer
  });

  it("HTML-escapes user-provided strings (no injected markup in the document)", () => {
    const booking = makeBooking({
      jobTitle: "<script>alert(1)</script>",
      note: "<b>urgent</b> & later",
      events: [
        { status: "confirmed", actorType: "worker", reason: "<img src=x onerror=alert(1)>", time: new Date().toISOString() },
      ],
    });
    const doc = renderBookingAuditPrint(booking, { locale: "en", workerName: "A&B <Co>" });

    expect(doc).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(doc).not.toContain("<script>alert(1)");
    expect(doc).toContain("&lt;b&gt;urgent&lt;/b&gt; &amp; later");
    expect(doc).toContain("A&amp;B &lt;Co&gt;");
    expect(doc).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(doc).not.toContain("<img src=x");
  });

  it("renders the no-events row and a dash slot for event-less, slot-less bookings", () => {
    const doc = renderBookingAuditPrint(
      makeBooking({ events: [], startAt: undefined, endAt: undefined }),
      { locale: "en" }
    );
    expect(doc).toContain("No events recorded for this booking.");
    // The scheduled-time fact falls back to a dash when there is no slot.
    expect(doc).toContain("<strong>—</strong>");
  });
});
