// @vitest-environment jsdom
/**
 * ────────────────────────────────────────────────────────────────────────────
 * "OPEN" ON A WORKER CARD MEANS OPEN
 * ────────────────────────────────────────────────────────────────────────────
 * The card shows a pulsing green pill — the universal live-status affordance —
 * and it was wired to `worker.emergency`, a flag that means the worker OFFERS
 * 24/7 callouts. The two are unrelated:
 *
 *   • a plumber advertising emergency work read as "Open" at 3am on a Sunday,
 *     whether or not they were;
 *   • a worker open right now read as closed unless they happened to offer
 *     emergency service.
 *
 * It is the one signal a customer acts on immediately, so it has to come from
 * the working hours. These tests pin both directions against a fixed clock.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { WorkerCard } from "@/components/shared/worker-card";
import { isOpenNow } from "@/lib/utils";
import type { Worker } from "@/lib/data/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/search",
}));

// The whole card is a Link; in jsdom that would need Next's router context.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Wednesday 2026-09-16, 10:00 local — inside a 09:00–17:00 weekday shift. */
const WEDNESDAY_10AM = new Date(2026, 8, 16, 10, 0, 0);
/** Same Wednesday at 22:00 — outside it. */
const WEDNESDAY_10PM = new Date(2026, 8, 16, 22, 0, 0);

function workerWith(hours: Worker["hours"], emergency: boolean): Worker {
  return {
    id: "w-1",
    slug: "test-worker",
    nameEn: "Test Worker",
    nameAr: "عامل",
    categorySlug: "plumbing",
    citySlug: "beirut",
    hue: 25,
    rating: 4.8,
    reviewCount: 30,
    emergency,
    premium: false,
    featured: false,
    verified: true,
    hours,
    services: [],
    reviews: [],
    yearsExp: 8,
    bioEn: "Plumbing.",
    bioAr: "سباكة.",
    priceMin: 80,
    currency: "USD",
    subscription: { plan: "premium", status: "active" },
  } as unknown as Worker;
}

/** 09:00–17:00 Mon–Fri, closed at weekends. */
const OFFICE_HOURS: Worker["hours"] = Array.from({ length: 7 }, (_, day) => ({
  day,
  open: "09:00",
  close: "17:00",
  closed: day === 0 || day === 6,
}));

function renderCard(worker: Worker) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <WorkerCard worker={worker} />
    </LocaleProvider>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("isOpenNow — the source of truth", () => {
  it("is true inside the day's hours and false outside them", () => {
    const worker = workerWith(OFFICE_HOURS, false);
    expect(isOpenNow(worker, WEDNESDAY_10AM)).toBe(true);
    expect(isOpenNow(worker, WEDNESDAY_10PM)).toBe(false);
  });

  it("is false on a closed day regardless of the hours row", () => {
    const worker = workerWith(OFFICE_HOURS, false);
    const sunday = new Date(2026, 8, 20, 10, 0, 0);
    expect(sunday.getDay()).toBe(0);
    expect(isOpenNow(worker, sunday)).toBe(false);
  });

  it("treats 00:00–00:00 as round the clock", () => {
    const allDay: Worker["hours"] = Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "00:00",
    }));
    expect(isOpenNow(workerWith(allDay, false), WEDNESDAY_10PM)).toBe(true);
  });

  it("says 'not open' for a worker with no hours on file, instead of throwing", () => {
    // `hours` is typed as required but is genuinely optional at runtime: the
    // Prisma adapter does not always load the relation, and a worker who never
    // filled in a schedule has none. This used to throw inside the card.
    expect(isOpenNow({ hours: undefined }, WEDNESDAY_10AM)).toBe(false);
    expect(isOpenNow({ hours: [] }, WEDNESDAY_10AM)).toBe(false);
  });

  it("ignores the emergency flag entirely", () => {
    // The whole bug in one assertion: offering emergency callouts says nothing
    // about whether the worker is open at this moment.
    expect(isOpenNow(workerWith(OFFICE_HOURS, true), WEDNESDAY_10PM)).toBe(false);
  });
});

describe("the card's Open pill", () => {
  it("shows for a worker inside their hours", async () => {
    vi.setSystemTime(WEDNESDAY_10AM);
    renderCard(workerWith(OFFICE_HOURS, false));
    await vi.runOnlyPendingTimersAsync();
    expect(screen.queryByText(/open/i)).not.toBeNull();
  });

  it("stays hidden outside their hours, even when they offer emergency work", async () => {
    vi.setSystemTime(WEDNESDAY_10PM);
    renderCard(workerWith(OFFICE_HOURS, true));
    await vi.runOnlyPendingTimersAsync();
    expect(
      screen.queryByText(/^open$/i),
      "an emergency-capable worker is not automatically open"
    ).toBeNull();
  });

  it("claims no status in the SERVER render, whatever the build clock said", async () => {
    // These cards are prerendered. A clock read during the build would bake in
    // whatever "now" meant at deploy time and ship it to every reader for the
    // life of that deploy — and disagree with the browser at hydration.
    //
    // Asserted against renderToString rather than through RTL: `render()`
    // flushes effects, so it always shows the post-mount state and can never
    // observe what the server actually emits.
    const { renderToString } = await import("react-dom/server");
    vi.useRealTimers(); // renderToString must not be driven by fake timers
    const html = renderToString(
      <LocaleProvider locale="en" dir="ltr">
        <WorkerCard worker={workerWith(OFFICE_HOURS, false)} />
      </LocaleProvider>
    );
    expect(html).not.toMatch(/>Open</);
  });
});
