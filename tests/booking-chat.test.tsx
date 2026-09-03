// @vitest-environment jsdom
/**
 * §2.3 customer ⇄ worker chat (docs/ENHANCEMENT-PLAN.md §2.3) — the shared
 * BookingChat component: the negotiation thread renders its messages with the
 * sender's side flipped, an in-thread quote chip (minor → major), the WhatsApp
 * deep-link fallback (prefilled with the booking context, targeting the other
 * party's number), and the composer visibility per viewer role (customer and
 * worker write; the admin dispute view is read-only). EN + AR.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingChat } from "@/components/bookings/booking-chat";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Booking, BookingMessage } from "@/lib/data/types";

const {
  sendBookingMessageActionMock,
  acceptChatQuoteActionMock,
  markChatReadActionMock,
  setChatTypingActionMock,
  getChatPresenceActionMock,
  refreshMock,
} = vi.hoisted(() => ({
  sendBookingMessageActionMock: vi.fn(),
  acceptChatQuoteActionMock: vi.fn(),
  markChatReadActionMock: vi.fn(),
  setChatTypingActionMock: vi.fn(),
  getChatPresenceActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/app/actions/bookings", () => ({
  sendBookingMessageAction: sendBookingMessageActionMock,
  acceptChatQuoteAction: acceptChatQuoteActionMock,
  markChatReadAction: markChatReadActionMock,
  setChatTypingAction: setChatTypingActionMock,
  getChatPresenceAction: getChatPresenceActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

// Mock EventSource for SSE connection in BookingChat.
// In jsdom, SSE doesn't really work, so we simulate an immediate error
// to trigger the polling fallback (which the tests verify).
const mockEventSourceInstances: Array<{ close: ReturnType<typeof vi.fn>; onerror: (() => void) | null }> = [];
const mockEventSource = vi.fn(() => {
  const instance = {
    onopen: null as (() => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as (() => void) | null,
    close: vi.fn(),
  };
  mockEventSourceInstances.push(instance);
  // Fire onerror on next microtask so the component falls back to polling
  queueMicrotask(() => instance.onerror?.());
  return instance;
});
// @ts-expect-error — jsdom doesn't define EventSource
globalThis.EventSource = mockEventSource as unknown as typeof EventSource;

beforeEach(() => {
  markChatReadActionMock.mockResolvedValue({ ok: true, count: 0 });
  setChatTypingActionMock.mockResolvedValue({ ok: true });
  getChatPresenceActionMock.mockResolvedValue({
    ok: true,
    presence: { typingRole: null, typingAt: null, readAt: {} },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const booking = {
  id: "bk-1001",
  number: "BK-1001",
  jobTitle: "Fix a leaking pipe",
  currency: "SAR",
  status: "requested",
  quote: 15_000,
} as unknown as Booking;

const messages: BookingMessage[] = [
  { id: "m1", bookingId: "bk-1001", senderRole: "customer", text: "Can you come Thursday?", time: "2026-08-10T09:00:00.000Z" },
  { id: "m2", bookingId: "bk-1001", senderRole: "worker", text: "Thursday works — 10am.", quote: 15_000, time: "2026-08-10T09:05:00.000Z" },
];

function renderChat(locale: "en" | "ar" = "en", props: Partial<Parameters<typeof BookingChat>[0]> = {}) {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <BookingChat
        booking={booking}
        messages={messages}
        viewerRole="customer"
        workerName="Khaled Al-Harbi"
        workerWhatsapp="966501234567"
        {...props}
      />
    </LocaleProvider>
  );
}

describe("BookingChat — thread rendering", () => {
  it("renders the toggle with the message count, then the thread when expanded", () => {
    renderChat();
    const toggle = screen.getByRole("button", { name: /Chat/ });
    expect(toggle).toHaveTextContent("2");
    fireEvent.click(toggle);
    expect(screen.getByText("Can you come Thursday?")).toBeInTheDocument();
    expect(screen.getByText("Thursday works — 10am.")).toBeInTheDocument();
  });

  it("renders the in-thread quote chip (minor → major units)", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.getByText("Quote:")).toBeInTheDocument();
    // 15_000 minor → 150 major.
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it("shows the worker name on the worker's bubbles", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.getByText("Khaled Al-Harbi")).toBeInTheDocument();
  });
});

describe("BookingChat — WhatsApp fallback", () => {
  it("customer view links to the worker's number with the booking context prefilled", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    const link = screen.getByRole("link", { name: /Continue on WhatsApp/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("https://wa.me/966501234567?text=");
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("BK-1001");
  });

  it("worker view links to the customer's phone (no whatsapp prop needed)", () => {
    const withPhone = { ...booking, customerPhone: "+966 55 123 4871" } as unknown as Booking;
    renderChat("en", { booking: withPhone, viewerRole: "worker", workerWhatsapp: undefined });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    const link = screen.getByRole("link", { name: /Continue on WhatsApp/ });
    expect(link.getAttribute("href")).toContain("https://wa.me/966551234871?text=");
  });

  it("admin view has no WhatsApp fallback (read-only trail)", () => {
    renderChat("en", { viewerRole: "admin" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByRole("link", { name: /Continue on WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe("BookingChat — composer per role", () => {
  it("customer sees the composer (no quote field)", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.getByPlaceholderText("Write a message…")).toBeInTheDocument();
    expect(screen.queryByText("Attach a quote (optional)")).not.toBeInTheDocument();
  });

  it("worker sees the quote-sharing field", () => {
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.getByText("Attach a quote (optional)")).toBeInTheDocument();
  });

  it("admin view is read-only — no composer", () => {
    renderChat("en", { viewerRole: "admin" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByPlaceholderText("Write a message…")).not.toBeInTheDocument();
  });

  it("sends text + optional quote through the action and refreshes", async () => {
    sendBookingMessageActionMock.mockResolvedValue({ ok: true });
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));

    const textarea = screen.getByPlaceholderText("Write a message…");
    fireEvent.change(textarea, { target: { value: "My price is 120" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));

    await vi.waitFor(() => expect(sendBookingMessageActionMock).toHaveBeenCalledTimes(1));
    const [bookingId, fd] = sendBookingMessageActionMock.mock.calls[0] as [string, FormData];
    expect(bookingId).toBe("bk-1001");
    expect(fd.get("text")).toBe("My price is 120");
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});

describe("BookingChat — accept the worker's quote in-thread", () => {
  it("customer sees the Accept button on the worker's quoted message while requested, and clicking it confirms", async () => {
    acceptChatQuoteActionMock.mockResolvedValue({ ok: true });
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));

    const accept = screen.getByRole("button", { name: /Accept this quote/ });
    expect(accept).toBeInTheDocument();
    fireEvent.click(accept);

    await vi.waitFor(() => expect(acceptChatQuoteActionMock).toHaveBeenCalledTimes(1));
    expect(acceptChatQuoteActionMock).toHaveBeenCalledWith("bk-1001", "m2");
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("hides the button once the booking is no longer negotiable", () => {
    renderChat("en", { booking: { ...booking, status: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByRole("button", { name: /Accept this quote/ })).not.toBeInTheDocument();
  });

  it("is not shown to the worker (they proposed it) or the admin (read-only trail)", () => {
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByRole("button", { name: /Accept this quote/ })).not.toBeInTheDocument();

    cleanup();
    renderChat("en", { viewerRole: "admin" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByRole("button", { name: /Accept this quote/ })).not.toBeInTheDocument();
  });

  it("does not render on a quote-less message", () => {
    const noQuote = [{ id: "m3", bookingId: "bk-1001", senderRole: "worker", text: "I'll be there at 10am.", time: "2026-08-10T09:05:00.000Z" }];
    renderChat("en", { messages: noQuote });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(screen.queryByRole("button", { name: /Accept this quote/ })).not.toBeInTheDocument();
  });

  it("Arabic: labels the accept button in Arabic and fires the action", async () => {
    acceptChatQuoteActionMock.mockResolvedValue({ ok: true });
    renderChat("ar");
    fireEvent.click(screen.getByRole("button", { name: /المحادثة/ }));
    const accept = screen.getByRole("button", { name: /قبول هذا العرض/ });
    fireEvent.click(accept);
    await vi.waitFor(() => expect(acceptChatQuoteActionMock).toHaveBeenCalledWith("bk-1001", "m2"));
  });
});

describe("BookingChat — read receipts + typing presence", () => {
  it("marks the thread read on expand and polls presence while open (customer view)", async () => {
    vi.useFakeTimers();
    try {
      renderChat();
      fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
      await vi.waitFor(() => expect(markChatReadActionMock).toHaveBeenCalledWith("bk-1001"));
      expect(getChatPresenceActionMock).toHaveBeenCalledWith("bk-1001");
      const callsAfterOpen = getChatPresenceActionMock.mock.calls.length;

      // The poll ticks every 3s while the thread stays open.
      await vi.advanceTimersByTimeAsync(3000);
      expect(getChatPresenceActionMock.mock.calls.length).toBeGreaterThan(callsAfterOpen);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark read or poll on the admin dispute view (read-only trail)", () => {
    renderChat("en", { viewerRole: "admin" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    expect(markChatReadActionMock).not.toHaveBeenCalled();
    expect(getChatPresenceActionMock).not.toHaveBeenCalled();
  });

  it("shows the typing indicator when the OTHER party is composing (worker → customer view)", async () => {
    getChatPresenceActionMock.mockResolvedValue({
      ok: true,
      presence: { typingRole: "worker", typingAt: new Date().toISOString(), readAt: {} },
    });
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    await vi.waitFor(() => expect(screen.getByText("Khaled Al-Harbi is typing…")).toBeInTheDocument());
  });

  it("uses the actor label for the customer typing (worker view), and hides the indicator for the viewer's own role", async () => {
    getChatPresenceActionMock.mockResolvedValue({
      ok: true,
      presence: { typingRole: "customer", typingAt: new Date().toISOString(), readAt: {} },
    });
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    await vi.waitFor(() => expect(screen.getByText(/Customer is typing/)).toBeInTheDocument());

    // Own-role typing (e.g. the worker seeing their own flag) renders nothing.
    getChatPresenceActionMock.mockResolvedValue({
      ok: true,
      presence: { typingRole: "worker", typingAt: new Date().toISOString(), readAt: {} },
    });
    cleanup();
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    await vi.waitFor(() => expect(getChatPresenceActionMock).toHaveBeenCalled());
    expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
  });

  it("shows 'Seen' on the viewer's own bubbles once the message has a readAt (polled map included)", async () => {
    getChatPresenceActionMock.mockResolvedValue({
      ok: true,
      presence: { typingRole: null, typingAt: null, readAt: { m2: "2026-08-14T10:00:00.000Z" } },
    });
    // m2 is the worker's message — seen from the worker's own side.
    renderChat("en", { viewerRole: "worker" });
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));
    await vi.waitFor(() => expect(screen.getByText("Seen")).toBeInTheDocument());
  });

  it("sends the typing flag on compose and clears it on send", async () => {
    sendBookingMessageActionMock.mockResolvedValue({ ok: true });
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /Chat/ }));

    const textarea = screen.getByPlaceholderText("Write a message…");
    fireEvent.change(textarea, { target: { value: "hi there" } });
    expect(setChatTypingActionMock).toHaveBeenCalledWith("bk-1001", true);

    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    await vi.waitFor(() => expect(sendBookingMessageActionMock).toHaveBeenCalled());
    expect(setChatTypingActionMock).toHaveBeenCalledWith("bk-1001", false);
  });
});

describe("BookingChat — Arabic", () => {
  it("renders the thread with Arabic copy and the quote chip", () => {
    renderChat("ar");
    fireEvent.click(screen.getByRole("button", { name: /المحادثة/ }));
    expect(screen.getByText("Can you come Thursday?")).toBeInTheDocument();
    expect(screen.getByText("السعر:")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("اكتب رسالة…")).toBeInTheDocument();
  });
});
