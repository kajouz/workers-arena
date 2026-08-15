// @vitest-environment jsdom
/**
 * QuoteRequestCard closing-window test (docs/multi-candidate-quotes.md §7 +
 * ENHANCEMENT-PLAN §2.2): an OPEN quote job shows the live "Closes in Nh Nm"
 * line drained by the SAME urgency bar as the booking rows' request SLA
 * (the shared SlaUrgencyBar against the real QUOTE_SLA_MS deadline), ticking
 * and draining green → amber → red; non-open jobs show no closing window.
 * The i18n parity test covers EN/AR — one locale plus one Arabic case here.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QuoteRequestCard } from "@/components/bookings/quote-request-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { QuoteRequest } from "@/lib/data/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The actions are mocked — these tests assert what the customer SEES, not what
// the action persists (the adapter tests cover that in node env).
vi.mock("@/app/actions/bookings", () => ({
  availableSlotsAction: vi.fn(async () => ({ ok: true, slots: [] })),
  selectQuoteAction: vi.fn(async () => ({ ok: true })),
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup — unmount
// between tests or the card's state leaks into the next case.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Deterministic clock per test — the closing window derives from Date.now()
// against the fixed expiry, so the asserted line/bar are stable.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

const NOW = Date.parse("2026-08-10T09:00:00.000Z");

const workers = {
  w1: { nameEn: "Khaled Al-Harbi", nameAr: "خالد الحربي", slug: "khaled-al-harbi", hue: 210 },
  w2: undefined,
};

function makeQuote(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "qr-1",
    number: "QR-2026-00001",
    customerId: "c1",
    customerName: "Sara Customer",
    customerPhone: "+966 5x xxx xxxx",
    jobTitle: "AC repair at home",
    note: "Two units, one is leaking",
    categorySlug: "hvac",
    citySlug: "riyadh",
    status: "open",
    // 36h of the 48h QUOTE_SLA_MS window remaining → the bar starts 75% green.
    createdAt: new Date(NOW - 12 * 3_600_000).toISOString(),
    expiresAt: new Date(NOW + 36 * 3_600_000).toISOString(),
    bookings: [
      { id: "bk-1", workerId: "w1", status: "quoted", quote: 15000, currency: "SAR" },
      { id: "bk-2", workerId: "w2", status: "quoting", quote: undefined, currency: "SAR" },
    ],
    ...overrides,
  } as unknown as QuoteRequest;
}

function renderCard(quote: QuoteRequest, locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <QuoteRequestCard quoteRequest={quote} workers={workers} nowSeed={NOW} />
    </LocaleProvider>
  );
}

describe("QuoteRequestCard closing window", () => {
  it("shows the live closing line drained by the shared urgency bar for an open job", () => {
    renderCard(makeQuote());

    // The closing line carries the exact remaining time…
    expect(screen.getByText("Closes in 36h 0m")).toBeInTheDocument();

    // …and the urgency bar mirrors the request-SLA drain: 36h/48h → 75% green.
    const bar = screen.getByRole("progressbar", { name: "Closes in 36h 0m" });
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(bar.firstElementChild).toHaveClass("bg-emerald-500");
    expect(bar.firstElementChild).not.toHaveClass("animate-pulse-soft");
  });

  it("ticks and drains green → amber → red against the real QUOTE_SLA_MS deadline", () => {
    renderCard(makeQuote());

    const read = () => {
      const m = screen.getByText(/Closes in \d+h \d+m/).textContent?.match(/(\d+)h (\d+)m/);
      if (!m) throw new Error("closing line missing");
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const before = read();

    // Past a 30s tick (61s beats Math.ceil rounding) — the deadline is fixed,
    // so the remaining time MUST visibly drop (a pinned/static render fails).
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(read()).toBeLessThan(before);

    const fill = () => screen.getByRole("progressbar").firstElementChild as HTMLElement;

    // +20h → ~16h of 48h left (33%) → amber, no pulse.
    act(() => {
      vi.advanceTimersByTime(20 * 3_600_000);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    expect(fill()).toHaveClass("bg-amber-500");
    expect(fill()).not.toHaveClass("animate-pulse-soft");

    // +7h more → ~9h left (19%) → red AND pulsing to draw the eye.
    act(() => {
      vi.advanceTimersByTime(7 * 3_600_000);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "19");
    expect(fill()).toHaveClass("bg-red-500", "animate-pulse-soft");
  });

  it("renders no closing window for a closed quote job", () => {
    renderCard(makeQuote({ status: "selected", expiresAt: undefined }));
    expect(screen.queryByText(/Closes in/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("localizes the closing line in Arabic", () => {
    renderCard(makeQuote(), "ar");
    expect(screen.getByText("يُغلق خلال 36 س 0 د")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "يُغلق خلال 36 س 0 د" })).toBeInTheDocument();
  });
});
