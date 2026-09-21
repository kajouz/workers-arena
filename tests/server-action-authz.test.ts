/**
 * ────────────────────────────────────────────────────────────────────────────
 * EVERY SERVER ACTION MUST RESOLVE ITS CALLER
 * ────────────────────────────────────────────────────────────────────────────
 * Server Actions are public HTTP endpoints. Their action ids ship in the
 * client bundle, and the origin check in src/proxy.ts only fires when an
 * `Origin` header is present — it deliberately lets header-less
 * server-to-server calls through — so a scripted POST reaches them directly.
 *
 * Sixteen of the booking actions used to act on a caller-supplied id with no
 * check at all: `confirmPaymentAction` marked any booking PAID with a made-up
 * provider reference, `respondBookingAction` set the quote and deposit on
 * anyone's job, `setSlotBlockedAction` emptied a competitor's calendar.
 *
 * This suite has two layers:
 *
 *  1. A STATIC sweep over every module in src/app/actions/. Each exported
 *     action must either reference the authz seam or appear in
 *     PUBLIC_ACTIONS with a written reason. New actions fail closed — the
 *     point is that forgetting is caught here rather than in production.
 *
 *  2. BEHAVIOURAL checks driving the highest-value booking actions with an
 *     anonymous session and a stranger's session, asserting they refuse.
 *
 * The static layer is deliberately crude (a source scan, not type analysis):
 * it cannot prove the check is CORRECT, only that one is present. Layer 2 and
 * the per-feature suites prove correctness.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { ACTING, STRANGER } from "./helpers/acting-session";
import { resetBookingsStore } from "@/lib/data/bookings";

const ACTIONS_DIR = join(process.cwd(), "src/app/actions");

/**
 * Markers that count as "this action resolves its caller" — the authz seam's
 * helpers plus the direct `getSession()` gate the older actions use.
 */
const AUTHZ_MARKERS = [
  "resolveBookingParty",
  "requireBookingWorker",
  "requireBookingCustomer",
  "resolveRecurringParty",
  "resolveQuoteRequestParty",
  "requireWorkerProfile",
  "requireRole",
  "resolveChatParty",
  // Module-local gates that predate the authz seam and resolve the caller
  // themselves (leads.ts derives the acting worker from the session).
  "sessionWorkerId(",
  "getSession(",
];

/**
 * Actions that are public ON PURPOSE. Each entry must say why — an action
 * lands here only when an anonymous visitor genuinely has to reach it.
 */
const PUBLIC_ACTIONS: Record<string, string> = {
  "bookings.ts:availableSlotsAction":
    "Public read of a worker's future AVAILABLE slots — the same list the signed-out booking dialog renders on the public profile page.",
  "bookings.ts:requestRecurringBookingAction":
    "Guest booking entry point: a signed-out visitor starts a maintenance contract from the public profile. Reads the session only to stamp the owner.",
  "auth.ts:loginAction": "Sign-in — reached without a session by definition.",
  "auth.ts:registerAction": "Sign-up — reached without a session by definition.",
  "auth.ts:logoutAction": "Sign-out — safe and idempotent for an anonymous caller.",
  "auth.ts:loginDemoAction":
    "Demo-account sign-in from /auth/login — reached without a session by definition, and it refuses to mint a demo session unless demo mode is on.",
  "auth.ts:trackViewAction":
    "Profile-view ping fired by every visitor on a public worker page. Spammable by design (view-count inflation); the proxy's POST bucket is the only limit and a signed view token is the follow-up.",
  "auth.ts:submitReviewAction":
    "Public review form on a public profile — customers review without accounts. Reviews are moderated before publication (src/lib/ai/review-moderation.ts).",
  "auth.ts:requestServiceAction":
    "Public 'request service' lead from a worker profile, the signed-out equivalent of a booking request.",
};

interface ActionRef {
  file: string;
  name: string;
  body: string;
}

/** Every exported async function in src/app/actions/, with its body. */
function collectActions(): ActionRef[] {
  const out: ActionRef[] = [];
  for (const file of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(ACTIONS_DIR, file), "utf8");
    const re = /^export async function (\w+)\s*\(/gm;
    const starts: { name: string; at: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
      out.push({ file, name: s.name, body: src.slice(s.at, end) });
    });
  }
  return out;
}

