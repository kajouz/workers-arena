/**
 * §2.4 admin trails export (docs/ENHANCEMENT-PLAN.md §2.4) — the flat CSV
 * twin and the combined PDF document of EVERY booking's event trail, both
 * mirroring the per-booking print view: same labels, same facts, same events,
 * same escaping.
 */
import { describe, it, expect } from "vitest";
import { buildBookingTrailsCsv } from "@/lib/data/booking-trail-export";
import { renderBookingTrailsPrint } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";

const HOUR = 3_600_000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();

function makeBooking(number: string, workerId: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id: `bk-${number}`,
    number,
    workerId,
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    status: "completed",
    startAt: at(4),
    endAt: at(3),
    currency: "SAR",
    events: [
      { status: "requested", actorType: "customer", time: at(5) },
      { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 150", time: at(4) },
      { status: "completed", actorType: "worker", reason: "Job done, receipt issued", time: at(1) },
    ],
    ...overrides,
  };
}

const WORKERS: Record<string, string> = {
  w1: "Khaled Al-Harbi",
  w2: "Ali Hassan",
};

const bookings = [makeBooking("BK-1002", "w2"), makeBooking("BK-1001", "w1")];

describe("buildBookingTrailsCsv", () => {
  it("emits a header row + one row per event, booking facts prefixed, sorted by number", () => {
    const csv = buildBookingTrailsCsv(bookings, { locale: "en", workerNames: WORKERS });
    // UTF-8 BOM for Excel + CRLF line endings.
    expect(csv.startsWith("\uFEFF")).toBe(true);

    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Booking,Job,Worker,Customer,Status,#,Time,Status,Actor,Reason");
    expect(lines).toHaveLength(1 + 3 + 3); // header + 3 events per booking

    // BK-1001 rows come first (number sort), with the worker's display name.
    const firstBookingRows = lines.slice(1, 4);
    for (const row of firstBookingRows) {
      expect(row.startsWith("BK-1001,Leaking kitchen sink repair,Khaled Al-Harbi,Sara Customer · +966 50 000 0000 · sara@example.com,Completed,")).toBe(true);
    }
    // Event columns: # / time / event status / actor / reason (a comma in
    // the reason gets RFC-4180 quoted).
    expect(firstBookingRows[0]).toContain(",1,");
    expect(firstBookingRows[0]).toContain(",Waiting for response,Customer,");
    expect(firstBookingRows[1]).toContain(",2,");
    expect(firstBookingRows[1]).toContain(",Confirmed,Worker,Can do — quote SAR 150");
    expect(firstBookingRows[2]).toContain(",3,");
    expect(firstBookingRows[2]).toContain(',Completed,Worker,"Job done, receipt issued"');
  });

  it("quotes RFC-4180 fields (commas, quotes) and keeps event-less bookings visible", () => {
    const awkward = makeBooking("BK-1003", "w1", {
      events: [{ status: "confirmed", actorType: "worker", reason: 'said "yes", take the job', time: at(2) }],
    });
    const eventless = makeBooking("BK-1004", "w2", { events: [] });
    const csv = buildBookingTrailsCsv([awkward, eventless], { locale: "en", workerNames: WORKERS });

    const lines = csv.slice(1).trimEnd().split("\r\n");
    // The comma + quotes are quoted and the quotes doubled.
    expect(lines[1]).toContain('"said ""yes"", take the job"');
    // An event-less booking still gets a row (facts + empty event columns).
    const last = lines[lines.length - 1]!;
    expect(last.startsWith("BK-1004,")).toBe(true);
    expect(last.endsWith(",,,,,")).toBe(true);
  });

  it("localizes headers and labels in Arabic", () => {
    const csv = buildBookingTrailsCsv(bookings, { locale: "ar", workerNames: WORKERS });
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("الحجز,المهمة,العامل,العميل,الحالة,#,الوقت,الحالة,الطرف,السبب");
    expect(lines[1]).toContain("مكتمل"); // completed status label
    expect(lines[1]).toContain("العميل"); // customer actor
    expect(lines[2]).toContain("العامل"); // worker actor
  });
});

describe("renderBookingTrailsPrint", () => {
  it("renders ONE document with a section per booking (the per-booking view's markup)", () => {
    const doc = renderBookingTrailsPrint(bookings, { locale: "en", workerNames: WORKERS });

    expect(doc).toMatch(/^<!doctype html>/);
    expect(doc).toContain('<html lang="en" dir="ltr">');
    expect(doc).toContain("<title>Booking audit trails</title>");
    // Header: title + generated-at + booking count.
    expect(doc).toContain("Booking audit trails");
    expect(doc).toContain("2 bookings");

    // One section per booking — number + status heading, worker fact, events.
    expect(doc).toContain('class="number" dir="ltr">BK-1001');
    expect(doc).toContain('class="number" dir="ltr">BK-1002');
    expect(doc).toContain("Khaled Al-Harbi");
    expect(doc).toContain("Ali Hassan");
    expect(doc).toContain("Waiting for response");
    expect(doc).toContain("Can do — quote SAR 150");
    expect(doc).toContain("Job done, receipt issued");
    expect(doc).toContain("Generated on");
  });

  it("renders RTL Arabic with the Arabic title and labels", () => {
    const doc = renderBookingTrailsPrint(bookings, { locale: "ar", workerNames: WORKERS });
    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(doc).toContain("سجلات تدقيق الحجوزات");
    // ar-EG digits in the count (the shared formatter).
    expect(doc).toContain("٢ حجز");
    expect(doc).toContain("بانتظار الرد");
    expect(doc).toContain("العميل");
    expect(doc).toContain("السبب");
  });

  it("HTML-escapes user strings in every section", () => {
    const evil = makeBooking("BK-1005", "w1", {
      jobTitle: "<script>alert(1)</script>",
      events: [{ status: "confirmed", actorType: "worker", reason: "<img src=x onerror=alert(1)>", time: at(1) }],
    });
    const doc = renderBookingTrailsPrint([evil], { locale: "en", workerNames: { w1: "A&B <Co>" } });
    expect(doc).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(doc).not.toContain("<script>alert(1)");
    expect(doc).toContain("A&amp;B &lt;Co&gt;");
    expect(doc).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders an empty-trail document when there are no bookings", () => {
    const doc = renderBookingTrailsPrint([], { locale: "en" });
    expect(doc).toContain("0 bookings");
    expect(doc).toContain("Booking audit trails");
  });
});
