import { describe, expect, it } from "vitest";
import {
  bucketBookings,
  dayLabel,
  formatDayDate,
  formatSlotRange,
  groupSlotsByDay,
  hasFreeSlotsThisWeek,
  responseRateFromCounts,
  slotDayKey,
} from "../src/lib/data/booking-ui";
import type { Booking, BookingSlot } from "../src/lib/data/types";

function slot(startAt: string, status: BookingSlot["status"] = "available", endAt?: string): BookingSlot {
  return {
    id: `s-${startAt}`,
    workerId: "w1",
    startAt,
    endAt: endAt ?? new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
    status,
  };
}

describe("slotDayKey", () => {
  it("returns a YYYY-MM-DD local-date key", () => {
    const d = new Date(2026, 7, 12, 9, 0); // Aug 12, 2026 09:00 local
    expect(slotDayKey(d.toISOString())).toBe("2026-08-12");
  });
});

describe("groupSlotsByDay", () => {
  it("groups slots by local day and sorts chronologically", () => {
    const d1 = new Date(2026, 7, 12, 9, 0).toISOString();
    const d2 = new Date(2026, 7, 12, 11, 0).toISOString();
    const d3 = new Date(2026, 7, 13, 9, 0).toISOString();
    const groups = groupSlotsByDay([slot(d3), slot(d2), slot(d1)]);

    expect(groups.map((g) => g.dayKey)).toEqual(["2026-08-12", "2026-08-13"]);
    expect(groups[0]!.slots.map((s) => s.startAt)).toEqual([d1, d2]); // chronological within day
    expect(groups[1]!.slots).toHaveLength(1);
  });

  it("returns [] for no slots", () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });
});

describe("formatSlotRange", () => {
  it("renders an HH:MM – HH:MM range (24h) in English", () => {
    const start = new Date(2026, 7, 12, 9, 0).toISOString();
    const end = new Date(2026, 7, 12, 10, 0).toISOString();
    expect(formatSlotRange({ startAt: start, endAt: end }, "en")).toBe("09:00 – 10:00");
  });

  it("formats Arabic with Arabic digits", () => {
    const start = new Date(2026, 7, 12, 9, 0).toISOString();
    const end = new Date(2026, 7, 12, 10, 0).toISOString();
    // ar-EG uses Eastern Arabic numerals — must not equal the en rendering.
    const ar = formatSlotRange({ startAt: start, endAt: end }, "ar");
    expect(ar).not.toBe("09:00 – 10:00");
    expect(ar).toContain("–");
  });
});

describe("dayLabel", () => {
  const today = new Date(2026, 7, 12, 12, 0); // Wednesday

  it("labels today", () => {
    const d = new Date(2026, 7, 12, 9, 0).toISOString();
    expect(dayLabel(d, today)).toEqual({ kind: "today", weekday: 3 });
  });

  it("labels tomorrow", () => {
    const d = new Date(2026, 7, 13, 9, 0).toISOString();
    expect(dayLabel(d, today)).toEqual({ kind: "tomorrow", weekday: 4 });
  });

  it("labels later days as a plain weekday", () => {
    const d = new Date(2026, 7, 15, 9, 0).toISOString(); // Saturday
    expect(dayLabel(d, today)).toEqual({ kind: "weekday", weekday: 6 });
  });
});

describe("formatDayDate", () => {
  it("renders a short weekday-date label", () => {
    const d = new Date(2026, 7, 15, 9, 0).toISOString();
    const en = formatDayDate(d, "en");
    expect(en).toMatch(/Sat/);
    expect(en).toMatch(/15/);
  });
});

describe("bucketBookings", () => {
  function booking(id: string, startAt: string, status: Booking["status"]): Booking {
    return {
      id,
      number: `BK-${id}`,
      workerId: "w1",
      customerName: "Customer",
      customerPhone: "+000",
      jobTitle: "Job",
      startAt,
      endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
      status,
      currency: "SAR",
      events: [],
    };
  }

  it("buckets REQUESTED into requests, confirmed/inProgress/pendingPayment into upcoming, the rest into past", () => {
    const all = [
      booking("1", "2026-08-10T09:00:00.000Z", "requested"),
      booking("2", "2026-08-10T10:00:00.000Z", "confirmed"),
      booking("3", "2026-08-09T09:00:00.000Z", "completed"),
      booking("4", "2026-08-08T09:00:00.000Z", "declined"),
      booking("5", "2026-08-11T09:00:00.000Z", "inProgress"),
      booking("6", "2026-08-07T09:00:00.000Z", "cancelled"),
      booking("7", "2026-08-12T09:00:00.000Z", "pendingPayment"),
      booking("8", "2026-08-06T09:00:00.000Z", "noShow"),
    ];
    const { requests, upcoming, past } = bucketBookings(all);
    expect(requests.map((b) => b.id)).toEqual(["1"]);
    expect(upcoming.map((b) => b.id).sort()).toEqual(["2", "5", "7"]);
    expect(past.map((b) => b.id).sort()).toEqual(["3", "4", "6", "8"]);
  });

  it("sorts each bucket newest-first regardless of input order", () => {
    const all = [
      booking("early", "2026-08-01T09:00:00.000Z", "completed"),
      booking("late", "2026-08-10T09:00:00.000Z", "completed"),
    ];
    const { past } = bucketBookings(all);
    expect(past.map((b) => b.id)).toEqual(["late", "early"]);
  });

  it("handles an empty list", () => {
    expect(bucketBookings([])).toEqual({ requests: [], upcoming: [], past: [] });
  });
});

describe("responseRateFromCounts (W1 — shared with the prisma adapter)", () => {
  it("returns null when there is no history", () => {
    expect(responseRateFromCounts(0, 0)).toBeNull();
  });

  it("returns 0 when nothing was answered", () => {
    expect(responseRateFromCounts(0, 2)).toBe(0);
  });

  it("computes the answered share rounded to the nearest percent", () => {
    expect(responseRateFromCounts(4, 5)).toBe(80);
    expect(responseRateFromCounts(1, 3)).toBe(33);
  });

  it("returns 100 when everything was answered", () => {
    expect(responseRateFromCounts(2, 2)).toBe(100);
  });
});

describe("hasFreeSlotsThisWeek (W1 — availability signal)", () => {
  const NOW = new Date("2026-08-12T08:00:00.000Z");
  const in3d = new Date(NOW.getTime() + 3 * 86400000).toISOString();
  const in10d = new Date(NOW.getTime() + 10 * 86400000).toISOString();

  it("true when an AVAILABLE slot starts within the next 7 days", () => {
    expect(hasFreeSlotsThisWeek([slot(in3d, "available")], NOW)).toBe(true);
  });

  it("false for reserved/booked/blocked slots — only AVAILABLE counts", () => {
    expect(hasFreeSlotsThisWeek([slot(in3d, "reserved"), slot(in3d, "booked"), slot(in3d, "blocked")], NOW)).toBe(false);
  });

  it("false when the only free slot starts beyond the window", () => {
    expect(hasFreeSlotsThisWeek([slot(in10d, "available")], NOW)).toBe(false);
  });

  it("false for an empty list and skips unparsable timestamps", () => {
    expect(hasFreeSlotsThisWeek([], NOW)).toBe(false);
    expect(hasFreeSlotsThisWeek([{ ...slot(in3d), startAt: "not-a-date" }], NOW)).toBe(false);
  });
});