describe("server actions — static authz sweep", () => {
  const actions = collectActions();

  it("finds the action modules (guards against a silently empty sweep)", () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it("every exported action resolves its caller, or is an allowlisted public action", () => {
    const unguarded = actions
      .filter((a) => !AUTHZ_MARKERS.some((marker) => a.body.includes(marker)))
      .filter((a) => !(`${a.file}:${a.name}` in PUBLIC_ACTIONS))
      .map((a) => `${a.file}:${a.name}`);

    expect(
      unguarded,
      "Server Actions are public endpoints. These act on caller-supplied input with no " +
        "caller resolution:\n  " +
        unguarded.join("\n  ") +
        "\n\nAdd a check from src/lib/data/authz.ts, or — if an anonymous visitor really " +
        "must reach it — add it to PUBLIC_ACTIONS in this file with a reason."
    ).toEqual([]);
  });

  it("has no stale PUBLIC_ACTIONS entries", () => {
    const live = new Set(actions.map((a) => `${a.file}:${a.name}`));
    const stale = Object.keys(PUBLIC_ACTIONS).filter((k) => !live.has(k));
    expect(stale, `PUBLIC_ACTIONS names actions that no longer exist:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  it("no action takes the ACTING party's identity out of its own FormData", () => {
    // `by` used to arrive from the client on cancel/reschedule, letting either
    // party sign the other's name to an audit event — and the deposit-refund
    // policy reads that field. Who is acting must come from the session.
    //
    // Scoped to actor fields only: a registration form legitimately carries a
    // `role` for the account being CREATED, which is not a claim about who is
    // calling.
    const offenders = collectActions()
      .filter((a) => /formData\.get\(["'](by|actor|actingAs|asRole)["']\)/.test(a.body))
      .map((a) => `${a.file}:${a.name}`);
    expect(
      offenders,
      `These actions take an identity from client-controlled form data:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("booking actions — anonymous and stranger callers are refused", () => {
  beforeEach(() => {
    resetBookingsStore();
  });

  /**
   * bk-1001 is the seeded REQUESTED booking: worker khaled-plum, customer
   * u-customer. Every action below acts on it by id alone, which is exactly
   * what an attacker would have.
   */
  const CASES: { name: string; run: () => Promise<{ ok: boolean; error?: string }> }[] = [
    {
      name: "respondBookingAction (sets the quote and deposit)",
      run: async () => {
        const { respondBookingAction } = await import("@/app/actions/bookings");
        const fd = new FormData();
        fd.set("accept", "true");
        fd.set("quote", "1");
        return respondBookingAction("bk-1001", fd);
      },
    },
    {
      name: "transitionBookingAction (moves the booking's state)",
      run: async () => {
        const { transitionBookingAction } = await import("@/app/actions/bookings");
        return transitionBookingAction("bk-1001", "completed");
      },
    },
    {
      name: "confirmCompletionAction (releases the worker's earnings)",
      run: async () => {
        const { confirmCompletionAction } = await import("@/app/actions/bookings");
        return confirmCompletionAction("bk-1001");
      },
    },
    {
      name: "cancelBookingAction (frees the slot, decides the refund)",
      run: async () => {
        const { cancelBookingAction } = await import("@/app/actions/bookings");
        return cancelBookingAction("bk-1001", new FormData());
      },
    },
    {
      name: "rescheduleBookingAction (moves the job to another slot)",
      run: async () => {
        const { rescheduleBookingAction } = await import("@/app/actions/bookings");
        const fd = new FormData();
        fd.set("targetSlotId", "slot-khaled-1");
        return rescheduleBookingAction("bk-1001", fd);
      },
    },
    {
      name: "payBookingAction (mints a checkout for the booking)",
      run: async () => {
        const { payBookingAction } = await import("@/app/actions/bookings");
        return payBookingAction("bk-1001");
      },
    },
    {
      name: "confirmPaymentAction (marks the booking PAID)",
      run: async () => {
        const { confirmPaymentAction } = await import("@/app/actions/bookings");
        return confirmPaymentAction("bk-1001", "forged-ref");
      },
    },
    {
      name: "submitQuoteAction (posts a bid as the worker)",
      run: async () => {
        const { submitQuoteAction } = await import("@/app/actions/bookings");
        const fd = new FormData();
        fd.set("quote", "1");
        return submitQuoteAction("bk-1001", fd);
      },
    },
    {
      name: "generateSlotsAction (writes onto a worker's calendar)",
      run: async () => {
        const { generateSlotsAction } = await import("@/app/actions/bookings");
        return generateSlotsAction("khaled-al-harbi-plumbing", new FormData());
      },
    },
    {
      name: "setSlotBlockedAction (blocks a worker's availability)",
      run: async () => {
        const { setSlotBlockedAction } = await import("@/app/actions/bookings");
        const fd = new FormData();
        fd.set("slotId", "slot-khaled-1");
        fd.set("blocked", "true");
        return setSlotBlockedAction("khaled-al-harbi-plumbing", fd);
      },
    },
  ];

  for (const { name, run } of CASES) {
    it(`${name} refuses an anonymous caller`, async () => {
      getSessionMock.mockResolvedValue(null);
      expect(await run()).toMatchObject({ ok: false, error: "unauthorized" });
    });

    it(`${name} refuses a signed-in stranger`, async () => {
      getSessionMock.mockResolvedValue(STRANGER);
      expect(await run()).toMatchObject({ ok: false, error: "unauthorized" });
    });
  }

  it("a worker cannot confirm completion on the customer's behalf", async () => {
    // The confirmation is what releases the money — the party that pays is the
    // party that signs off.
    const { confirmCompletionAction } = await import("@/app/actions/bookings");
    getSessionMock.mockResolvedValue(ACTING.worker);
    expect(await confirmCompletionAction("bk-1001")).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });

  it("a customer cannot accept their own booking or set its price", async () => {
    const { respondBookingAction } = await import("@/app/actions/bookings");
    getSessionMock.mockResolvedValue(ACTING.customer);
    const fd = new FormData();
    fd.set("accept", "true");
    fd.set("quote", "1");
    expect(await respondBookingAction("bk-1001", fd)).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });

  it("a worker cannot block a calendar that is not theirs", async () => {
    const { setSlotBlockedAction } = await import("@/app/actions/bookings");
    getSessionMock.mockResolvedValue(ACTING.worker); // khaled
    const fd = new FormData();
    fd.set("slotId", "slot-jad-1");
    fd.set("blocked", "true");
    expect(await setSlotBlockedAction("jad-el-khoury-electrical", fd)).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });
});
