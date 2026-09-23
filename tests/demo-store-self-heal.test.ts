/**
 * The demo booking store lives on globalThis so every Turbopack entry graph
 * shares one copy. That makes ADOPTION a contract: a long-lived `next dev`
 * process keeps whatever object it created first, so a field added to the store
 * afterwards read as `undefined` in that process — which is exactly how the
 * `settlements` map took down every worker profile and /search render during
 * development (STORE.settlements.get is read by withSlaSignal on each row).
 *
 * The store must heal the adopted object: fill what is missing, never reset what
 * is already there. These tests pin both halves.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const KEY = "__workersArenaDemoBookingStore";
const globalStore = globalThis as Record<string, unknown>;

/** The shape an older build left behind — everything EXCEPT `settlements`. */
function staleStore() {
  return {
    counter: 1001,
    bookings: [],
    slots: [],
    payments: new Map(),
    invoiceYear: 0,
    invoiceSeq: 0,
    ledger: [],
    ledgerSeq: 0,
    recurrings: [],
    recurringSeq: 1001,
    quoteRequests: [],
    quoteYear: 0,
    quoteSeq: 1001,
    messages: new Map(),
    msgSeq: 0,
  };
}

afterEach(() => {
  delete globalStore[KEY];
  vi.resetModules();
});

describe("demo booking store adoption", () => {
  it("heals a store that predates a field instead of crashing on it", async () => {
    globalStore[KEY] = staleStore();

    const mod = await import("../src/lib/data/bookings");

    // The missing map is the whole point: reading it must not throw.
    expect(() => mod.demoGetBookingSettlementPayment("bk-does-not-exist")).not.toThrow();
    expect(mod.demoGetBookingSettlementPayment("bk-does-not-exist")).toBeNull();
    expect(mod.demoGetAllBookings()).toEqual([]);
  });

  it("adopts the existing store rather than resetting it", async () => {
    const existing = staleStore();
    existing.counter = 4242;
    globalStore[KEY] = existing;

    await import("../src/lib/data/bookings");

    // Same object, same numbers: a second graph adopting the store must not
    // re-seed it (that would lose every demo booking created so far).
    expect(globalStore[KEY]).toBe(existing);
    expect((globalStore[KEY] as { counter: number }).counter).toBe(4242);
  });
});
