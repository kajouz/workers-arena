import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { dispatch, getEnabledChannels, resetChannels } from "../src/lib/notifications/dispatcher";
import { clearPushSubscriptions, forceRemovePushSubscription, getPushSubscription, getPushSubscriptions, listPushSubscriptions, pushOwnerStamp, registerPushSubscription, storeAdapterMode, unregisterPushSubscription } from "../src/lib/notifications/push-store";
import { getAdminActivityFeed, getVerificationFunnel, logAdminActivity, resetAdminActivityFeed, activityAdapterMode, rowToActivityEntry, pruneActivityLog, listActivityEntries, ACTIVITY_TYPES, ACTION_CODES } from "../src/lib/data/activity";
import { pruneDeadPushSubscriptions, sendTestPushSubscription } from "../src/lib/notifications/providers/push";
import { renderBookingEmail, renderEmail, renderPushPayload, renderSmsText, renderWhatsAppText } from "../src/lib/notifications/templates";
import { bookingNotification, customerEmailKind } from "../src/lib/data/booking-notifications";
import type { Booking } from "../src/lib/data/types";
import { runDueReminderEngine, resetReminderEngine, workersDueReminders } from "../src/lib/notifications/reminders";
import { getNotifications, inboxAdapterMode, pushNotification, rowToNotification } from "../src/lib/data/notifications";
import { addLead, addReview } from "../src/lib/data/repo";
import { subscriptionStatus } from "../src/lib/data/subscriptions";
import { WORKERS } from "../src/lib/data/workers";
import { normalizePhone, type ChannelPayload } from "../src/lib/notifications/types";

