"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-demo";
import { decidePayout, requestPayout } from "@/lib/data/repo";
import { getSessionWorker } from "@/lib/data/authz";
import { feeClaimBlock } from "@/lib/data/payment-workflow-engine";

/**
 * Worker withdraws part of their available earnings (docs/payouts.md). The
 * amount comes in MAJOR units from the UI and is converted to minor ×100,
 * exactly like the booking quote/deposit actions. Creates a PENDING payout
 * that an admin approves or rejects; the balance only moves on approval.
 */
export async function requestPayoutAction(
  workerId: string,
  amountMajor: number,
  reason?: string
): Promise<{ ok: boolean; error?: "unauthorized" | "invalid" | "insufficient" | "fee-claim-overdue" }> {
  const session = await getSession();
  if (!session || session.role !== "worker") return { ok: false, error: "unauthorized" };
  if (!workerId) return { ok: false, error: "invalid" };
  // The worker may only withdraw from their OWN balance (the role check alone
  // let any worker file a payout against another worker's earnings).
  const own = await getSessionWorker(session);
  if (!own || own.id !== workerId) return { ok: false, error: "unauthorized" };
  // Workflow v2 — an overdue outside-platform fee claim blocks withdrawals.
  if ((await feeClaimBlock(workerId)).blocked) return { ok: false, error: "fee-claim-overdue" };
  const minor = Math.round(Number(amountMajor) * 100);
  if (!Number.isFinite(minor) || minor <= 0) return { ok: false, error: "invalid" };
  const result = await requestPayout(workerId, minor, reason?.trim() || undefined);
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Admin approves or rejects a PENDING payout (docs/payouts.md §4). The reason
 * is recorded on the ledger row (review audit); the admin's session id stamps
 * reviewedBy on the prisma path. Approve → the withdrawal becomes a debit.
 */
export async function decidePayoutAction(
  payoutId: string,
  approve: boolean,
  reason?: string
): Promise<{ ok: boolean; error?: "unauthorized" | "invalid" }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  if (!payoutId) return { ok: false, error: "invalid" };
  const decided = await decidePayout(payoutId, approve, reason?.trim() || undefined, session.id);
  if (!decided) return { ok: false, error: "invalid" };
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}
