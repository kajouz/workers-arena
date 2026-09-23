/**
 * §WhatsApp booking entry (docs/booking-entry.md). The engine resolves a shared
 * link against LIVE data before the dialog renders — an unresolvable intent is
 * dropped with a reason rather than prefilled, because the alternative is a
 * customer filling a form that the server action then refuses.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTRY,
  buildBookingEntryUrl,
  bookingEntryShareText,
  resolveBookingEntry,
  whatsappShareHref,
} from "../src/lib/data/booking-entry";
import type { BookingSlot, ServiceItem } from "../src/lib/data/types";

const NOW = Date.parse("2026-09-23T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const services = [
  { nameEn: "Deep clean", nameAr: "تنظيف عميق", price: 150, unit: "job", fixedPrice: true },
  { nameEn: "Hourly help", nameAr: "مساعدة بالساعة", price: 25, unit: "hour" },
] as unknown as ServiceItem[];

const slot = (id: string, hoursAhead: number, status: BookingSlot["status"] = "available"): BookingSlot =>
  ({
    id,
    workerId: "w1",
    startAt: new Date(NOW + hoursAhead * HOUR).toISOString(),
    endAt: new Date(NOW + (hoursAhead + 1) * HOUR).toISOString(),
    status,
  }) as BookingSlot;

const slots = [slot("slot-tomorrow", 24), slot("slot-reserved", 30, "reserved"), slot("slot-past", -2)];

const resolve = (over: Partial<Parameters<typeof resolveBookingEntry>[0]> = {}) =>
  resolveBookingEntry({ services, slots, now: NOW, ...over });

describe("resolveBookingEntry", () => {
  it("resolves a service and a bookable slot", () => {
    const intent = resolve({ service: "Deep clean", slotId: "slot-tomorrow", source: "whatsapp" });
    expect(intent).toMatchObject({
      serviceNameEn: "Deep clean",
      slotId: "slot-tomorrow",
      source: "whatsapp",
      dropped: null,
      empty: false,
    });
  });

  it("drops a service that is not on this worker's catalog", () => {
    const intent = resolve({ service: "Roof replacement" });
    expect(intent.serviceNameEn).toBeNull();
    expect(intent.dropped?.reason).toBe("unknown-service");
  });

  it("drops a slot that has been taken", () => {
    const intent = resolve({ service: "Deep clean", slotId: "slot-reserved" });
    expect(intent.serviceNameEn).toBe("Deep clean");
    expect(intent.slotId).toBeNull();
    expect(intent.dropped?.reason).toBe("slot-unavailable");
  });

  it("drops a slot that has already started — a chat thread can be days old", () => {
    const intent = resolve({ slotId: "slot-past" });
    expect(intent.slotId).toBeNull();
    expect(intent.dropped?.reason).toBe("slot-past");
  });

  it("drops a slot id that does not exist at all", () => {
    expect(resolve({ slotId: "slot-ghost" }).dropped?.reason).toBe("slot-unavailable");
  });

  it("keeps the FIRST reason when both parts fail", () => {
    // The service is dropped first, but the slot reason is what the customer can
    // act on, so the first recorded drop is the one reported — the dialog then
    // opens on the service step with no preselection.
    const intent = resolve({ service: "Nope", slotId: "slot-ghost" });
    expect(intent.dropped?.reason).toBe("unknown-service");
  });

  it("accepts an hourly service — a rate is still a bookable request", () => {
    // Only instant PRICING needs a per-job fixed price; the request path is
    // perfectly valid for hourly work, so the entry must not refuse it.
    const intent = resolve({ service: "Hourly help" });
    expect(intent.serviceNameEn).toBe("Hourly help");
    expect(intent.dropped).toBeNull();
  });

  it("is empty for a plain profile visit", () => {
    const intent = resolve({});
    expect(intent).toMatchObject({ serviceNameEn: null, slotId: null, source: null, dropped: null });
    expect(intent.empty).toBe(true);
    expect(EMPTY_ENTRY.empty).toBe(true);
  });

  it("ignores blank and whitespace-only params", () => {
    const intent = resolve({ service: "   ", slotId: "  " });
    expect(intent.serviceNameEn).toBeNull();
    expect(intent.slotId).toBeNull();
    expect(intent.dropped).toBeNull();
  });

  it("caps the attribution source so a link cannot carry a payload", () => {
    const intent = resolve({ source: "x".repeat(200) });
    expect(intent.source).toHaveLength(32);
  });

  it("treats an unparseable start time as unusable rather than bookable", () => {
    const broken = [{ id: "slot-bad", workerId: "w1", startAt: "not-a-date", endAt: "x", status: "available" }] as unknown as BookingSlot[];
    const intent = resolveBookingEntry({ services, slots: broken, slotId: "slot-bad", now: NOW });
    expect(intent.slotId).toBeNull();
    expect(intent.dropped?.reason).toBe("slot-unavailable");
  });
});

describe("buildBookingEntryUrl", () => {
  it("builds a relative link with only the params it was given", () => {
    expect(buildBookingEntryUrl({ path: "/en/workers/bilal" })).toBe("/en/workers/bilal");
    expect(buildBookingEntryUrl({ path: "/en/workers/bilal", serviceNameEn: "Deep clean" })).toBe(
      "/en/workers/bilal?book=Deep+clean"
    );
  });

  it("encodes a service name and slot id safely", () => {
    const url = buildBookingEntryUrl({
      path: "/en/workers/bilal",
      serviceNameEn: "AC repair & install",
      slotId: "slot-1",
      source: "whatsapp",
    });
    expect(url).toContain("book=AC+repair+%26+install");
    expect(url).toContain("slot=slot-1");
    expect(url).toContain("src=whatsapp");
  });

  it("joins an origin without doubling the slash", () => {
    expect(buildBookingEntryUrl({ path: "/en/workers/bilal", origin: "https://workersarena.com/" })).toBe(
      "https://workersarena.com/en/workers/bilal"
    );
  });

  it("round-trips through the resolver", () => {
    const url = buildBookingEntryUrl({ path: "/en/workers/bilal", serviceNameEn: "Deep clean", slotId: "slot-tomorrow", source: "whatsapp" });
    const query = new URLSearchParams(url.split("?")[1]);
    const intent = resolveBookingEntry({
      service: query.get("book"),
      slotId: query.get("slot"),
      source: query.get("src"),
      services,
      slots,
      now: NOW,
    });
    expect(intent).toMatchObject({ serviceNameEn: "Deep clean", slotId: "slot-tomorrow", source: "whatsapp" });
  });
});

describe("share text", () => {
  it("names the worker and the service and carries the link", () => {
    const text = bookingEntryShareText({ workerName: "Bilal Mansour", serviceName: "Deep clean", url: "https://x/y", locale: "en" });
    expect(text).toContain("Bilal Mansour");
    expect(text).toContain("Deep clean");
    expect(text).toContain("https://x/y");
  });

  it("reads naturally in Arabic, with the link intact", () => {
    const text = bookingEntryShareText({ workerName: "بلال منصور", url: "https://x/y", locale: "ar" });
    expect(text).toContain("بلال منصور");
    expect(text).toContain("https://x/y");
  });

  it("encodes the message for the WhatsApp share link", () => {
    const href = whatsappShareHref("hi & bye");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(href).toContain("%26");
  });
});
