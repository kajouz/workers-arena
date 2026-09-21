/**
 * Session control for action-level tests.
 *
 * The booking server actions resolve the caller before mutating anything
 * (src/lib/data/authz.ts), so a suite that drives them has to say WHO is
 * acting. `getSession()` reads next/headers, which has no meaning under
 * vitest — it returns null and every action refuses. This helper mocks the
 * auth module and hands the suite a switch.
 *
 * Usage — the vi.mock call must come before the action import, and the mock
 * factory is hoisted, so wire it through vi.hoisted in the suite:
 *
 *     const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
 *     vi.mock("@/lib/auth-demo", async (importOriginal) => ({
 *       ...(await importOriginal<object>()),
 *       getSession: getSessionMock,
 *     }));
 *     beforeEach(() => getSessionMock.mockResolvedValue(ACTING.worker));
 *
 * The identities below are the real demo accounts (DEMO_USERS), matched
 * against the seeded bk-1001 booking: worker `u-worker` resolves to the
 * khaled-plum profile through getWorkerByUserId, and customer `u-customer`
 * is that booking's customerId. Using the real ids keeps these tests honest —
 * a suite that invented its own would pass while the app refused.
 */
import type { SessionUser } from "@/lib/auth-demo";

export const ACTING: Record<"customer" | "worker" | "company" | "admin", SessionUser> = {
  customer: { id: "u-customer", name: "Sara Customer", email: "sara@example.com", role: "customer", hue: 200 },
  worker: { id: "u-worker", name: "Khaled Al-Harbi", email: "khaled@plumbfix.lb", role: "worker", hue: 25 },
  company: { id: "u-company", name: "BuildCo Ltd", email: "ads@buildco.lb", role: "company", hue: 150 },
  admin: { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 },
};

/** A signed-in identity that is party to nothing — the "stranger" case. */
export const STRANGER: SessionUser = {
  id: "u-stranger",
  name: "Nadia Stranger",
  email: "nadia@example.com",
  role: "customer",
  hue: 90,
};
