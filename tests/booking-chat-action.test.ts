/**
 * §2.3 customer ⇄ worker chat (docs/ENHANCEMENT-PLAN.md §2.3) —
 * sendBookingMessageAction: the permission gate (platform admin / the owning
 * customer matched by customerId or email / the worker on the booking matched
 * by worker id or email), text validation, the optional in-thread quote
 * (major units from the form → minor ×100), and the not-found path. Session
 * and the repo seam are mocked; the message payload the seam receives is
 * asserted verbatim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  acceptChatQuoteAction,
  getChatPresenceAction,
  markChatReadAction,
  sendBookingMessageAction,
  setChatTypingAction,
} from "@/app/actions/bookings";
import type { Booking, BookingMessageInput, Worker } from "@/lib/data/types";

const {
  getSessionMock,
  getBookingByIdMock,
  getWorkerByIdMock,
  sendBookingMessageMock,
  acceptChatQuoteMock,
  markChatReadMock,
  setChatTypingMock,
  getChatPresenceMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getBookingByIdMock: vi.fn(),
  getWorkerByIdMock: vi.fn(),
  sendBookingMessageMock: vi.fn(),
  acceptChatQuoteMock: vi.fn(),
  markChatReadMock: vi.fn(),
  setChatTypingMock: vi.fn(),
  getChatPresenceMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth-demo", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/data/repo", () => ({
  cancelBooking: vi.fn(),
  cancelRecurringContract: vi.fn(),
  confirmBookingCompletion: vi.fn(),
  confirmBookingPayment: vi.fn(),
  createBookingCheckout: vi.fn(),
  createBookingRequest: vi.fn(),
  createQuoteRequest: vi.fn(),
  createRecurringRequest: vi.fn(),
  generateSlots: vi.fn(),
  getAllBookings: vi.fn(),
  getBookingById: getBookingByIdMock,
  getBookingByNumber: vi.fn(),
  getWorkerById: getWorkerByIdMock,
  getWorkerBySlug: vi.fn(),
  getWorkerSlots: vi.fn(),
  rescheduleBooking: vi.fn(),
  respondToBooking: vi.fn(),
  respondToRecurring: vi.fn(),
  acceptChatQuote: acceptChatQuoteMock,
  markChatRead: markChatReadMock,
  setChatTyping: setChatTypingMock,
  getChatPresence: getChatPresenceMock,
  selectQuote: vi.fn(),
  sendBookingMessage: sendBookingMessageMock,
  setSlotBlocked: vi.fn(),
  submitQuote: vi.fn(),
  transitionBooking: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const worker: Worker = { id: "w-khaled", email: "khaled@plumbfix.sa" } as unknown as Worker;
const booking = {
  id: "bk-1001",
  number: "BK-1001",
  workerId: "w-khaled",
  customerId: "u-sara",
  customerEmail: "sara@example.com",
} as unknown as Booking;

function fd(text: string, quote?: string) {
  const f = new FormData();
  f.set("text", text);
  if (quote !== undefined) f.set("quote", quote);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  getBookingByIdMock.mockResolvedValue(booking);
  getWorkerByIdMock.mockResolvedValue(worker);
  sendBookingMessageMock.mockResolvedValue({ id: "msg-1", bookingId: booking.id, senderRole: "customer", text: "hi", time: new Date().toISOString() });
});

describe("sendBookingMessageAction — permission gate", () => {
  it("rejects a signed-out session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await sendBookingMessageAction("bk-1001", fd("hi"))).toEqual({ ok: false, error: "unauthorized" });
    expect(sendBookingMessageMock).not.toHaveBeenCalled();
  });

  it("lets the owning customer send (customerId match)", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    const res = await sendBookingMessageAction("bk-1001", fd("Can you come Thursday?"));
    expect(res).toEqual({ ok: true });
    const input = sendBookingMessageMock.mock.calls[0][1] as BookingMessageInput;
    expect(input).toMatchObject({ senderRole: "customer", senderId: "u-sara", text: "Can you come Thursday?" });
  });

  it("lets the owning customer send by email match", async () => {
    getSessionMock.mockResolvedValue({ id: "other", email: "sara@example.com", role: "customer" });
    expect((await sendBookingMessageAction("bk-1001", fd("hi"))).ok).toBe(true);
  });

  it("rejects a customer who doesn't own the booking", async () => {
    getSessionMock.mockResolvedValue({ id: "u-other", email: "other@example.com", role: "customer" });
    expect(await sendBookingMessageAction("bk-1001", fd("hi"))).toEqual({ ok: false, error: "unauthorized" });
  });

  it("lets the worker on the booking send (id match)", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", email: "khaled@plumbfix.sa", role: "worker" });
    const res = await sendBookingMessageAction("bk-1001", fd("My price is 120", "120"));
    expect(res).toEqual({ ok: true });
    const input = sendBookingMessageMock.mock.calls[0][1] as BookingMessageInput;
    expect(input).toMatchObject({ senderRole: "worker", senderId: "w-khaled", text: "My price is 120", quote: 12_000 });
  });

  it("rejects a stranger worker (different worker, no email match)", async () => {
    getSessionMock.mockResolvedValue({ id: "w-other", email: "other@example.com", role: "worker" });
    expect(await sendBookingMessageAction("bk-1001", fd("hi"))).toEqual({ ok: false, error: "unauthorized" });
  });

  it("lets a platform admin send", async () => {
    getSessionMock.mockResolvedValue({ id: "u-admin", email: "admin@workersarena.com", role: "admin" });
    expect((await sendBookingMessageAction("bk-1001", fd("Platform note"))).ok).toBe(true);
  });
});

describe("sendBookingMessageAction — validation & errors", () => {
  it("rejects an empty message", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    expect(await sendBookingMessageAction("bk-1001", fd("   "))).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects a negative or non-numeric quote", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", email: "khaled@plumbfix.sa", role: "worker" });
    expect(await sendBookingMessageAction("bk-1001", fd("hi", "-5"))).toEqual({ ok: false, error: "invalid" });
    expect(await sendBookingMessageAction("bk-1001", fd("hi", "abc"))).toEqual({ ok: false, error: "invalid" });
  });

  it("returns not-found when the booking is unknown", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    getBookingByIdMock.mockResolvedValue(null);
    expect(await sendBookingMessageAction("no-such-booking", fd("hi"))).toEqual({ ok: false, error: "not-found" });
  });

  it("revalidates the three surfaces after a successful send", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    await sendBookingMessageAction("bk-1001", fd("hi"));
    expect(revalidatePathMock).toHaveBeenCalledWith("/bookings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/bookings/BK-1001");
  });
});

describe("acceptChatQuoteAction — customer accepts the worker's in-thread quote", () => {
  beforeEach(() => {
    acceptChatQuoteMock.mockResolvedValue({ ...booking, status: "confirmed", quote: 12_000 } as Booking);
  });

  it("rejects a signed-out session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await acceptChatQuoteAction("bk-1001", "msg-1")).toEqual({ ok: false, error: "unauthorized" });
    expect(acceptChatQuoteMock).not.toHaveBeenCalled();
  });

  it("lets the owning customer accept (customerId match) and passes the message id", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    expect(await acceptChatQuoteAction("bk-1001", "msg-42")).toEqual({ ok: true });
    expect(acceptChatQuoteMock).toHaveBeenCalledWith("bk-1001", "msg-42");
  });

  it("lets the owning customer accept by email match", async () => {
    getSessionMock.mockResolvedValue({ id: "other", email: "sara@example.com", role: "customer" });
    expect((await acceptChatQuoteAction("bk-1001", "msg-1")).ok).toBe(true);
  });

  it("rejects a customer who doesn't own the booking", async () => {
    getSessionMock.mockResolvedValue({ id: "u-other", email: "other@example.com", role: "customer" });
    expect(await acceptChatQuoteAction("bk-1001", "msg-1")).toEqual({ ok: false, error: "unauthorized" });
    expect(acceptChatQuoteMock).not.toHaveBeenCalled();
  });

  it("rejects a worker — the accept is customer-only (workers propose, never accept)", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", email: "khaled@plumbfix.sa", role: "worker" });
    expect(await acceptChatQuoteAction("bk-1001", "msg-1")).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns not-found when the booking is unknown", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    getBookingByIdMock.mockResolvedValue(null);
    expect(await acceptChatQuoteAction("no-such-booking", "msg-1")).toEqual({ ok: false, error: "not-found" });
  });

  it("returns not-found when the adapter rejects (already confirmed / not a worker quote)", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    acceptChatQuoteMock.mockResolvedValue(null);
    expect(await acceptChatQuoteAction("bk-1001", "msg-1")).toEqual({ ok: false, error: "not-found" });
  });

  it("revalidates the three surfaces after a successful accept", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    await acceptChatQuoteAction("bk-1001", "msg-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/bookings");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/bookings/BK-1001");
  });
});

describe("presence actions — markChatReadAction / setChatTypingAction / getChatPresenceAction", () => {
  beforeEach(() => {
    markChatReadMock.mockResolvedValue(1);
    setChatTypingMock.mockImplementation(() => {});
    getChatPresenceMock.mockResolvedValue({ typingRole: "worker", typingAt: null, readAt: { "msg-1": "2026-08-14T10:00:00.000Z" } });
  });

  it("markChatReadAction: the owning customer stamps the counterpart's messages read with their role", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    const res = await markChatReadAction("bk-1001");
    expect(res).toEqual({ ok: true, count: 1 });
    expect(markChatReadMock).toHaveBeenCalledWith("bk-1001", "customer");
    expect(revalidatePathMock).toHaveBeenCalledWith("/bookings");
  });

  it("markChatReadAction: the worker stamps with role worker; a stranger is rejected", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", email: "khaled@plumbfix.sa", role: "worker" });
    expect((await markChatReadAction("bk-1001")).ok).toBe(true);
    expect(markChatReadMock).toHaveBeenCalledWith("bk-1001", "worker");

    getSessionMock.mockResolvedValue({ id: "u-other", email: "other@example.com", role: "customer" });
    expect(await markChatReadAction("bk-1001")).toEqual({ ok: false, error: "unauthorized" });
    expect(markChatReadMock).toHaveBeenCalledTimes(1);
  });

  it("presence actions reject signed-out sessions and admins (admin reads the trail read-only)", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await markChatReadAction("bk-1001")).toEqual({ ok: false, error: "unauthorized" });
    expect(await setChatTypingAction("bk-1001", true)).toEqual({ ok: false, error: "unauthorized" });
    expect(await getChatPresenceAction("bk-1001")).toEqual({ ok: false, error: "unauthorized" });

    getSessionMock.mockResolvedValue({ id: "u-admin", email: "admin@workersarena.com", role: "admin" });
    expect(await markChatReadAction("bk-1001")).toEqual({ ok: false, error: "unauthorized" });
    expect(await setChatTypingAction("bk-1001", true)).toEqual({ ok: false, error: "unauthorized" });
    expect(await getChatPresenceAction("bk-1001")).toEqual({ ok: false, error: "unauthorized" });
  });

  it("setChatTypingAction: the worker sets and clears their typing flag with role worker", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", email: "khaled@plumbfix.sa", role: "worker" });
    expect(await setChatTypingAction("bk-1001", true)).toEqual({ ok: true });
    expect(setChatTypingMock).toHaveBeenCalledWith("bk-1001", "worker", true);
    expect(await setChatTypingAction("bk-1001", false)).toEqual({ ok: true });
    expect(setChatTypingMock).toHaveBeenCalledWith("bk-1001", "worker", false);
  });

  it("getChatPresenceAction: returns the presence snapshot with the readAt map", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    const res = await getChatPresenceAction("bk-1001");
    expect(res).toEqual({
      ok: true,
      presence: { typingRole: "worker", typingAt: null, readAt: { "msg-1": "2026-08-14T10:00:00.000Z" } },
    });
  });

  it("returns not-found for an unknown booking across the presence actions", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    getBookingByIdMock.mockResolvedValue(null);
    expect(await markChatReadAction("nope")).toEqual({ ok: false, error: "not-found" });
    expect(await setChatTypingAction("nope", true)).toEqual({ ok: false, error: "not-found" });
    expect(await getChatPresenceAction("nope")).toEqual({ ok: false, error: "not-found" });
  });
});
