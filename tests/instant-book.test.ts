import { describe, expect, it } from "vitest";
import {
  INSTANT_BOOK_MIN_LEAD_MINUTES,
  MAX_PACKAGE_PRICE,
  instantBookDecision,
  instantBookableService,
  instantServices,
  publishablePackage,
} from "../src/lib/data/instant-book";
import { WORKERS, demoSetWorkerServicePackage } from "../src/lib/data/workers";

const NOW = Date.parse("2026-09-22T09:00:00.000Z");
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

/**
 * A fixed-price job package — the shape the engine exists to sell. Prices are
 * MAJOR units, exactly as `ServiceItem.price` is stored (a $150 package), so
 * these fixtures mirror real rows rather than a convenient number.
 */
const PACKAGE = { price: 150, unit: "job" as const, fixedPrice: true };

describe("instantBookDecision — the five conditions", () => {
  it("sells a fixed-price job on an available slot that is far enough out", () => {
    const decision = instantBookDecision({
      instantBook: true,
      service: PACKAGE,
      slot: { startAt: at(60 * 24), status: "available" },
      now: NOW,
    });
    expect(decision).toEqual({ ok: true, price: 150, priceMinor: 15_000, depositMinor: 15_000 });
  });

  it("quotes the published price in MINOR units — the $150 / 15000 boundary", () => {
    // The bug this pins: `ServiceItem.price` is major units but a booking
    // `quote` is minor. Without the conversion a $150 package is charged as
    // $1.50, and the customer's card is charged a penny per dollar.
    const decision = instantBookDecision({
      instantBook: true,
      service: { price: 120, unit: "job", fixedPrice: true },
      slot: { startAt: at(60 * 24), status: "available" },
      now: NOW,
    });
    expect(decision).toMatchObject({ price: 120, priceMinor: 12_000, depositMinor: 12_000 });
  });

  it("rounds a fractional catalog price before converting, never half a cent", () => {
    const decision = instantBookDecision({
      instantBook: true,
      service: { price: 99.6, unit: "job", fixedPrice: true },
      slot: { startAt: at(60 * 24), status: "available" },
      now: NOW,
    });
    expect(decision).toMatchObject({ price: 100, priceMinor: 10_000 });
  });

  it("never drafts a worker who has not opted in", () => {
    for (const instantBook of [false, null, undefined]) {
      expect(
        instantBookDecision({
          instantBook,
          service: PACKAGE,
          slot: { startAt: at(60 * 24), status: "available" },
          now: NOW,
        })
      ).toEqual({ ok: false, reason: "worker-off" });
    }
  });

  it("refuses a service that is not sold at a published fixed price", () => {
    expect(
      instantBookDecision({
        instantBook: true,
        service: { price: 150, unit: "job", fixedPrice: false },
        slot: { startAt: at(60 * 24), status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "no-fixed-price" });

    expect(
      instantBookDecision({ instantBook: true, service: null, slot: { startAt: at(60 * 24), status: "available" }, now: NOW })
    ).toEqual({ ok: false, reason: "no-service" });
  });

  it("refuses an hourly RATE — there is no total to charge, so 'hourly' wins", () => {
    // The trap: a fixedPrice flag on an hourly item. Charging its rate as a
    // total would overcharge the customer outright, so the unit decides.
    expect(
      instantBookDecision({
        instantBook: true,
        service: { price: 25, unit: "hour", fixedPrice: true },
        slot: { startAt: at(60 * 24), status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "hourly" });
  });

  it("refuses a price of zero rather than selling the job for nothing", () => {
    expect(
      instantBookDecision({
        instantBook: true,
        service: { price: 0, unit: "job", fixedPrice: true },
        slot: { startAt: at(60 * 24), status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "no-fixed-price" });
  });

  it("refuses a slot that is not AVAILABLE (reserved, booked, or blocked)", () => {
    for (const status of ["reserved", "booked", "blocked"] as const) {
      expect(
        instantBookDecision({ instantBook: true, service: PACKAGE, slot: { startAt: at(60 * 24), status }, now: NOW })
      ).toEqual({ ok: false, reason: "slot-unavailable" });
    }
    expect(
      instantBookDecision({ instantBook: true, service: PACKAGE, slot: null, now: NOW })
    ).toEqual({ ok: false, reason: "slot-unavailable" });
  });

  it("refuses the past, and refuses inside the minimum lead time", () => {
    expect(
      instantBookDecision({ instantBook: true, service: PACKAGE, slot: { startAt: at(-1), status: "available" }, now: NOW })
    ).toEqual({ ok: false, reason: "slot-past" });

    // Exactly at the boundary is allowed; a minute inside is not.
    expect(
      instantBookDecision({
        instantBook: true,
        service: PACKAGE,
        slot: { startAt: at(INSTANT_BOOK_MIN_LEAD_MINUTES), status: "available" },
        now: NOW,
      })
    ).toMatchObject({ ok: true });
    expect(
      instantBookDecision({
        instantBook: true,
        service: PACKAGE,
        slot: { startAt: at(INSTANT_BOOK_MIN_LEAD_MINUTES - 1), status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "too-soon" });
  });

  it("tolerates junk without producing a sale", () => {
    expect(
      instantBookDecision({
        instantBook: true,
        service: { price: Number.NaN, unit: "job", fixedPrice: true },
        slot: { startAt: "not-a-date", status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "no-fixed-price" });

    expect(
      instantBookDecision({
        instantBook: true,
        service: PACKAGE,
        slot: { startAt: "not-a-date", status: "available" },
        now: NOW,
      })
    ).toEqual({ ok: false, reason: "slot-unavailable" });
  });
});

describe("instantBookableService / instantServices — what a surface may advertise", () => {
  it("advertises a service only when the worker opted in AND it is a fixed-price job", () => {
    expect(instantBookableService({ instantBook: true, service: PACKAGE, now: NOW })).toBe(true);
    expect(instantBookableService({ instantBook: false, service: PACKAGE, now: NOW })).toBe(false);
    expect(
      instantBookableService({ instantBook: true, service: { price: 25, unit: "hour", fixedPrice: false }, now: NOW })
    ).toBe(false);
  });

  it("filters a worker's service list down to the instantly sellable ones", () => {
    const services = [
      { nameEn: "Pipe repair", nameAr: "إصلاح أنبوب", price: 150, unit: "job" as const, fixedPrice: true },
      { nameEn: "Hourly labour", nameAr: "عمل بالساعة", price: 25, unit: "hour" as const, fixedPrice: true },
      { nameEn: "Custom build", nameAr: "بناء مخصص", price: 900, unit: "job" as const, fixedPrice: false },
    ];
    expect(instantServices(services, true, NOW).map((s) => s.nameEn)).toEqual(["Pipe repair"]);
    expect(instantServices(services, false, NOW)).toEqual([]);
  });
});

describe("publishablePackage — the supply side the opt-in needs", () => {
  const JOB = { nameEn: "AC Repair", unit: "job" as const };

  it("publishes a per-job service at the typed price, in major units", () => {
    expect(publishablePackage(JOB, 150)).toEqual({
      ok: true,
      nameEn: "AC Repair",
      price: 150,
      fixedPrice: true,
    });
  });

  it("rounds a fractional price to whole major units", () => {
    expect(publishablePackage(JOB, 99.6)).toMatchObject({ ok: true, price: 100 });
    expect(publishablePackage(JOB, "40" as unknown as number)).toMatchObject({ ok: true, price: 40 });
  });

  it("refuses an hourly service — a rate is not a total", () => {
    // The dangerous case: publishing an hourly rate as a package would charge
    // one hour's rate for a whole job.
    expect(publishablePackage({ nameEn: "Labour", unit: "hour" }, 25)).toEqual({
      ok: false,
      reason: "hourly",
    });
  });

  it("refuses a service that is not on the worker's catalog", () => {
    expect(publishablePackage(null, 100)).toEqual({ ok: false, reason: "unknown-service" });
    expect(publishablePackage({ nameEn: "", unit: "job" }, 100)).toEqual({
      ok: false,
      reason: "unknown-service",
    });
  });

  it("refuses zero, negative, non-numeric and absurd prices", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_PACKAGE_PRICE + 1]) {
      expect(publishablePackage(JOB, bad)).toEqual({ ok: false, reason: "invalid-price" });
    }
    expect(publishablePackage(JOB, MAX_PACKAGE_PRICE)).toMatchObject({ ok: true });
  });
});

describe("demoSetWorkerServicePackage — publishing round-trips in the demo catalog", () => {
  it("publishes, updates, and withdraws without losing the listed price", () => {
    const worker = WORKERS[0]!;
    const service = worker.services.find((s) => s.unit === "job")!;
    const before = { price: service.price, fixedPrice: service.fixedPrice };
    try {
      const published = demoSetWorkerServicePackage(worker.id, service.nameEn, 222, true);
      expect(published?.services.find((s) => s.nameEn === service.nameEn)).toMatchObject({
        price: 222,
        fixedPrice: true,
      });

      // Withdrawing is not un-pricing: the service returns to being a quoted
      // item at the price it was last published at.
      const withdrawn = demoSetWorkerServicePackage(worker.id, service.nameEn, 999, false);
      expect(withdrawn?.services.find((s) => s.nameEn === service.nameEn)).toMatchObject({
        price: 222,
        fixedPrice: false,
      });
    } finally {
      demoSetWorkerServicePackage(worker.id, service.nameEn, before.price, Boolean(before.fixedPrice));
    }
  });

  it("returns null for an unknown worker or an unknown service", () => {
    const worker = WORKERS[0]!;
    expect(demoSetWorkerServicePackage(worker.id, "Not A Service", 10, true)).toBeNull();
    expect(demoSetWorkerServicePackage("no-such-worker", "AC Repair", 10, true)).toBeNull();
  });
});
