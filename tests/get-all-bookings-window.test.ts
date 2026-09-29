/**
 * getAllBookings({ activeSince }) — the demo adapter's window: a booking is
 * in it when any of its events happened on or after the cutoff.
 */
import { describe, it, expect } from "vitest";
import { getAllBookings } from "@/lib/data/repo";

describe("getAllBookings activeSince (demo)", () => {
  it("keeps only bookings with an event on or after the cutoff", async () => {
    const all = await getAllBookings();
    expect(all.length).toBeGreaterThan(0);
    expect(await getAllBookings({ activeSince: new Date(0) })).toHaveLength(all.length);
    expect(await getAllBookings({ activeSince: new Date(Date.now() + 365 * 86_400_000) })).toEqual([]);

    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const recent = await getAllBookings({ activeSince: cutoff });
    for (const b of recent) {
      expect(b.events.some((e) => Date.parse(e.time) >= cutoff.getTime())).toBe(true);
    }
    const expected = all.filter((b) => b.events.some((e) => Date.parse(e.time) >= cutoff.getTime()));
    expect(recent.map((b) => b.id).sort()).toEqual(expected.map((b) => b.id).sort());
  });
});
