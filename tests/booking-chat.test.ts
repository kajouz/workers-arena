/**
 * §2.3 customer ⇄ worker chat (docs/ENHANCEMENT-PLAN.md §2.3) — the demo
 * adapter + seam round-trip: a thread keyed on Booking.id, oldest-first
 * ordering, actor stamping (role + optional real user id), quote sharing
 * (minor units) and the unknown-booking rejection. The demo adapter is real;
 * only next/cache is mocked (the seam needs no session — the action gates).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  demoAcceptChatQuote,
  demoGetBookingById,
  demoGetBookingMessages,
  demoGetWorkerSlots,
  demoMarkChatRead,
  demoSendBookingMessage,
  resetBookingsStore,
} from "../src/lib/data/bookings";
import { getBookingMessages, sendBookingMessage, getBookingById, getChatPresence, setChatTyping } from "../src/lib/data/repo";
import { CHAT_TYPING_TTL_MS, getChatTyping } from "../src/lib/data/chat-presence";
import { getAdminActivityFeed, resetAdminActivityFeed } from "../src/lib/data/activity";
import { buildWhatsappChatLink } from "../src/lib/data/booking-ui";
import type { BookingMessage } from "../src/lib/data/types";

let activityFile: string;

beforeEach(() => {
  resetBookingsStore();
  activityFile = path.join(tmpdir(), `booking-chat-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("demo chat adapter (§2.3)", () => {
  it("starts with an empty thread and appends messages oldest-first", async () => {
    expect(demoGetBookingMessages("bk-1001")).toEqual([]);

    const first = await demoSendBookingMessage("bk-1001", {
      senderRole: "customer",
      text: "Can you come Thursday instead?",
    });
    const second = await demoSendBookingMessage("bk-1001", {
      senderRole: "worker",
      text: "Thursday works — 10am?",
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const thread = demoGetBookingMessages("bk-1001");
    expect(thread.map((m) => m.text)).toEqual(["Can you come Thursday instead?", "Thursday works — 10am?"]);
    expect(thread.map((m) => m.senderRole)).toEqual(["customer", "worker"]);
    expect(thread[0]?.time <= thread[1]?.time).toBe(true);
  });

  it("stamps the sender like an audit entry (role + optional real user id)", async () => {
    const msg = await demoSendBookingMessage("bk-1001", {
      senderRole: "customer",
      senderId: "user-sara",
      text: "Hello!",
    });
    expect(msg).toMatchObject({ bookingId: "bk-1001", senderRole: "customer", senderId: "user-sara", text: "Hello!" });
    expect(typeof msg?.id).toBe("string");
    expect(typeof msg?.time).toBe("string");
  });

  it("shares a quote in minor units (quote sharing)", async () => {
    const msg = await demoSendBookingMessage("bk-1001", {
      senderRole: "worker",
      text: "My price for the job",
      quote: 12_500, // minor
    });
    expect(msg?.quote).toBe(12_500);
    expect(demoGetBookingMessages("bk-1001")[0]?.quote).toBe(12_500);
  });

  it("rejects an unknown booking (null — callers surface not-found)", async () => {
    expect(await demoSendBookingMessage("no-such-booking", { senderRole: "customer", text: "hi" })).toBeNull();
  });

  it("appends a message audit event so negotiations land in the dispute timeline", async () => {
    await demoSendBookingMessage("bk-1001", {
      senderRole: "customer",
      senderId: "user-sara",
      text: "Can you come Thursday instead?",
    });
    await demoSendBookingMessage("bk-1001", {
      senderRole: "worker",
      senderId: "user-khaled",
      text: "Thursday works — 10am, price 120",
      quote: 12_000,
    });

    // Assert against the store's booking directly: bk-1001 is seeded (its
    // trail already opens with "requested"), and every send must have pushed
    // an audit entry (sender = actor, body = reason) onto the end.
    const audit = demoGetBookingById("bk-1001")!.events;
    const appended = audit.slice(-2);
    expect(appended.map((e) => e.status)).toEqual(["message", "message"]);
    expect(appended.map((e) => e.actorType)).toEqual(["customer", "worker"]);
    expect(appended.map((e) => e.actorId)).toEqual(["user-sara", "user-khaled"]);
    expect(appended.map((e) => e.reason)).toEqual([
      "Can you come Thursday instead?",
      "Thursday works — 10am, price 120",
    ]);
  });
});

describe("chat seam (§2.3 — demo branch)", () => {
  it("round-trips through the same seam the action calls", async () => {
    expect(await getBookingMessages("bk-1001")).toEqual([]);

    const sent = await sendBookingMessage("bk-1001", {
      senderRole: "worker",
      senderId: "user-khaled",
      text: "I can do it for 120",
      quote: 12_000,
    });
    expect(sent).not.toBeNull();

    const thread = await getBookingMessages("bk-1001");
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({ senderRole: "worker", quote: 12_000, text: "I can do it for 120" });

    // The gate's booking lookup resolves the same booking.
    const booking = await getBookingById("bk-1001");
    expect(booking?.id).toBe("bk-1001");
    expect(await getBookingById("no-such-booking")).toBeNull();
  });
});

describe("accept chat quote (§2.3 — customer accepts in-thread)", () => {
  it("converts a REQUESTED booking to CONFIRMED with the message quote + fee + slot + audit event", async () => {
    const msg = await demoSendBookingMessage("bk-1001", {
      senderRole: "worker",
      senderId: "user-khaled",
      text: "I can do it for 120",
      quote: 12_000,
    });

    const accepted = await demoAcceptChatQuote("bk-1001", msg!.id);
    expect(accepted).not.toBeNull();
    expect(accepted).toMatchObject({
      id: "bk-1001",
      status: "confirmed",
      quote: 12_000,
      platformFeeRateBps: expect.any(Number),
    });
    // M5 take rate — the fee is a snapshot of the agreed quote.
    expect(accepted!.platformFee).toBeGreaterThan(0);

    // The slot claimed by the request flips to booked.
    const slot = demoGetWorkerSlots(accepted!.workerId).find((s) => s.bookingId === "bk-1001");
    expect(slot?.status).toBe("booked");

    // The confirmation lands in the audit trail as a CUSTOMER action, so the
    // dispute timeline shows the negotiation -> agreement.
    const trail = demoGetBookingById("bk-1001")!.events;
    const last = trail.at(-1)!;
    expect(last).toMatchObject({
      status: "confirmed",
      actorType: "customer",
      reason: "Accepted the worker's chat quote",
    });
  });

  it("is a no-op once the booking is no longer negotiable", async () => {
    const msg = await demoSendBookingMessage("bk-1001", {
      senderRole: "worker",
      text: "My price",
      quote: 9_000,
    });
    await demoAcceptChatQuote("bk-1001", msg!.id);
    // Second accept — the booking is CONFIRMED now — must be rejected.
    expect(await demoAcceptChatQuote("bk-1001", msg!.id)).toBeNull();
    expect(demoGetBookingById("bk-1001")!.status).toBe("confirmed");
  });

  it("rejects a customer message or a worker message without a quote", async () => {
    const byCustomer = await demoSendBookingMessage("bk-1001", { senderRole: "customer", text: "hi" });
    const quoteLess = await demoSendBookingMessage("bk-1001", { senderRole: "worker", text: "I'm on my way" });
    expect(await demoAcceptChatQuote("bk-1001", byCustomer!.id)).toBeNull();
    expect(await demoAcceptChatQuote("bk-1001", quoteLess!.id)).toBeNull();
    expect(demoGetBookingById("bk-1001")!.status).toBe("requested"); // untouched
  });

  it("returns null for an unknown booking or message", async () => {
    expect(await demoAcceptChatQuote("no-such-booking", "msg-x")).toBeNull();
    expect(await demoAcceptChatQuote("bk-1001", "no-such-message")).toBeNull();
  });
});

describe("read receipts + typing presence (§2.3)", () => {
  it("markChatRead stamps ONLY the other party's messages, idempotently", async () => {
    const mine = await demoSendBookingMessage("bk-1001", { senderRole: "customer", text: "hi" });
    const theirs = await demoSendBookingMessage("bk-1001", { senderRole: "worker", text: "hello", quote: 9_000 });

    // The customer opens the thread → the worker's message is seen; the
    // customer's own message stays unread (you can't see your own back).
    expect(demoMarkChatRead("bk-1001", "customer")).toBe(1);
    const thread = demoGetBookingMessages("bk-1001");
    expect(thread.find((m) => m.id === mine!.id)?.readAt).toBeUndefined();
    expect(thread.find((m) => m.id === theirs!.id)?.readAt).toBeDefined();

    // Idempotent — a second read stamps nothing new.
    expect(demoMarkChatRead("bk-1001", "customer")).toBe(0);
    // The worker then opens the thread → the customer's message gets seen.
    expect(demoMarkChatRead("bk-1001", "worker")).toBe(1);
    expect(demoGetBookingMessages("bk-1001").find((m) => m.id === mine!.id)?.readAt).toBeDefined();
  });

  it("typing flag is ephemeral + TTL-guarded, and the presence snapshot merges typing with the readAt map", async () => {
    const theirs = await demoSendBookingMessage("bk-1001", { senderRole: "worker", text: "price?", quote: 5_000 });

    setChatTyping("bk-1001", "worker", true);
    expect(getChatTyping("bk-1001").typingRole).toBe("worker");

    // The demo branch of the seam merges the shared typing flag with the
    // adapter's readAt map — here the customer just read the worker's message.
    demoMarkChatRead("bk-1001", "customer");
    const snapshot = await getChatPresence("bk-1001");
    expect(snapshot.typingRole).toBe("worker");
    expect(snapshot.readAt[theirs!.id]).toBeDefined();

    // TTL — an old flag reads as nobody typing.
    const stale = getChatTyping("bk-1001", Date.now() + CHAT_TYPING_TTL_MS + 1);
    expect(stale.typingRole).toBeNull();
    // Explicit clear also works.
    setChatTyping("bk-1001", "worker", false);
    expect(getChatTyping("bk-1001").typingRole).toBeNull();
  });

  it("resetBookingsStore also clears presence (no stale typing across tests)", () => {
    setChatTyping("bk-1001", "worker", true);
    resetBookingsStore();
    expect(getChatTyping("bk-1001").typingRole).toBeNull();
  });
});

describe("WhatsApp deep-link fallback (pure helper)", () => {
  it("builds a wa.me link with digits stripped to international form + encoded text", () => {
    const href = buildWhatsappChatLink("+966 50 123 4567", "Booking BK-1001 — fix a pipe");
    expect(href).toBe(`https://wa.me/${"966501234567"}?text=${encodeURIComponent("Booking BK-1001 — fix a pipe")}`);
  });

  it("strips non-digits entirely", () => {
    expect(buildWhatsappChatLink("+1 (555) 010-9999", "hi")).toBe("https://wa.me/15550109999?text=hi");
  });
});
