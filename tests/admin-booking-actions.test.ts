/**
 * §2.4 admin dispute-view actions — adminCancelBookingAction and
 * refundBookingDepositAction: the admin-only permission gate, the required
 * reason, and the exact seam input each action forwards (by: "admin" +
 * adminName for the cancel; reason + adminName for the refund). Session and
 * the repo seam are mocked; the payloads the seam receives are asserted
 * verbatim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminCancelBookingAction, refundBookingDepositAction } from "@/app/actions/bookings";
import type { Booking } from "@/lib/data/types";

const {
  getSessionMock,
  cancelBookingMock,
  refundBookingDepositMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  cancelBookingMock: vi.fn(),
  refundBookingDepositMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth-demo", () => ({ getSession: getSessionMock }));
vi.mock("@/lib/data/repo", () => ({
  cancelBooking: cancelBookingMock,
  refundBookingDeposit: refundBookingDepositMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const booking: Booking = {
  id: "bk-1001",
  number: "BK-1001",
  workerId: "w-khaled",
  customerName: "Sara Customer",
} as unknown as Booking;

function reasonFd(reason: string) {
  const f = new FormData();
  f.set("reason", reason);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelBookingMock.mockResolvedValue(booking);
  refundBookingDepositMock.mockResolvedValue(booking);
});

describe("adminCancelBookingAction", () => {
  it("rejects a signed-out session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await adminCancelBookingAction("bk-1001", reasonFd("Duplicate"))).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it("rejects a non-admin role", async () => {
    getSessionMock.mockResolvedValue({ id: "u-sara", email: "sara@example.com", role: "customer" });
    expect(await adminCancelBookingAction("bk-1001", reasonFd("Duplicate"))).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it("refuses a missing or blank reason", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    expect(await adminCancelBookingAction("bk-1001", reasonFd("  "))).toEqual({
      ok: false,
      error: "reason",
    });
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it("forwards by: admin + the admin's name and the trimmed reason", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    const res = await adminCancelBookingAction("bk-1001", reasonFd("  Duplicate booking  "));
    expect(res).toEqual({ ok: true });
    expect(cancelBookingMock).toHaveBeenCalledWith("bk-1001", {
      by: "admin",
      reason: "Duplicate booking",
      adminName: "Amina Admin",
    });
  });

  it("maps not-found through", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    cancelBookingMock.mockResolvedValue(null);
    expect(await adminCancelBookingAction("nope", reasonFd("x"))).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});

describe("refundBookingDepositAction", () => {
  it("rejects a non-admin", async () => {
    getSessionMock.mockResolvedValue({ id: "w-khaled", role: "worker" });
    expect(await refundBookingDepositAction("bk-1001", reasonFd("Dispute resolved"))).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(refundBookingDepositMock).not.toHaveBeenCalled();
  });

  it("refuses a missing reason", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    expect(await refundBookingDepositAction("bk-1001", reasonFd(""))).toEqual({
      ok: false,
      error: "reason",
    });
    expect(refundBookingDepositMock).not.toHaveBeenCalled();
  });

  it("forwards the trimmed reason + the admin's name", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    const res = await refundBookingDepositAction("bk-1001", reasonFd("  Dispute resolved  "));
    expect(res).toEqual({ ok: true });
    expect(refundBookingDepositMock).toHaveBeenCalledWith("bk-1001", {
      reason: "Dispute resolved",
      adminName: "Amina Admin",
    });
  });

  it("maps not-found through", async () => {
    getSessionMock.mockResolvedValue({ id: "a1", name: "Amina Admin", role: "admin" });
    refundBookingDepositMock.mockResolvedValue(null);
    expect(await refundBookingDepositAction("nope", reasonFd("x"))).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});