const payload: ChannelPayload = {
  id: "n-test",
  type: "verification",
  titleEn: "Profile verified ✓",
  titleAr: "تم توثيق الملف ✓",
  bodyEn: "Khaled: your profile now shows the Verified badge.",
  bodyAr: "خالد: ملفك يعرض الآن شارة التوثيق.",
  href: "/dashboard",
  time: new Date().toISOString(),
  recipient: { name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", phone: "+966 55 123 4567" },
};

// Isolate the file-backed push store per test — never touch the live app's
// .data/push-subscriptions.json.
let testStorePath: string;

beforeEach(() => {
  testStorePath = path.join(tmpdir(), `push-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("PUSH_STORE_FILE", testStorePath);
});

afterEach(async () => {
  resetChannels();
  resetReminderEngine();
  await clearPushSubscriptions();
  await rm(testStorePath, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("channel dispatcher", () => {
  it("defaults to console email/sms/push/whatsapp providers in demo mode", () => {
    vi.stubEnv("DEMO_MODE", "true");
    // Ensure no VAPID keys leak from the host env into this test.
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    resetChannels();
    const channels = getEnabledChannels();
    expect(channels.map((c) => c.id)).toEqual(["email", "sms", "push", "whatsapp"]);
    expect(channels.map((c) => c.provider)).toEqual(["console", "console", "console", "console"]);
  });

  it("dispatch fans out to all enabled channels and always resolves ok", async () => {
    const results = await dispatch(payload);
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.channel)).toEqual(["email", "sms", "push", "whatsapp"]);
    for (const r of results) expect(r.ok).toBe(true);
  });

  it("respects explicit channel toggles (all off → no channels)", () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "false");
    vi.stubEnv("NOTIFY_SMS_ENABLED", "false");
    vi.stubEnv("NOTIFY_PUSH_ENABLED", "false");
    vi.stubEnv("NOTIFY_WHATSAPP_ENABLED", "false");
    resetChannels();
    expect(getEnabledChannels()).toHaveLength(0);
  });

  it("a failing provider reports a non-throwing error instead of crashing", async () => {
    // "smtp" without nodemailer installed (or configured host) must degrade gracefully.
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_EMAIL_PROVIDER", "smtp");
    resetChannels();
    const results = await dispatch(payload);
    const email = results.find((r) => r.channel === "email")!;
    expect(email.ok).toBe(false);
    expect(email.error).toBeTruthy();
  });
});

describe("email templates", () => {
  it("renders a bilingual branded email with the CTA link", () => {
    const { subject, html, text } = renderEmail(payload, "en");
    expect(subject).toContain("Profile verified");
    expect(html).toContain("http://localhost:3000/dashboard");
    expect(html).toContain("تم توثيق الملف"); // Arabic secondary block included
    expect(html).toContain("dir=\"ltr\"");
    expect(text).toContain("Khaled");
  });

  it("renders RTL direction for Arabic locale", () => {
    const { html } = renderEmail(payload, "ar");
    expect(html).toContain("dir=\"rtl\"");
    expect(html).toContain("تم توثيق الملف ✓");
  });

  it("escapes user-derived strings (XSS-safe)", () => {
    const evil: ChannelPayload = {
      ...payload,
      bodyEn: '<img src=x onerror="alert(1)"> & more',
      bodyAr: "آمن",
    };
    const { html } = renderEmail(evil, "en");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });

  it("renders a compact web-push payload", () => {
    const raw = renderPushPayload(payload, "en");
    const data = JSON.parse(raw);
    expect(data.title).toBe("Profile verified ✓");
    expect(data.url).toContain("/dashboard");
    expect(data.tag).toContain(payload.id);
    expect(data.dir).toBe("ltr");
    expect(data.lang).toBe("en");
    // Icons reference the icon that actually ships in /public.
    expect(data.icon).toContain("/icon.svg");
    // Click-through URL lives in data for the service worker (public/sw.js).
    expect(data.data.url).toContain("/dashboard");
  });

  it("renders RTL push payloads for Arabic locale", () => {
    const data = JSON.parse(renderPushPayload(payload, "ar"));
    expect(data.dir).toBe("rtl");
    expect(data.lang).toBe("ar");
    expect(data.title).toBe("تم توثيق الملف ✓");
  });

  it("renders in the recipient's preferred locale (RTL emails for Arabic users)", () => {
    const arabic: ChannelPayload = { ...payload, recipient: { ...payload.recipient, locale: "ar" } };
    const { html } = renderEmail(arabic, arabic.recipient!.locale!);
    expect(html).toContain("dir=\"rtl\"");
    expect(html).toContain("تم توثيق الملف ✓");
    const push = JSON.parse(renderPushPayload(arabic, arabic.recipient!.locale!));
    expect(push.dir).toBe("rtl");
    expect(push.lang).toBe("ar");
  });
});

describe("booking-confirmation email", () => {
  /** A bookingConfirmed payload with the structured booking context. */
  const bookingPayload: ChannelPayload = {
    ...payload,
    type: "bookingConfirmed",
    titleEn: "Booking confirmed",
    titleAr: "تم تأكيد الحجز",
    href: "/bookings",
    booking: {
      number: "BK-2048",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T10:00:00.000Z",
      quote: 8000, // 80 major → 8000 minor
      deposit: 2000, // 20 major → 2000 minor
      currency: "SAR",
      jobTitle: "Leaking kitchen sink repair",
    },
  };

  it("renders the details card with number, slot, quote and the admin dispute link", () => {
    const { subject, html, text } = renderBookingEmail(bookingPayload, "en");
    // The subject carries the booking number — inbox scanning matches the feed.
    expect(subject).toContain("Booking confirmed");
    expect(subject).toContain("BK-2048");
    // Details card — booking number, header, quote + deposit (minor ÷ 100).
    expect(html).toContain("Booking details");
    expect(html).toContain("BK-2048");
    expect(html).toContain("SAR 80");
    expect(html).toContain("SAR 20");
    expect(html).toContain("Leaking kitchen sink repair");
    // Customer CTA + the admin dispute-view deep link (feed/funnel story).
    expect(html).toContain("http://localhost:3000/bookings");
    expect(html).toContain("http://localhost:3000/admin/bookings/BK-2048");
    // The Arabic secondary language block still renders.
    expect(html).toContain("تم تأكيد الحجز");
    // Text version carries the same details + admin link.
    expect(text).toContain("Booking: BK-2048");
    expect(text).toContain("/admin/bookings/BK-2048");
  });

  it("renders RTL for Arabic recipients with localized labels", () => {
    const { html } = renderBookingEmail(bookingPayload, "ar");
    expect(html).toContain("dir=\"rtl\"");
    expect(html).toContain("تفاصيل الحجز");
    expect(html).toContain("رقم الحجز");
    expect(html).toContain("الدفعة المقدمة");
  });

  it("omits quote/deposit rows when the booking has none", () => {
    const plain: ChannelPayload = {
      ...bookingPayload,
      booking: { ...bookingPayload.booking!, quote: undefined, deposit: undefined },
    };
    const { html } = renderBookingEmail(plain, "en");
    expect(html).toContain("BK-2048");
    expect(html).not.toContain("SAR 80");
    expect(html).not.toContain("SAR 20");
  });

  it("escapes booking fields (XSS-safe)", () => {
    const evil: ChannelPayload = {
      ...bookingPayload,
      booking: { ...bookingPayload.booking!, jobTitle: '<img src=x onerror="alert(1)"> & more' },
    };
    const { html } = renderBookingEmail(evil, "en");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});

describe("shared booking notification builder", () => {
  function fixture(overrides: Partial<Booking> = {}): Booking {
    return {
      id: "bk-preview",
      number: "BK-2048",
      workerId: "khaled-plum",
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Leaking kitchen sink repair",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T10:00:00.000Z",
      status: "confirmed",
      quote: 8000,
      deposit: 2000,
      currency: "SAR",
      events: [],
      ...overrides,
    };
  }

  it("builds a customer-confirmed payload with the booking context and /bookings href", () => {
    const msg = bookingNotification(fixture(), "customer-confirmed");
    expect(msg.type).toBe("bookingConfirmed");
    expect(msg.href).toBe("/bookings");
    expect(msg.bodyEn).toContain("BK-2048");
    expect(msg.bodyAr).toContain("BK-2048");
    // The structured context the confirmation email renders rides along.
    expect(msg.booking.number).toBe("BK-2048");
    expect(msg.booking.quote).toBe(8000); // minor units, as-is
    expect(msg.booking.deposit).toBe(2000);
    expect(msg.booking.currency).toBe("SAR");
  });

  it("worker kinds deep-link to /dashboard, customer kinds to /bookings", () => {
    expect(bookingNotification(fixture(), "worker-request").href).toBe("/dashboard");
    expect(bookingNotification(fixture(), "worker-cancelled").href).toBe("/dashboard");
    expect(bookingNotification(fixture(), "worker-rescheduled").href).toBe("/dashboard");
    expect(bookingNotification(fixture(), "customer-declined").href).toBe("/bookings");
    expect(bookingNotification(fixture(), "customer-paid").href).toBe("/bookings");
    expect(bookingNotification(fixture(), "customer-completed").href).toBe("/bookings");
  });

  it("customerEmailKind maps the booking state to the LAST email the customer got", () => {
    expect(customerEmailKind(fixture({ status: "requested" }))).toBeNull();
    expect(customerEmailKind(fixture({ status: "noShow" }))).toBeNull();
    expect(customerEmailKind(fixture({ status: "declined" }))).toBe("customer-declined");
    expect(customerEmailKind(fixture({ status: "completed" }))).toBe("customer-completed");
    // Confirmed without a deposit payment → the accept email; with one → the paid email.
    expect(customerEmailKind(fixture({ status: "confirmed", paymentId: undefined }))).toBe("customer-confirmed");
    expect(customerEmailKind(fixture({ status: "confirmed", paymentId: "pay-1" }))).toBe("customer-paid");
    expect(customerEmailKind(fixture({ status: "pendingPayment", paymentId: "pay-1" }))).toBe("customer-paid");
    expect(customerEmailKind(fixture({ status: "inProgress", paymentId: undefined }))).toBe("customer-confirmed");
  });

  it("a customer-initiated cancellation emailed the worker, not the customer", () => {
    const byCustomer = fixture({
      status: "cancelled",
      events: [{ status: "cancelled", actorType: "customer", time: "2026-08-11T10:00:00.000Z" }],
    });
    expect(customerEmailKind(byCustomer)).toBeNull();

    const byWorker = fixture({
      status: "cancelled",
      events: [{ status: "cancelled", actorType: "worker", time: "2026-08-11T10:00:00.000Z" }],
    });
    expect(customerEmailKind(byWorker)).toBe("customer-cancelled");
  });
});

describe("phone normalization (E.164 providers)", () => {
  it("strips formatting from display phone numbers", () => {
    expect(normalizePhone("+966 55 123 4567")).toBe("+966551234567");
    expect(normalizePhone("(+971) 50-778-2194")).toBe("+971507782194");
    expect(normalizePhone(" ")).toBeUndefined();
    expect(normalizePhone(undefined)).toBeUndefined();
  });
});

describe("sms & whatsapp templates", () => {
  it("renders a compact SMS body with the app prefix and tap link", () => {
    const text = renderSmsText(payload, "en");
    expect(text).toContain("[WorkersArena]");
    expect(text).toContain("Profile verified");
    expect(text).toContain("http://localhost:3000/dashboard");
  });

  it("renders SMS in Arabic for Arabic recipients", () => {
    const text = renderSmsText(payload, "ar");
    expect(text).toContain("تم توثيق الملف");
    expect(text).toContain("http://localhost:3000/dashboard");
  });

  it("renders a WhatsApp message with title, body and a labelled link", () => {
    const text = renderWhatsAppText(payload, "en");
    expect(text).toContain("Profile verified ✓");
    expect(text).toContain("View details: http://localhost:3000/dashboard");
  });

  it("renders the WhatsApp link label in Arabic for Arabic recipients", () => {
    const text = renderWhatsAppText(payload, "ar");
    expect(text).toContain("تم توثيق الملف ✓");
    expect(text).toContain("عرض التفاصيل: http://localhost:3000/dashboard");
  });
});

describe("sms channel", () => {
  it("console provider is a benign no-op when the recipient has no phone", async () => {
    vi.stubEnv("NOTIFY_SMS_ENABLED", "true");
    vi.stubEnv("NOTIFY_SMS_PROVIDER", "console");
    resetChannels();
    const results = await dispatch({ ...payload, recipient: { name: "No Phone" } });
    const sms = results.find((r) => r.channel === "sms")!;
    expect(sms.ok).toBe(true);
    expect(sms.provider).toBe("console");
  });

  it("twilio provider without credentials reports a non-throwing error", async () => {
    vi.stubEnv("NOTIFY_SMS_ENABLED", "true");
    vi.stubEnv("NOTIFY_SMS_PROVIDER", "twilio");
    resetChannels();
    const results = await dispatch(payload);
    const sms = results.find((r) => r.channel === "sms")!;
    expect(sms.ok).toBe(false);
    expect(sms.provider).toBe("twilio");
    expect(sms.error).toContain("TWILIO_ACCOUNT_SID");
  });
});

describe("email channel", () => {
  it("console provider prints the full rendered booking email (details card visible in the terminal)", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_EMAIL_PROVIDER", "console");
    resetChannels();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const bookingPayload: ChannelPayload = {
        ...payload,
        type: "bookingConfirmed",
        titleEn: "Booking confirmed",
        titleAr: "تم تأكيد الحجز",
        href: "/bookings",
        booking: {
          number: "BK-2048",
          startAt: "2026-08-12T09:00:00.000Z",
          endAt: "2026-08-12T10:00:00.000Z",
          quote: 8000,
          currency: "SAR",
        },
      };
      const results = await dispatch({ ...bookingPayload, recipient: { name: "Noor E.", email: "noor@example.com" } });
      const email = results.find((r) => r.channel === "email")!;
      expect(email.ok).toBe(true);
      expect(email.provider).toBe("console");

      const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // The rendered card (plain text + full HTML) reaches the terminal.
      expect(logs).toContain("── plain text ──");
      expect(logs).toContain("Booking: BK-2048");
      expect(logs).toContain("── html ──");
      expect(logs).toContain("Booking details");
      expect(logs).toContain("SAR 80");
      expect(logs).toContain("/admin/bookings/BK-2048");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("whatsapp channel", () => {
  it("whatsapp-cloud provider without credentials reports a non-throwing error", async () => {
    vi.stubEnv("NOTIFY_WHATSAPP_ENABLED", "true");
    vi.stubEnv("NOTIFY_WHATSAPP_PROVIDER", "whatsapp-cloud");
    resetChannels();
    const results = await dispatch(payload);
    const wa = results.find((r) => r.channel === "whatsapp")!;
    expect(wa.ok).toBe(false);
    expect(wa.provider).toBe("whatsapp-cloud");
    expect(wa.error).toContain("WHATSAPP_TOKEN");
  });

  it("whatsapp-cloud posts the localized message to the Graph API and succeeds", async () => {
    vi.stubEnv("NOTIFY_WHATSAPP_ENABLED", "true");
    vi.stubEnv("NOTIFY_WHATSAPP_PROVIDER", "whatsapp-cloud");
    vi.stubEnv("WHATSAPP_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    resetChannels();

    const arabic = { ...payload, recipient: { ...payload.recipient, locale: "ar" as const } };
    const results = await dispatch(arabic);
    const wa = results.find((r) => r.channel === "whatsapp")!;
    expect(wa.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body as string) as { messaging_product: string; to: string; text: { body: string; preview_url: boolean } };
    expect(body.messaging_product).toBe("whatsapp");
    // The Cloud API requires clean E.164 — the formatted display number is normalized.
    expect(body.to).toBe("+966551234567");
    expect(body.text.preview_url).toBe(true);
    expect(body.text.body).toContain("تم توثيق الملف");
  });
});

describe("push store adapter selection", () => {
  // Restore file-mode env (temp store path) so afterEach's clearPushSubscriptions
  // stays isolated and never touches the live store or a fake database.
  const restoreFileMode = () => {
    vi.stubEnv("PUSH_STORE_FILE", testStorePath);
    vi.stubEnv("DATABASE_URL", "");
  };

  it("uses the file adapter when PUSH_STORE_FILE is set (test override)", () => {
    vi.stubEnv("PUSH_STORE_FILE", "/tmp/x.json");
    vi.stubEnv("DATABASE_URL", "postgresql://prod");
    expect(storeAdapterMode()).toBe("file");
    restoreFileMode();
  });

  it("uses the file adapter in demo mode (no DATABASE_URL)", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("PUSH_STORE_FILE", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(storeAdapterMode()).toBe("file");
    restoreFileMode();
  });

  it("stays file-backed in demo mode even with a DATABASE_URL set", () => {
    // Mirrors .env: DEMO_MODE=true with an unreachable placeholder DB URL —
    // the app must NOT try to persist push subscriptions to it.
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("PUSH_STORE_FILE", "");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/workersarena");
    expect(storeAdapterMode()).toBe("file");
    restoreFileMode();
  });

  it("uses the Prisma adapter only when demo mode is OFF and a database is configured", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("PUSH_STORE_FILE", "");
    vi.stubEnv("DATABASE_URL", "postgresql://prod");
    expect(storeAdapterMode()).toBe("prisma");
    restoreFileMode();
  });
});

describe("push subscription registry", () => {
  it("validates and dedupes subscriptions by endpoint", async () => {
    const sub = { endpoint: "https://push.example/x", keys: { p256dh: "a", auth: "b" }, ownerId: "u-1" };
    expect(await registerPushSubscription(sub)).toBe(true);
    expect(await registerPushSubscription({ endpoint: "", keys: { p256dh: "a", auth: "b" } })).toBe(false);
    // Same endpoint re-registered → still one entry.
    await registerPushSubscription({ ...sub, ownerId: "u-2" });
    expect(await getPushSubscriptions()).toHaveLength(1);
  });

  it("unregisters a subscription by endpoint (disable flow)", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/a", keys: { p256dh: "a", auth: "b" } });
    await registerPushSubscription({ endpoint: "https://push.example/b", keys: { p256dh: "c", auth: "d" } });
    expect(await unregisterPushSubscription("https://push.example/a")).toBe(true);
    const remaining = await getPushSubscriptions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.endpoint).toBe("https://push.example/b");
  });

  it("blocks unregister of another owner's endpoint (ownership check)", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/mine", keys: { p256dh: "a", auth: "b" }, ownerId: "u-1" });
    expect(await unregisterPushSubscription("https://push.example/mine", "u-2")).toBe(false);
    expect(await getPushSubscriptions()).toHaveLength(1); // still there
    expect(await unregisterPushSubscription("https://push.example/mine", "u-1")).toBe(true);
    expect(await getPushSubscriptions()).toHaveLength(0);
  });

  it("persists the userId FK stamp and matches it in the ownership check", async () => {
    const sub = { endpoint: "https://push.example/real", keys: { p256dh: "a", auth: "b" }, userId: "clx-realuid" };
    await registerPushSubscription(sub);
    const saved = await getPushSubscriptions();
    expect(saved).toHaveLength(1);
    // userId persisted; ownerId absent (JSON round-trip drops undefined keys).
    expect(saved[0]!.userId).toBe("clx-realuid");
    expect(saved[0]!.ownerId).toBeUndefined();
    // Acting id = the same real user → allowed.
    expect(await unregisterPushSubscription("https://push.example/real", "clx-realuid")).toBe(true);
    expect(await getPushSubscriptions()).toHaveLength(0);
  });

  it("blocks unregister when acting id matches neither stamp", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/mix", keys: { p256dh: "a", auth: "b" }, userId: "clx-realuid" });
    expect(await unregisterPushSubscription("https://push.example/mix", "u-worker")).toBe(false);
    expect(await unregisterPushSubscription("https://push.example/mix", "clx-other")).toBe(false);
    expect(await getPushSubscriptions()).toHaveLength(1);
  });
});

describe("push subscription admin management", () => {
  it("lists endpoints with owner, device and activity timestamps", async () => {
    await registerPushSubscription({
      endpoint: "https://push.example/list",
      keys: { p256dh: "a", auth: "b" },
      ownerId: "u-worker",
      device: "Chrome 126 · macOS",
    });
    const rows = await listPushSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ownerId).toBe("u-worker");
    expect(rows[0]!.device).toBe("Chrome 126 · macOS");
    expect(rows[0]!.registeredAt).toBeTruthy();
    expect(rows[0]!.lastActiveAt).toBeTruthy();
  });

  it("re-registering an endpoint bumps lastActiveAt but keeps registeredAt", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/re", keys: { p256dh: "a", auth: "b" }, ownerId: "u-1" });
    const first = await listPushSubscriptions();
    await new Promise((r) => setTimeout(r, 5));
    await registerPushSubscription({ endpoint: "https://push.example/re", keys: { p256dh: "a", auth: "b" }, ownerId: "u-1" });
    const second = await listPushSubscriptions();
    expect(second[0]!.registeredAt).toBe(first[0]!.registeredAt);
    expect(new Date(second[0]!.lastActiveAt).getTime()).toBeGreaterThanOrEqual(new Date(first[0]!.lastActiveAt).getTime());
  });

  it("forceRemove bypasses ownership and deletes any endpoint", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/fr", keys: { p256dh: "a", auth: "b" }, ownerId: "u-1" });
    expect(await forceRemovePushSubscription("https://push.example/fr")).toBe(true);
    expect(await forceRemovePushSubscription("https://push.example/fr")).toBe(false); // idempotent
    expect(await getPushSubscriptions()).toHaveLength(0);
  });

  it("getPushSubscription returns a single endpoint or null", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/single", keys: { p256dh: "a", auth: "b" }, device: "Chrome 126 · macOS" });
    const found = await getPushSubscription("https://push.example/single");
    expect(found?.device).toBe("Chrome 126 · macOS");
    expect(await getPushSubscription("https://push.example/nope")).toBeNull();
  });
});

describe("admin activity feed", () => {
  let activityFile: string;

  beforeEach(() => {
    activityFile = path.join(tmpdir(), `activity-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("logs runtime admin events newest-first", async () => {
    await logAdminActivity({ actionEn: "First", actionAr: "الأول", actor: "System", type: "system" });
    await logAdminActivity({ actionEn: "Second", actionAr: "الثاني", actor: "Admin", type: "verification" });
    const feed = await getAdminActivityFeed();
    expect(feed).toHaveLength(2);
    expect(feed[0]!.actionEn).toBe("Second");
    expect(feed[1]!.actionEn).toBe("First");
    expect(feed[0]!.time).toBeTruthy();
    expect(feed[0]!.id).toBeTruthy();
  });
});

describe("admin activity feed adapter selection", () => {
  function restore() {
    vi.stubEnv("ADMIN_ACTIVITY_FILE", "");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
  }

  it("uses the file adapter when ADMIN_ACTIVITY_FILE is set (test override)", () => {
    vi.stubEnv("ADMIN_ACTIVITY_FILE", "/tmp/a.json");
    vi.stubEnv("DATABASE_URL", "postgresql://prod");
    expect(activityAdapterMode()).toBe("file");
    restore();
  });

  it("uses the file adapter in demo mode (no DATABASE_URL)", () => {
    vi.stubEnv("DEMO_MODE", "true");
    expect(activityAdapterMode()).toBe("file");
    restore();
  });

  it("stays file-backed in demo mode even with a DATABASE_URL set", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/workersarena");
    expect(activityAdapterMode()).toBe("file");
    restore();
  });

  it("uses the Prisma adapter only when demo mode is OFF and a database is configured", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("ADMIN_ACTIVITY_FILE", "");
    vi.stubEnv("DATABASE_URL", "postgresql://prod");
    expect(activityAdapterMode()).toBe("prisma");
    restore();
  });
});

describe("activity retention prune", () => {
  let activityFile: string;

  beforeEach(() => {
    activityFile = path.join(tmpdir(), `activity-prune-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("removes entries older than the retention window and keeps newer ones", async () => {
    const now = Date.now();
    // Write entries with controlled timestamps directly to the file store.
    const { writeFile } = await import("node:fs/promises");
    const entries = [
      { id: "a1", actionEn: "old", actionAr: "قديم", actor: "System", time: new Date(now - 200 * 24 * 3600 * 1000).toISOString(), type: "system" },
      { id: "a2", actionEn: "fresh", actionAr: "جديد", actor: "Admin", time: new Date(now - 10 * 24 * 3600 * 1000).toISOString(), type: "verification" },
    ];
    await writeFile(activityFile, JSON.stringify(entries), "utf8");

    const result = await pruneActivityLog(90);
    expect(result.removed).toBe(1);
    expect(result.remaining).toBe(1);

    const feed = await getAdminActivityFeed();
    expect(feed.map((e) => e.id)).toEqual(["a2"]);
  });

  it("is a no-op when nothing is old enough", async () => {
    await logAdminActivity({ actionEn: "Now", actionAr: "الآن", actor: "System", type: "system" });
    const result = await pruneActivityLog(90);
    expect(result.removed).toBe(0);
    expect(result.remaining).toBe(1);
  });

  it("falls back to the default window when given a NaN retention (garbage env)", async () => {
    await logAdminActivity({ actionEn: "Fresh", actionAr: "جديد", actor: "System", type: "system" });
    const result = await pruneActivityLog(Number("not-a-number"));
    expect(result.removed).toBe(0); // must NOT delete everything
    expect(result.remaining).toBe(1);
  });
});

describe("activity history listing", () => {
  let activityFile: string;

  beforeEach(async () => {
    activityFile = path.join(tmpdir(), `activity-list-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
    await logAdminActivity({ actionEn: "Prune one", actionAr: "تنظيف واحد", actor: "System", type: "system" });
    await logAdminActivity({ actionEn: "Verify two", actionAr: "توثيق اثنان", actor: "Platform Admin", type: "verification" });
    await logAdminActivity({ actionEn: "Prune three", actionAr: "تنظيف ثلاثة", actor: "System", type: "system" });
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("pages newest-first with the requested page size", async () => {
    const page1 = await listActivityEntries({ page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.items[0]!.actionEn).toBe("Prune three"); // newest first
    expect(page1.items[1]!.actionEn).toBe("Verify two");

    const page2 = await listActivityEntries({ page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.actionEn).toBe("Prune one");
  });

  it("filters by type", async () => {
    const result = await listActivityEntries({ type: "verification" });
    expect(result.total).toBe(1);
    expect(result.items[0]!.actionEn).toBe("Verify two");
  });

  it("filters by actor case-insensitively", async () => {
    const result = await listActivityEntries({ actor: "platform" });
    expect(result.total).toBe(1);
    expect(result.items[0]!.actionEn).toBe("Verify two");
  });

  it("exposes the valid type filter options", () => {
    expect(ACTIVITY_TYPES).toEqual(["worker", "company", "review", "payment", "system", "verification", "booking"]);
  });

  it("persists the structured code on file-mode entries", async () => {
    await logAdminActivity({
      code: ACTION_CODES.PUSH_SUBSCRIPTION_PRUNED,
      actionEn: "Prune",
      actionAr: "تنظيف",
      actor: "System",
      type: "system",
    });
    const feed = await getAdminActivityFeed();
    expect(feed[0]!.code).toBe("PUSH_SUBSCRIPTION_PRUNED");
  });

  it("persists the booking number on file-mode booking entries (dispute deep link)", async () => {
    await logAdminActivity({
      code: ACTION_CODES.BOOKING_REQUESTED,
      actionEn: "Sara requested BK-1002 — Fix a pipe",
      actionAr: "سارة طلبت الحجز BK-1002 — إصلاح أنبوب",
      actor: "Sara Customer",
      type: "booking",
      bookingNo: "BK-1002",
    });
    const feed = await getAdminActivityFeed();
    expect(feed[0]!.type).toBe("booking");
    expect(feed[0]!.code).toBe("BOOKING_REQUESTED");
    expect(feed[0]!.bookingNo).toBe("BK-1002");

    // The type filter finds it and the bookingNo survives the listing round-trip.
    const page = await listActivityEntries({ type: "booking" });
    expect(page.items[0]!.bookingNo).toBe("BK-1002");
  });

  it("persists actorId separately from the display name on file-mode entries", async () => {
    await logAdminActivity({
      code: ACTION_CODES.WORKER_VERIFIED,
      actionEn: "Verified",
      actionAr: "توثيق",
      actor: "Platform Admin",
      actorId: "u-admin",
      type: "verification",
    });
    const feed = await getAdminActivityFeed();
    expect(feed[0]!.actor).toBe("Platform Admin");
    expect(feed[0]!.actorId).toBe("u-admin");
  });

  it("resolves the demo actor identity from actorId in file-mode listing", async () => {
    await logAdminActivity({
      code: ACTION_CODES.WORKER_VERIFIED,
      actionEn: "Verified",
      actionAr: "توثيق",
      actor: "Platform Admin",
      actorId: "u-admin",
      type: "verification",
    });
    const page = await listActivityEntries({});
    const entry = page.items.find((e) => e.actorId === "u-admin");
    expect(entry?.actorUser).toEqual({
      id: "u-admin",
      name: "Platform Admin",
      email: "admin@workersarena.com",
      hue: 280,
    });
  });

  it("logs the worker's submit with VERIFICATION_REQUEST_SUBMITTED and no actorId", async () => {
    await logAdminActivity({
      code: ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED,
      actionEn: "Khaled Al-Harbi submitted a verification request",
      actionAr: "خالد الحربي أرسل طلب توثيق",
      actor: "Khaled Al-Harbi",
      type: "verification",
    });
    const feed = await getAdminActivityFeed();
    const entry = feed[0]!;
    expect(entry.code).toBe("VERIFICATION_REQUEST_SUBMITTED");
    expect(entry.actor).toBe("Khaled Al-Harbi");
    expect(entry.actorId).toBeUndefined(); // worker-side: no admin FK
    expect(entry.type).toBe("verification");
  });

  it("filters by exact structured code", async () => {
    await logAdminActivity({
      code: ACTION_CODES.PUSH_SUBSCRIPTION_PRUNED,
      actionEn: "Prune",
      actionAr: "تنظيف",
      actor: "System",
      type: "system",
    });
    await logAdminActivity({
      code: ACTION_CODES.WORKER_VERIFIED,
      actionEn: "Verified",
      actionAr: "توثيق",
      actor: "Platform Admin",
      type: "verification",
    });
    const pruned = await listActivityEntries({ code: "PUSH_SUBSCRIPTION_PRUNED" });
    expect(pruned.total).toBe(1);
    expect(pruned.items[0]!.code).toBe("PUSH_SUBSCRIPTION_PRUNED");

    const verified = await listActivityEntries({ code: "WORKER_VERIFIED" });
    expect(verified.total).toBe(1);
    expect(verified.items[0]!.code).toBe("WORKER_VERIFIED");

    // Unknown codes are ignored (no crash) — the filter falls back to all
    // entries (3 seeded by the describe + the 2 logged above).
    const unknown = await listActivityEntries({ code: "NOT_A_REAL_CODE" });
    expect(unknown.total).toBe(5);
  });
});

describe("verification funnel (getVerificationFunnel)", () => {
  let funnelFile: string;

  beforeEach(() => {
    funnelFile = path.join(tmpdir(), `funnel-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", funnelFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(funnelFile, { force: true }).catch(() => {});
  });

  it("buckets the three workflow codes within the window and computes rates", async () => {
    await logAdminActivity({
      code: ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED,
      actionEn: "Req 1", actionAr: "طلب ١", actor: "Khaled", type: "verification",
    });
    await logAdminActivity({
      code: ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED,
      actionEn: "Req 2", actionAr: "طلب ٢", actor: "Tariq", type: "verification",
    });
    await logAdminActivity({
      code: ACTION_CODES.WORKER_VERIFIED,
      actionEn: "Approved", actionAr: "توثيق", actor: "Admin", type: "verification",
    });
    await logAdminActivity({
      code: ACTION_CODES.VERIFICATION_DECLINED,
      actionEn: "Declined", actionAr: "رفض", actor: "Admin", type: "verification",
    });
    // A non-funnel code must not leak into the counts.
    await logAdminActivity({
      code: ACTION_CODES.PUSH_SUBSCRIPTION_PRUNED,
      actionEn: "Prune", actionAr: "تنظيف", actor: "System", type: "system",
    });

    const funnel = await getVerificationFunnel(30);
    expect(funnel).toEqual({
      requests: 2,
      approved: 1,
      declined: 1,
      approvalRate: 50, // 1 / (1 + 1)
      conversionRate: 50, // 1 / 2
    });
  });

  it("ignores entries outside the window", async () => {
    const old = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    // Seed the isolated feed file directly with an aged request entry.
    await writeFile(funnelFile, JSON.stringify([
      { id: "old-1", actionEn: "Old", actionAr: "قديم", actor: "X", type: "verification", code: ACTION_CODES.VERIFICATION_REQUEST_SUBMITTED, time: old },
    ]));

    const funnel = await getVerificationFunnel(30);
    expect(funnel.requests).toBe(0);
    expect(funnel.approvalRate).toBe(0);
    expect(funnel.conversionRate).toBe(0);
  });

  it("returns zeroed funnel for an empty feed", async () => {
    const funnel = await getVerificationFunnel(30);
    expect(funnel).toEqual({ requests: 0, approved: 0, declined: 0, approvalRate: 0, conversionRate: 0 });
  });

  it("clamps NaN days to the 30-day default", async () => {
    const funnel = await getVerificationFunnel(Number.NaN);
    expect(funnel.requests).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(funnel.approvalRate)).toBe(true);
  });
});

describe("ACTION_CODES structured codes", () => {
  it("defines stable machine-readable codes for every logged event", () => {
    expect(ACTION_CODES).toEqual({
      WORKER_VERIFIED: "WORKER_VERIFIED",
      VERIFICATION_DECLINED: "VERIFICATION_DECLINED",
      VERIFICATION_REQUEST_SUBMITTED: "VERIFICATION_REQUEST_SUBMITTED",
      PUSH_SUBSCRIPTION_PRUNED: "PUSH_SUBSCRIPTION_PRUNED",
      PUSH_SUBSCRIPTION_REMOVED: "PUSH_SUBSCRIPTION_REMOVED",
      PUSH_TEST_SEND_DELIVERED: "PUSH_TEST_SEND_DELIVERED",
      PUSH_TEST_SEND_FAILED: "PUSH_TEST_SEND_FAILED",
      BOOKING_REQUESTED: "BOOKING_REQUESTED",
      BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
      BOOKING_CANCELLED: "BOOKING_CANCELLED",
      BOOKING_RESCHEDULED: "BOOKING_RESCHEDULED",
      BOOKING_NO_SHOW: "BOOKING_NO_SHOW",
      CAMPAIGN_REFUNDED: "CAMPAIGN_REFUNDED",
      ADMIN_PLAN_CHANGED: "ADMIN_PLAN_CHANGED",
      SYSTEM: "SYSTEM",
      VERIFICATION: "VERIFICATION",
    });
  });
});

describe("rowToActivityEntry round-trip", () => {
  it("reconstructs the app entry losslessly from the meta JSON column", () => {
    const entry = rowToActivityEntry({
      id: "cuid-act-1",
      action: "PUSH_SUBSCRIPTION_PRUNED", // structured machine code — display copy lives in meta
      actorId: "cuid-admin-9", // real user id in the FK column
      actor: { id: "cuid-admin-9", name: "Platform Admin", email: "admin@workersarena.com", hue: 280 }, // JOINed user
      meta: {
        actionEn: "Push subscription pruned: …",
        actionAr: "إزالة اشتراك إشعارات: …",
        type: "system",
        code: "PUSH_SUBSCRIPTION_PRUNED",
        actor: "Platform Admin", // display name lives in meta
      },
      createdAt: new Date("2026-08-09T10:00:00.000Z"),
    });
    expect(entry.id).toBe("cuid-act-1");
    expect(entry.actionEn).toBe("Push subscription pruned: …");
    expect(entry.actionAr).toBe("إزالة اشتراك إشعارات: …");
    expect(entry.actor).toBe("Platform Admin");
    expect(entry.actorId).toBe("cuid-admin-9"); // separate FK reference
    expect(entry.actorUser).toEqual({
      id: "cuid-admin-9",
      name: "Platform Admin",
      email: "admin@workersarena.com",
      hue: 280,
      image: null,
    });
    expect(entry.type).toBe("system");
    expect(entry.code).toBe("PUSH_SUBSCRIPTION_PRUNED");
    expect(entry.time).toBe("2026-08-09T10:00:00.000Z");
  });

  it("round-trips the booking number from meta (prisma dispute deep link)", () => {
    const entry = rowToActivityEntry({
      id: "cuid-act-4",
      action: "BOOKING_CANCELLED",
      actorId: null,
      meta: {
        actionEn: "Sara cancelled BK-1002",
        actionAr: "ألغت سارة الحجز BK-1002",
        type: "booking",
        code: "BOOKING_CANCELLED",
        actor: "Sara Customer",
        bookingNo: "BK-1002",
      },
      createdAt: new Date("2026-08-09T11:00:00.000Z"),
    });
    expect(entry.type).toBe("booking");
    expect(entry.code).toBe("BOOKING_CANCELLED");
    expect(entry.bookingNo).toBe("BK-1002");
  });

  it("leaves bookingNo undefined for legacy rows without it", () => {
    const entry = rowToActivityEntry({
      id: "cuid-act-3",
      action: "SYSTEM",
      actorId: null,
      meta: { actor: "System" },
      createdAt: new Date("2026-08-09T10:00:00.000Z"),
    });
    expect(entry.actor).toBe("System");
    expect(entry.actorId).toBeUndefined();
    expect(entry.actorUser).toBeUndefined();
    expect(entry.bookingNo).toBeUndefined();
  });

  it("uses the action column as the code and actorId column for legacy rows without meta", () => {
    const entry = rowToActivityEntry({
      id: "cuid-act-2",
      action: "VERIFICATION",
      actorId: "cuid-admin-7",
      meta: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(entry.actionEn).toBe("VERIFICATION");
    expect(entry.actionAr).toBe("VERIFICATION");
    expect(entry.actor).toBe("cuid-admin-7");
    expect(entry.actorId).toBe("cuid-admin-7");
    expect(entry.type).toBe("system");
    expect(entry.code).toBe("VERIFICATION");
  });
});

describe("push-prune cron route", () => {
  let activityFile: string;
  let routeGet: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    activityFile = path.join(tmpdir(), `activity-cron-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
    vi.stubEnv("CRON_SECRET", "test-secret");
    // No VAPID keys in the test env → the probe is a benign no-op.
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    const { GET } = await import("../src/app/api/cron/push-prune/route");
    routeGet = GET;
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
    await clearPushSubscriptions();
  });

  it("rejects requests without the cron secret (401)", async () => {
    const res = await routeGet(new Request("http://localhost/api/cron/push-prune"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("accepts the secret via header and runs the cleanup", async () => {
    await registerPushSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "a", auth: "b" } });
    const res = await routeGet(
      new Request("http://localhost/api/cron/push-prune", { headers: { "x-cron-secret": "test-secret" } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pruned: string[]; kept: number };
    expect(body.ok).toBe(true);
    expect(body.pruned).toEqual([]);
    expect(body.kept).toBe(1); // no VAPID → nothing probed, nothing removed
  });

  it("accepts the secret as a query param", async () => {
    const res = await routeGet(new Request("http://localhost/api/cron/push-prune?secret=test-secret"));
    expect(res.status).toBe(200);
  });
});

describe("activity-prune cron route", () => {
  let activityFile: string;
  let routeGet: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    activityFile = path.join(tmpdir(), `activity-prune-cron-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
    vi.stubEnv("CRON_SECRET", "test-secret");
    const { GET } = await import("../src/app/api/cron/activity-prune/route");
    routeGet = GET;
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
  });

  it("rejects requests without the cron secret (401)", async () => {
    const res = await routeGet(new Request("http://localhost/api/cron/activity-prune"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("accepts the secret via header and returns retention counts", async () => {
    await logAdminActivity({ actionEn: "Fresh", actionAr: "جديد", actor: "System", type: "system" });
    const res = await routeGet(
      new Request("http://localhost/api/cron/activity-prune", { headers: { "x-cron-secret": "test-secret" } })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; retentionDays: number; removed: number; remaining: number };
    expect(body.ok).toBe(true);
    expect(body.retentionDays).toBe(90);
    expect(body.removed).toBe(0);
    expect(body.remaining).toBe(1); // fresh entry survives
  });

  it("accepts the secret as a query param", async () => {
    const res = await routeGet(new Request("http://localhost/api/cron/activity-prune?secret=test-secret"));
    expect(res.status).toBe(200);
  });
});

describe("push test send", () => {
  let activityFile: string;

  beforeEach(() => {
    activityFile = path.join(tmpdir(), `activity-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
    await clearPushSubscriptions();
  });

  it("reports vapid-unconfigured without VAPID keys", async () => {
    const result = await sendTestPushSubscription("https://push.example/x");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("vapid-unconfigured");
  });

  it("reports not-found for an unregistered endpoint", async () => {
    // VAPID set so the lookup path runs (it finds nothing and returns early).
    vi.stubEnv("VAPID_PUBLIC_KEY", "k");
    vi.stubEnv("VAPID_PRIVATE_KEY", "k");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    const result = await sendTestPushSubscription("https://push.example/never-registered");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not-found");
  });
});

describe("push prune cleanup", () => {
  let activityFile: string;

  beforeEach(() => {
    activityFile = path.join(tmpdir(), `activity-prune-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  });

  afterEach(async () => {
    await resetAdminActivityFeed();
    await rm(activityFile, { force: true }).catch(() => {});
    await clearPushSubscriptions();
  });

  it("is a benign no-op without VAPID keys (nothing can be probed)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");
    await registerPushSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "a", auth: "b" } });
    const result = await pruneDeadPushSubscriptions();
    expect(result.pruned).toEqual([]);
    expect(result.kept).toBe(1); // not removed without a probe
    expect(await getPushSubscriptions()).toHaveLength(1);
    expect(await getAdminActivityFeed()).toHaveLength(0);
  });

  it("returns empty results when there are no subscriptions", async () => {
    const result = await pruneDeadPushSubscriptions();
    expect(result).toEqual({ pruned: [], kept: 0 });
  });
});

describe("push owner stamp (demo vs real auth)", () => {
  it("demo cookie sessions (u-…, no user row) stamp the non-FK ownerId", () => {
    expect(pushOwnerStamp({ id: "u-worker" })).toEqual({ ownerId: "u-worker" });
    expect(pushOwnerStamp({ id: "u-admin" })).toEqual({ ownerId: "u-admin" });
  });

  it("real auth user ids stamp the userId FK", () => {
    expect(pushOwnerStamp({ id: "clx-realuid" })).toEqual({ userId: "clx-realuid" });
    // No ownerId leaked alongside the FK stamp.
    expect(pushOwnerStamp({ id: "clx-realuid" }).ownerId).toBeUndefined();
  });
});

describe("inbox adapter selection (dual adapter)", () => {
  // Restore demo-mode env so the rest of the suite stays on the in-memory store.
  const restoreDemoMode = () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
  };

  it("uses the in-memory store in demo mode (no DATABASE_URL)", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
    expect(inboxAdapterMode()).toBe("demo");
    restoreDemoMode();
  });

  it("stays in-memory in demo mode even with a DATABASE_URL set", () => {
    // Mirrors .env: DEMO_MODE=true with a placeholder DB URL — the app must NOT
    // try to persist the inbox to an unreachable database.
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/workersarena");
    expect(inboxAdapterMode()).toBe("demo");
    restoreDemoMode();
  });

  it("uses the Prisma adapter only when demo mode is OFF and a database is configured", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://prod");
    expect(inboxAdapterMode()).toBe("prisma");
    restoreDemoMode();
  });
});

describe("inbox row mapping (prisma → app shape)", () => {
  it("maps a DB row back to the app Notification losslessly (type + href via data)", () => {
    const row = {
      id: "cuid1",
      type: "PROMO", // coarser DB enum — original app type lives in data.type
      titleEn: "Campaign live",
      titleAr: "الحملة نشطة",
      bodyEn: "body",
      bodyAr: "نص",
      data: { href: "/company", type: "campaign" },
      isRead: false,
      createdAt: new Date("2026-08-09T10:00:00.000Z"),
    };
    const n = rowToNotification(row);
    expect(n.type).toBe("campaign");
    expect(n.href).toBe("/company");
    expect(n.time).toBe("2026-08-09T10:00:00.000Z");
    expect(n.read).toBe(false);
  });

  it("falls back to the DB enum for rows without data.type (older rows)", () => {
    const n = rowToNotification({
      id: "cuid2",
      type: "SUBSCRIPTION_REMINDER",
      titleEn: "Renews soon",
      titleAr: "يتجدد قريباً",
      bodyEn: null,
      bodyAr: null,
      data: null,
      isRead: true,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(n.type).toBe("subscription");
    expect(n.bodyEn).toBe("");
    expect(n.href).toBeUndefined();
  });
});

describe("inbox persistence + dispatch wiring", () => {
  it("pushNotification persists the inbox record", async () => {
    const before = (await getNotifications()).length;
    const item = await pushNotification(
      { type: "lead", titleEn: "New lead", titleAr: "عميل جديد", bodyEn: "b", bodyAr: "ب", href: "/dashboard" },
      { name: "Khaled", email: "khaled@plumbfix.sa" }
    );
    const after = (await getNotifications()).length;
    expect(after).toBe(before + 1);
    expect(item.read).toBe(false);
    expect(item.id).toBeTruthy();
    expect((await getNotifications())[0].id).toBe(item.id);
  });
});

describe("review & lead notifications (closing the loop)", () => {
  it("addReview pushes a review notification to the worker", async () => {
    const w = WORKERS[0]!;
    const original = { rating: w.rating, reviewCount: w.reviewCount, reviewsLength: w.reviews.length };
    try {
      const before = (await getNotifications()).length;
      const result = await addReview(w.id, {
        author: "Noor",
        rating: 5,
        textEn: "Excellent work",
        textAr: "عمل ممتاز",
        verifiedPurchase: true,
      });
      expect(result).not.toBeNull();
      const top = (await getNotifications())[0]!;
      expect(top.type).toBe("review");
      expect(top.titleEn).toContain("5-star");
      expect(top.titleAr).toContain("5 نجوم");
      expect(top.bodyEn).toContain("Noor");
      expect(top.href).toBe(`/workers/${w.slug}`);
      expect((await getNotifications()).length).toBe(before + 1);
    } finally {
      w.rating = original.rating;
      w.reviewCount = original.reviewCount;
      // Drop the review this test added (only if one was actually added).
      if (w.reviews.length > original.reviewsLength) w.reviews.shift();
    }
  });

  it("addLead pushes a lead notification to the worker", async () => {
    const w = WORKERS[1]!;
    const original = w.leads;
    try {
      const before = (await getNotifications()).length;
      const result = await addLead(w.id);
      expect(result).not.toBeNull();
      const top = (await getNotifications())[0]!;
      expect(top.type).toBe("lead");
      expect(top.titleEn).toBe("New service request");
      expect(top.titleAr).toBe("طلب خدمة جديد");
      expect(w.leads).toBe(original + 1);
      expect((await getNotifications()).length).toBe(before + 1);
    } finally {
      w.leads = original;
    }
  });

  it("addReview on an unknown worker is a no-op (no notification)", async () => {
    const before = (await getNotifications()).length;
    const result = await addReview("nope", { author: "X", rating: 5, textEn: "t", textAr: "ت" });
    expect(result).toBeNull();
    expect((await getNotifications()).length).toBe(before);
  });
});

describe("expiry reminder engine", () => {
  it("finds workers due for 7/3/1-day or expired reminders", () => {
    const due = workersDueReminders();
    expect(due.length).toBeGreaterThan(0);
    // The demo dataset includes an expired worker + workers in reminder windows.
    const kinds = new Set(due.map((d) => d.kind));
    expect(kinds.has("reminder") || kinds.has("expired")).toBe(true);
    for (const d of due) {
      expect(d.key).toMatch(/^(reminder|expired):/);
    }
  });

  it("skips workers whose seeded reminder is already in the inbox (no duplicates)", async () => {
    resetReminderEngine();
    const run = await runDueReminderEngine();
    // The demo seed already placed one reminder per due worker — the first cron
    // run must not duplicate them.
    expect(run.dispatched).toBe(0);
    expect(run.alreadySent).toBe(run.total);
    expect(run.total).toBeGreaterThan(0);

    // Re-runs stay stable.
    const again = await runDueReminderEngine();
    expect(again.dispatched).toBe(0);
    expect(again.alreadySent).toBe(run.total);
  });

  it("dispatches a reminder for a worker that becomes due after seeding, once per process", async () => {
    resetReminderEngine();
    const w = WORKERS.find((x) => subscriptionStatus(x.subscription) === "active")!;
    const original = w.subscription.expiresAt;
    try {
      const before = (await getNotifications()).length;
      // Force a 3-day window — no seeded reminder id exists for this key.
      w.subscription.expiresAt = new Date(Date.now() + 3 * 86400000).toISOString();

      const first = await runDueReminderEngine();
      expect(first.dispatched).toBeGreaterThanOrEqual(1);
      expect((await getNotifications()).length).toBe(before + first.dispatched);

      // Second run: deduped via the per-process sentKeys set.
      const second = await runDueReminderEngine();
      expect(second.dispatched).toBe(0);
      expect(second.alreadySent).toBeGreaterThanOrEqual(1);
    } finally {
      w.subscription.expiresAt = original;
    }
  });

  it("dispatches reminders for real workers with their email address", async () => {
    resetReminderEngine();
    const due = workersDueReminders();
    const w = WORKERS.find((x) => x.id === due[0]!.worker.id)!;
    expect(w.email).toBeTruthy();
    expect(w.phone).toBeTruthy();
  });
});
